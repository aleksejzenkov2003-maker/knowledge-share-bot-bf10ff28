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
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBibField(html: string, code: string): string | null {
  // The FIPS HTML uses <p class="bib"> blocks with pattern:
  // (CODE) <i>label</i> ... <b>VALUE</b>
  // Find the section starting with (CODE) and extract bold text after it
  
  // First, try to find within <p class="bib"> blocks
  const bibBlocks = html.match(/<p class="bib">[^]*?<\/p>/gi) || [];
  
  for (const block of bibBlocks) {
    if (block.includes(`(${code})`)) {
      // Extract all <b>...</b> content from this block
      const boldMatches = block.match(/<b>([\s\S]*?)<\/b>/gi);
      if (boldMatches && boldMatches.length > 0) {
        // Get the first bold value (skip if it's just a link with the code number itself)
        for (const bm of boldMatches) {
          const val = cleanHtml(bm);
          if (val && val !== code && val.length > 0) {
            return val;
          }
        }
      }
    }
  }
  
  // Fallback: search anywhere in HTML
  const fallbackRegex = new RegExp(
    `\\(${code}\\)[\\s\\S]*?<b>([\\s\\S]*?)<\\/b>`,
    'i'
  );
  const match = html.match(fallbackRegex);
  if (match?.[1]) {
    const val = cleanHtml(match[1]);
    if (val && val !== code) return val;
  }
  
  return null;
}

function extractImageUrl(html: string): string | null {
  const section = html.match(/\(540\)[\s\S]{0,3000}/i);
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

function extractFullImageUrl(html: string): string | null {
  // Get the full-size image link (not thumbnail)
  const section = html.match(/\(540\)[\s\S]{0,3000}/i);
  if (section) {
    const linkMatch = section[0].match(/<a[^>]+href=["']([^"']+\.jpg)["']/i);
    if (linkMatch?.[1]) {
      let url = linkMatch[1];
      if (url.startsWith('/')) url = 'https://fips.ru' + url;
      return url;
    }
  }
  return null;
}

function extractStatus(html: string): boolean | null {
  const statusMatch = html.match(/class="Status"[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
  if (statusMatch) {
    const text = statusMatch[1].toLowerCase();
    if (text.includes('не действу') || text.includes('прекращ') || text.includes('аннулир')) return false;
    if (text.includes('действу')) return true;
  }
  return null;
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const dmy = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.substring(0, 10);
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

    if (html.includes('Документ не найден') || html.length < 500) {
      return new Response(JSON.stringify({ error: `Товарный знак №${num} не найден в реестре ФИПС` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Debug: log bib blocks count
    const bibBlocks = html.match(/<p class="bib">/gi) || [];
    console.log('Found bib blocks:', bibBlocks.length);

    // Extract fields
    let rightHolder = extractBibField(html, '732');
    if (rightHolder) {
      rightHolder = rightHolder.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
    }

    const classesRaw = extractBibField(html, '511');
    // Truncate classes to first 500 chars for preview
    const classesMktu = classesRaw && classesRaw.length > 500 
      ? classesRaw.substring(0, 500) + '...' 
      : classesRaw;

    const data: Record<string, any> = {
      registration_number: num,
      registration_date: parseDate(extractBibField(html, '151')),
      application_number: cleanHtml(extractBibField(html, '210') || ''),
      priority_date: parseDate(extractBibField(html, '220')),
      expiry_date: parseDate(extractBibField(html, '181')),
      right_holder_name: rightHolder,
      correspondence_address: extractBibField(html, '750'),
      image_url: extractImageUrl(html),
      image_url_full: extractFullImageUrl(html),
      color_specification: extractBibField(html, '591'),
      unprotected_elements: extractBibField(html, '526'),
      description_element: extractBibField(html, '550'),
      classes_mktu: classesMktu,
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
