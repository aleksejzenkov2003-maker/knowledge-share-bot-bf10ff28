import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractField(html: string, code: string): string | null {
  // FIPS uses patterns like <td>(732)</td> followed by value in next <td>
  // Or patterns like <b>(732)</b> followed by value
  const patterns = [
    new RegExp(`\\(${code}\\)\\s*</(?:td|th|b|span)>\\s*<(?:td|th|span)[^>]*>\\s*([\\s\\S]*?)\\s*</(?:td|th|span)>`, 'i'),
    new RegExp(`\\(${code}\\)\\s*[:\\s]*([^<]+?)(?:<|$)`, 'i'),
    new RegExp(`<td[^>]*>\\s*\\(${code}\\)\\s*</td>\\s*<td[^>]*>\\s*([\\s\\S]*?)\\s*</td>`, 'i'),
  ];
  
  for (const regex of patterns) {
    const match = html.match(regex);
    if (match?.[1]) {
      let val = match[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
      if (val) return val;
    }
  }
  return null;
}

function extractImageUrl(html: string): string | null {
  // Look for image near (540) code
  const section540 = html.match(/\(540\)[\s\S]{0,2000}/i);
  if (section540) {
    const imgMatch = section540[0].match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
      let url = imgMatch[1];
      if (url.startsWith('/')) url = 'https://fips.ru' + url;
      return url;
    }
  }
  // Fallback: look for Archive image
  const archiveMatch = html.match(/<img[^>]+src=["']((?:https?:\/\/fips\.ru)?\/Archive\/[^"']+)["']/i);
  if (archiveMatch?.[1]) {
    let url = archiveMatch[1];
    if (url.startsWith('/')) url = 'https://fips.ru' + url;
    return url;
  }
  return null;
}

function extractStatus(html: string): boolean | null {
  // Look for status indicator
  const statusMatch = html.match(/class=["'][^"']*Status[^"']*["'][^>]*>([^<]+)/i);
  if (statusMatch?.[1]) {
    const text = statusMatch[1].toLowerCase();
    if (text.includes('не действу') || text.includes('прекращ') || text.includes('аннулир')) return false;
    if (text.includes('действу')) return true;
  }
  // Alternative status patterns
  const altMatch = html.match(/Статус[\s:]*<[^>]*>([^<]+)/i);
  if (altMatch?.[1]) {
    const text = altMatch[1].toLowerCase();
    if (text.includes('не действу') || text.includes('прекращ')) return false;
    if (text.includes('действу')) return true;
  }
  return null;
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  // DD.MM.YYYY
  const dmy = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.substring(0, 10);
  // YYYYMMDD
  if (/^\d{8}$/.test(cleaned)) return `${cleaned.substring(0,4)}-${cleaned.substring(4,6)}-${cleaned.substring(6,8)}`;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9',
        },
      });
    } catch (e) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: 'Не удалось подключиться к ФИПС. Попробуйте позже.' }), {
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

    // Check if we got a real result
    if (html.includes('Документ не найден') || html.includes('не найден') || html.length < 500) {
      return new Response(JSON.stringify({ error: `Товарный знак №${num} не найден в реестре ФИПС` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data: Record<string, any> = {
      registration_number: extractField(html, '111') || num,
      registration_date: parseDate(extractField(html, '151')),
      right_holder_name: extractField(html, '732'),
      right_holder_address: extractField(html, '750'),
      correspondence_address: extractField(html, '740'),
      description_element: extractField(html, '526') || extractField(html, '511'),
      unprotected_elements: extractField(html, '526'),
      color_specification: extractField(html, '591'),
      transliteration: extractField(html, '441'),
      image_url: extractImageUrl(html),
      expiry_date: parseDate(extractField(html, '181')),
      priority_date: parseDate(extractField(html, '220')),
      application_number: extractField(html, '210'),
      classes_mktu: extractField(html, '511'),
      actual: extractStatus(html),
      fips_url: url,
    };

    // Clean null values
    Object.keys(data).forEach(k => {
      if (data[k] === null || data[k] === undefined || data[k] === '') {
        delete data[k];
      }
    });

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
