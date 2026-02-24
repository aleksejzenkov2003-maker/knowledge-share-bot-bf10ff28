import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Demo endpoint — no auth required, limited INN set
const VOK_DEMO_BASE = 'https://api.sbis.ru/vok-demo';
const VOK_BASE = 'https://api.saby.ru/vok';
const AUTH_URL = 'https://api.saby.ru/auth/service/';

// In-memory session cache
let cachedSid: string | null = null;
let sidExpiresAt = 0;

// Check if we should use demo mode (fallback when auth fails or rate limited)
let useDemoMode = false;

async function authenticate(): Promise<string | null> {
  if (useDemoMode) return null;

  if (cachedSid && Date.now() < sidExpiresAt) {
    return cachedSid;
  }

  const login = Deno.env.get('SBIS_LOGIN');
  const password = Deno.env.get('SBIS_PASSWORD');

  if (!login || !password) {
    console.log('SBIS: No credentials, switching to demo mode');
    useDemoMode = true;
    return null;
  }

  try {
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
      console.error('SBIS auth failed, switching to demo mode:', data.error);
      useDemoMode = true;
      return null;
    }

    cachedSid = data.result;
    sidExpiresAt = Date.now() + 25 * 60 * 1000;
    console.log('SBIS: Authenticated successfully, SID obtained');
    return cachedSid!;
  } catch (e) {
    console.error('SBIS auth exception, switching to demo mode:', e);
    useDemoMode = true;
    return null;
  }
}

async function vokRequest(endpoint: string, params: Record<string, string>, sid: string | null): Promise<unknown> {
  const base = sid ? VOK_BASE : VOK_DEMO_BASE;
  const url = new URL(`${base}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.append(k, v);
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (sid) {
    headers['X-SBISSessionID'] = sid;
    headers['Cookie'] = `sid=${sid}`;
  }

  console.log(`SBIS: ${sid ? 'PROD' : 'DEMO'} request: ${endpoint}`, params);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers,
  });

  if (res.status === 403) {
    throw new Error('SBIS: No license for VOK API (403)');
  }

  if (!res.ok) {
    const text = await res.text();
    // If rate limited on prod, try demo
    if (!sid && text.includes('exceeded')) {
      throw new Error(`SBIS VOK demo error [${res.status}]: ${text}`);
    }
    if (sid && (res.status === 429 || text.includes('exceeded'))) {
      console.log('SBIS: Rate limited on prod, retrying with demo...');
      return vokRequest(endpoint, params, null);
    }
    throw new Error(`SBIS VOK error [${res.status}]: ${text}`);
  }

  return await res.json();
}

// VOK API does not accept both inn and ogrn simultaneously — pick one
function pickIdentifier(inn?: string, ogrn?: string): Record<string, string> {
  if (inn) return { inn };
  if (ogrn) return { ogrn };
  return {};
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, inn, ogrn, query: searchQuery, demo } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow forcing demo mode from client
    if (demo) useDemoMode = true;

    const sid = await authenticate();

    // ACTION: search — find companies by name/INN
    if (action === 'search') {
      if (!searchQuery) {
        return new Response(
          JSON.stringify({ error: 'query is required for search' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rawData = await vokRequest('search', { requisites: searchQuery }, sid) as any;
      const data = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : rawData;
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
      const params = pickIdentifier(inn, ogrn);
      const data = await vokRequest('req', params, sid);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map action → VOK endpoint for simple proxy actions
    const actionEndpointMap: Record<string, string> = {
      finance: 'finance',
      owners: 'owners',
      affiliate: 'affiliate',
      tenders: 'tenders',
      'tenders-info': 'tenders-info',
      trademarks: 'trademarks',
      courts: 'statistic-courts',
      reliability: 'reliability',
      contacts: 'contacts-official',
    };

    if (actionEndpointMap[action]) {
      const params = pickIdentifier(inn, ogrn);
      const data = await vokRequest(actionEndpointMap[action], params, sid);
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
        const clean = searchQuery.replace(/\s/g, '');
        if (/^\d{10}$/.test(clean) || /^\d{12}$/.test(clean)) {
          targetInn = clean;
        } else if (/^\d{13}$/.test(clean) || /^\d{15}$/.test(clean)) {
          targetOgrn = clean;
        } else {
          try {
            const searchData = await vokRequest('search', { requisites: searchQuery }, sid) as any;
            const rawItems = Array.isArray(searchData) && Array.isArray(searchData[0]) 
              ? searchData[0] 
              : searchData?.items || (Array.isArray(searchData) ? searchData : []);
            searchResults = rawItems;

            if (rawItems.length === 0) {
              return new Response(JSON.stringify({ search_results: [], company: null }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            if (rawItems.length > 1) {
              return new Response(JSON.stringify({ search_results: rawItems.slice(0, 10), company: null }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            targetInn = rawItems[0]?.inn || rawItems[0]?.INN;
            targetOgrn = rawItems[0]?.ogrn || rawItems[0]?.OGRN;
          } catch (e: any) {
            console.error('SBIS search error:', e);
            return new Response(
              JSON.stringify({ error: e?.message || 'Search failed', search_results: [] }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }

      if (!targetInn && !targetOgrn) {
        return new Response(
          JSON.stringify({ error: 'Could not determine INN/OGRN for report', search_results: searchResults }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const params = pickIdentifier(targetInn, targetOgrn);

      let reqData: any = null;
      try {
        reqData = await vokRequest('req', params, sid);
      } catch (e: any) {
        console.error('SBIS req error:', e);
        return new Response(
          JSON.stringify({ error: e?.message || 'Failed to fetch requisites', search_results: searchResults }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({
        search_results: searchResults,
        company: reqData,
        inn: targetInn,
        ogrn: targetOgrn,
        demo: !sid,
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
