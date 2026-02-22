import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VOK_BASE = 'https://api.saby.ru/vok';
const AUTH_URL = 'https://online.sbis.ru/auth/service/';

// In-memory session cache
let cachedSid: string | null = null;
let sidExpiresAt = 0;

async function authenticate(): Promise<string> {
  if (cachedSid && Date.now() < sidExpiresAt) {
    return cachedSid;
  }

  const login = Deno.env.get('SBIS_LOGIN');
  const password = Deno.env.get('SBIS_PASSWORD');

  if (!login || !password) {
    throw new Error('SBIS_LOGIN or SBIS_PASSWORD not configured');
  }

  console.log('SBIS: Authenticating via login/password...');
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'САП.Аутентифицировать',
      params: { login, password },
      id: 1,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`SBIS auth error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  cachedSid = data.result;
  sidExpiresAt = Date.now() + 25 * 60 * 1000;
  console.log('SBIS: Authenticated successfully, SID obtained');
  return cachedSid!;
}

async function vokRequest(endpoint: string, params: Record<string, string>, sid: string): Promise<unknown> {
  const url = new URL(`${VOK_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.append(k, v);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-SBISSessionID': sid,
      'Accept': 'application/json',
    },
  });

  if (res.status === 403) {
    throw new Error('SBIS: No license for VOK API (403)');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SBIS VOK error [${res.status}]: ${text}`);
  }

  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, inn, ogrn, query: searchQuery } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sid = await authenticate();

    // ACTION: search — find companies by name/INN
    if (action === 'search') {
      if (!searchQuery) {
        return new Response(
          JSON.stringify({ error: 'query is required for search' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await vokRequest('search', { query: searchQuery }, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: req — company requisites
    if (action === 'req') {
      if (!inn && !ogrn) {
        return new Response(
          JSON.stringify({ error: 'inn or ogrn is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('req', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: finance — financial data
    if (action === 'finance') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('finance', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: owners — affiliated persons
    if (action === 'owners') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('owners', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: affiliate — affiliated companies
    if (action === 'affiliate') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('affiliate', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: tenders — government contracts
    if (action === 'tenders') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('tenders', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: tenders-info — detailed tender info
    if (action === 'tenders-info') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('tenders-info', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: trademarks — trademarks
    if (action === 'trademarks') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('trademarks', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: statistic-courts — court statistics
    if (action === 'courts') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('statistic-courts', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: reliability — reliability score
    if (action === 'reliability') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('reliability', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: contacts-official — official contacts
    if (action === 'contacts') {
      const params: Record<string, string> = {};
      if (inn) params.inn = inn;
      if (ogrn) params.ogrn = ogrn;

      const data = await vokRequest('contacts-official', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: full_report — search + req + extra data
    if (action === 'full_report') {
      let targetInn = inn;
      let targetOgrn = ogrn;
      let searchResults: unknown[] = [];

      // If we have a text query, search first
      if (searchQuery && !targetInn && !targetOgrn) {
        // Detect if query is INN or OGRN
        const clean = searchQuery.replace(/\s/g, '');
        if (/^\d{10}$/.test(clean) || /^\d{12}$/.test(clean)) {
          targetInn = clean;
        } else if (/^\d{13}$/.test(clean) || /^\d{15}$/.test(clean)) {
          targetOgrn = clean;
        } else {
          // Text search
          try {
            const searchData = await vokRequest('search', { query: searchQuery }, sid) as any;
            const items = searchData?.items || (Array.isArray(searchData) ? searchData : []);
            searchResults = items;

            if (items.length === 0) {
              return new Response(JSON.stringify({ search_results: [], company: null }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            if (items.length > 1) {
              return new Response(JSON.stringify({ search_results: items.slice(0, 10), company: null }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Single result — extract INN
            targetInn = items[0]?.inn || items[0]?.INN;
            targetOgrn = items[0]?.ogrn || items[0]?.OGRN;
          } catch (e) {
            console.error('SBIS search error:', e);
          }
        }
      }

      if (!targetInn && !targetOgrn) {
        return new Response(
          JSON.stringify({ error: 'Could not determine INN/OGRN for report', search_results: searchResults }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const params: Record<string, string> = {};
      if (targetInn) params.inn = targetInn;
      if (targetOgrn) params.ogrn = targetOgrn;

      // Fetch req data (main requisites)
      let reqData: any = null;
      try {
        reqData = await vokRequest('req', params, sid);
      } catch (e) {
        console.error('SBIS req error:', e);
      }

      return new Response(JSON.stringify({
        search_results: searchResults,
        company: reqData,
        inn: targetInn,
        ogrn: targetOgrn,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SBIS API error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
