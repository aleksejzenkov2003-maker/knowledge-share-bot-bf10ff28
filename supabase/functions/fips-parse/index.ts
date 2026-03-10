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
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBibField(html: string, code: string, allBold = false): string | null {
  // The FIPS HTML uses <p class="bib"> blocks with pattern:
  // (CODE) <i>label</i> ... <b>VALUE</b>
  const bibBlocks = html.match(/<p class="bib"[\s\S]*?<\/p>/gi) || [];
  
  for (const block of bibBlocks) {
    if (!block.includes(`(${code})`)) continue;
    
    const boldMatches = block.match(/<b>([\s\S]*?)<\/b>/gi);
    if (!boldMatches || boldMatches.length === 0) continue;
    
    if (allBold) {
      // Concatenate all bold values (for classes MKTU with multiple <b> blocks)
      const values: string[] = [];
      for (const bm of boldMatches) {
        const val = cleanHtml(bm);
        if (val && val !== code) values.push(val);
      }
      return values.length > 0 ? values.join('\n') : null;
    }
    
    // Get first meaningful bold value
    for (const bm of boldMatches) {
      const val = cleanHtml(bm);
      if (val && val !== code && val.length > 0) {
        return val;
      }
    }
  }
  
  return null;
}

function extractBibFieldWithCountryCode(html: string, code: string): { name: string; countryCode: string | null } | null {
  const raw = extractBibField(html, code);
  if (!raw) return null;
  const match = raw.match(/^(.*?)\s*\(([A-Z]{2})\)\s*$/);
  if (match) {
    return { name: match[1].trim(), countryCode: match[2] };
  }
  return { name: raw, countryCode: null };
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

function extractPriorityDate(html: string): string | null {
  // Priority date is in a special <p class="bib2"> block
  const match = html.match(/<p class="bib2">[\s\S]*?Приоритет[\s\S]*?<b>([\s\S]*?)<\/b>/i);
  if (match?.[1]) {
    return parseDate(cleanHtml(match[1]));
  }
  return parseDate(extractBibField(html, '220'));
}

function extractPublicationInfo(html: string): { date: string | null; bulletinNumber: string | null } {
  const block = extractBibField(html, '450');
  const result = { date: null as string | null, bulletinNumber: null as string | null };
  if (block) {
    result.date = parseDate(block);
    // Look for "Бюл. №5" or "Бюл.№ 5" pattern - number after №
    const bulMatch = block.match(/Бюл[^\d]*№\s*(\d+)/i);
    if (bulMatch) {
      result.bulletinNumber = bulMatch[1];
    }
  }
  return result;
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

    const rawBytes = new Uint8Array(await response.arrayBuffer());
    let html: string;
    try {
      const decoder = new TextDecoder('windows-1251');
      html = decoder.decode(rawBytes);
    } catch {
      html = new TextDecoder('utf-8').decode(rawBytes);
    }

    if (html.includes('Документ не найден') || html.length < 500) {
      return new Response(JSON.stringify({ error: `Товарный знак №${num} не найден в реестре ФИПС` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract right holder with country code
    const holderInfo = extractBibFieldWithCountryCode(html, '732');
    
    // Extract kind/type of mark (550)
    const kindSpec = extractBibField(html, '550');
    
    // Extract classes MKTU - concatenate all bold blocks
    const classesRaw = extractBibField(html, '511', true);
    
    // Publication info
    const pubInfo = extractPublicationInfo(html);
    
    // Build publication URL  
    const pubUrlMatch = html.match(/\(450\)[\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
    const publicationUrl = pubUrlMatch?.[1] || null;

    const data: Record<string, any> = {
      // Core identification
      registration_number: num,
      registration_date: parseDate(extractBibField(html, '151')),
      application_number: extractBibField(html, '210'),
      priority_date: extractPriorityDate(html),
      expiry_date: parseDate(extractBibField(html, '181')),
      
      // Right holder
      right_holder_name: holderInfo?.name || null,
      right_holder_country_code: holderInfo?.countryCode || null,
      correspondence_address: extractBibField(html, '750'),
      
      // Images
      image_url: extractImageUrl(html),
      image_url_full: extractFullImageUrl(html),
      
      // Description & characteristics
      kind_specification: kindSpec,
      color_specification: extractBibField(html, '591'),
      unprotected_elements: extractBibField(html, '526'),
      transliteration: extractBibField(html, '441'),
      translation: extractBibField(html, '443'),
      description_element: extractBibField(html, '540')
        ? null // Skip if it's just the image block
        : null,
      
      // Classes
      classes_mktu: classesRaw,
      
      // Status
      actual: extractStatus(html),
      
      // Publication
      publication_date: pubInfo.date,
      bulletin_number: pubInfo.bulletinNumber,
      publication_url: publicationUrl,
      
      // Link
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
