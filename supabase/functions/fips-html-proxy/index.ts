// Прокси к статическим HTML-файлам ФИПС, лежащим на сервере 91.228.221.227.
// Декодирует cp1251 → utf-8, извлекает таблицу "Делопроизводство" и базовые поля.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SOURCES = [
  "https://apt728.ru/parser",
  "http://91.228.221.227/parser",
];

const cleanText = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#13;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const parseDate = (v: string | null): string | null => {
  if (!v) return null;
  const m = v.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const grabAfterCode = (plain: string, code: string, stopCodes = /\(\d{3}\)/): string | null => {
  const re = new RegExp(`\\(${code}\\)\\s*[^:]*:?\\s*([\\s\\S]*?)(?=${stopCodes.source}|$)`, "i");
  const m = plain.match(re);
  if (!m) return null;
  const v = m[1].replace(/\s+/g, " ").trim();
  return v || null;
};

// Найти таблицу "Делопроизводство" целиком (две вложенные таблицы — исходящая/входящая).
const extractDeloTable = (html: string): string | null => {
  const idx = html.search(/Делопроизводство/);
  if (idx < 0) return null;
  // Ищем ближайшую открывающую <table> до этого слова — на странице ФИПС блок обёрнут таблицей.
  const before = html.slice(0, idx);
  const tableStart = before.lastIndexOf("<table");
  if (tableStart < 0) {
    // Fallback: возьмём кусок от слова до конца
    const tail = html.slice(idx, idx + 8000);
    return tail;
  }
  // Найти соответствующий </table> с учётом вложенности
  let depth = 0;
  const re = /<\/?table\b[^>]*>/gi;
  re.lastIndex = tableStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase().startsWith("</")) {
      depth--;
      if (depth === 0) {
        return html.slice(tableStart, m.index + m[0].length);
      }
    } else {
      depth++;
    }
  }
  return null;
};

const fetchHtml = async (filePath: string): Promise<string> => {
  let lastErr = "";
  for (const base of SOURCES) {
    try {
      const url = `${base}/${filePath}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        lastErr = `${url} → ${r.status}`;
        continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      // Если это SPA (мало байт + содержит <div id="root">) — пробуем следующий источник
      const headAscii = new TextDecoder("latin1").decode(buf.slice(0, 2048));
      if (buf.length < 2000 && headAscii.includes('id="root"')) {
        lastErr = `${url} → returned SPA shell, /parser/ not served`;
        continue;
      }
      // cp1251 по умолчанию для этих файлов
      const html = new TextDecoder("windows-1251").decode(buf);
      return html;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`Не удалось загрузить файл: ${lastErr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_path } = await req.json();
    if (!file_path || typeof file_path !== "string") {
      return new Response(JSON.stringify({ error: "file_path required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safe = file_path.replace(/^\/+/, "").replace(/\.\./g, "");
    const html = await fetchHtml(safe);

    const plain = cleanText(html);

    const deloHtml = extractDeloTable(html);

    const data = {
      application_number: grabAfterCode(plain, "210"),
      submitted_date_raw: (plain.match(/\(200\)[^()]*?(\d{2}\.\d{2}\.\d{4})/) || [])[1] || null,
      submitted_at: parseDate((plain.match(/\(200\)[^()]*?(\d{2}\.\d{2}\.\d{4})/) || [])[1] || null),
      applicant_raw: grabAfterCode(plain, "731") || grabAfterCode(plain, "732"),
      correspondence_address_raw: grabAfterCode(plain, "750"),
      classes_raw: grabAfterCode(plain, "511"),
      color_specification_raw: grabAfterCode(plain, "591"),
      unprotected_elements_raw: grabAfterCode(plain, "526"),
      processing_status_raw:
        (plain.match(/Состояние делопроизводства:\s*([^()]+?)(?=\(|$)/i) || [])[1]?.trim() || null,
      delo_html: deloHtml,
    };

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
