const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function cleanHtml(str: string): string {
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function extractBibField(html: string, code: string): string | null {
  // Pattern: (CODE) <i>label</i> ... <b>VALUE</b>
  // or: (CODE) <i>label</i><br><b>VALUE</b>
  const regex = new RegExp(
    `\\(${code}\\)\\s*<i>[^<]*</i>[\\s\\S]*?<b>([\\s\\S]*?)</b>`,
    'i'
  );
  const match = html.match(regex);
  if (match?.[1]) {
    const val = cleanHtml(match[1]);
    if (val) return val;
  }
  return null;
}

function extractImageUrl(html: string): string | null {
  // Look for (540) section with img tag
  const section = html.match(/\(540\)[\s\S]{0,3000}?(?=<p class="bib">|\s*$)/i);
  if (section) {
    const imgMatch = section[0].match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
      let url = imgMatch[1];
      if (url.startsWith('/')) url = 'https://fips.ru' + url;
      return url;
    }
  }
  return null;
}

function extractStatus(html: string): boolean | null {
  const statusMatch = html.match(/class="Status"[\s\S]*?<td[^>]*class="(\w+)"[^>]*>\s*Статус:\s*([\s\S]*?)<\/td>/i);
  if (statusMatch) {
    const text = statusMatch[2].toLowerCase();
    if (text.includes('не действу') || text.includes('прекращ') || text.includes('аннулир')) return false;
    if (text.includes('действу')) return true;
  }
  // Fallback
  const alt = html.match(/Статус:\s*\n?\s*(действует|не действует|прекращ)/i);
  if (alt) {
    return !alt[1].toLowerCase().startsWith('не') && !alt[1].toLowerCase().startsWith('прекращ');
  }
  return null;
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  const dmy = cleaned.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.substring(0, 10);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { registration_number } = await req.json();
    if (!registration_number) {
      return new Response(JSON.stringify({ error: 'registration_number is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const num = registration_number.toString().replace(/\D/g, '');
    const url = `https://fips.ru/registers-doc-view/fips_servlet?DB=RUTM&DocNumber=${num}&TypeFile=html`;

    console.log('Fetching FIPS URL:', url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'identity',
        },
        redirect: 'follow',
      });
      console.log('FIPS response status:', response.status);
    } catch (e) {
      clearTimeout(timeout);
      console.error('FIPS fetch error:', e.message);
      return new Response(JSON.stringify({ error: `Не удалось подключиться к ФИПС: ${e.message}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `ФИПС вернул ошибку: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    console.log('HTML length:', html.length);

    if (html.includes('Документ не найден') || html.includes('не найден') || html.length < 500) {
      return new Response(JSON.stringify({ error: `Товарный знак №${num} не найден в реестре ФИПС` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract right holder - special handling: (732) ... <br><b>Name (CC)</b>
    let rightHolder = extractBibField(html, '732');
    // Remove country code like "(RU)" from end
    if (rightHolder) {
      rightHolder = rightHolder.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
    }

    const data: Record<string, any> = {
      registration_number: num,
      registration_date: parseDate(extractBibField(html, '151')),
      application_number: extractBibField(html, '210'),
      priority_date: parseDate(extractBibField(html, '220')),
      expiry_date: parseDate(extractBibField(html, '181')),
      right_holder_name: rightHolder,
      correspondence_address: extractBibField(html, '750'),
      image_url: extractImageUrl(html),
      color_specification: extractBibField(html, '591'),
      unprotected_elements: extractBibField(html, '526'),
      classes_mktu: extractBibField(html, '511'),
      transliteration: extractBibField(html, '441'),
      actual: extractStatus(html),
      fips_url: url,
    };

    // Clean null/empty values
    Object.keys(data).forEach(k => {
      if (data[k] === null || data[k] === undefined || data[k] === '') {
        delete data[k];
      }
    });

    console.log('Extracted fields:', Object.keys(data).join(', '));

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
