// Тянет страницу заявки напрямую с fips.ru, извлекает таблицу "Делопроизводство"
// и базовые поля. Раньше использовал /parser/ на 91.228.221.227 — он больше не отдаёт файлы.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

const grabAfterCode = (plain: string, code: string): string | null => {
  const re = new RegExp(`\\(${code}\\)\\s*[^:]*:?\\s*([\\s\\S]*?)(?=\\(\\d{3}\\)|$)`, "i");
  const m = plain.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() || null : null;
};

const extractDeloTable = (html: string): string | null => {
  const idx = html.search(/Делопроизводство/);
  if (idx < 0) return null;
  const before = html.slice(0, idx);
  const tableStart = before.lastIndexOf("<table");
  if (tableStart < 0) return html.slice(idx, idx + 8000);
  let depth = 0;
  const re = /<\/?table\b[^>]*>/gi;
  re.lastIndex = tableStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase().startsWith("</")) {
      depth--;
      if (depth === 0) return html.slice(tableStart, m.index + m[0].length);
    } else depth++;
  }
  return null;
};

const fetchFipsByNumber = async (num: string): Promise<string | null> => {
  const url = `https://fips.ru/registers-doc-view/fips_servlet?DB=RUTMAP&DocNumber=${num}&TypeFile=html`;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
          Accept: "text/html",
          "Accept-Encoding": "identity",
        },
        redirect: "follow",
      });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const html = new TextDecoder("windows-1251").decode(buf);
      if (html.length < 500 || html.includes("Документ не найден")) return null;
      return html;
    } catch { /* retry */ }
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { file_path, application_number } = await req.json();

    let appNum = application_number as string | undefined;
    if (!appNum && typeof file_path === "string") {
      const m = file_path.match(/(\d{10})/);
      if (m) appNum = m[1];
    }
    if (!appNum) {
      return new Response(JSON.stringify({ error: "application_number или file_path обязательны" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await fetchFipsByNumber(appNum);
    if (!html) {
      return new Response(
        JSON.stringify({ success: true, data: { delo_html: null }, note: "Документ не найден на fips.ru" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const plain = cleanText(html);
    const data = {
      application_number: grabAfterCode(plain, "210") || appNum,
      submitted_date_raw: (plain.match(/\(200\)[^()]*?(\d{2}\.\d{2}\.\d{4})/) || [])[1] || null,
      submitted_at: parseDate((plain.match(/\(200\)[^()]*?(\d{2}\.\d{2}\.\d{4})/) || [])[1] || null),
      applicant_raw: grabAfterCode(plain, "731") || grabAfterCode(plain, "732"),
      correspondence_address_raw: grabAfterCode(plain, "750"),
      classes_raw: grabAfterCode(plain, "511"),
      color_specification_raw: grabAfterCode(plain, "591"),
      unprotected_elements_raw: grabAfterCode(plain, "526"),
      processing_status_raw:
        (plain.match(/Состояние делопроизводства:\s*([^()]+?)(?=\(|$)/i) || [])[1]?.trim() || null,
      delo_html: extractDeloTable(html),
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
