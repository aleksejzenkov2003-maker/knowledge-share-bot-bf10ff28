import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_BASE = 'https://api.reputation.ru/api/v1';

interface SearchResult {
  Id: string;
  Type: string; // "Company", "Entrepreneur", "Person"
  Inn?: string;
  Ogrn?: string;
  Name?: string;
  Address?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('REPUTATION_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'REPUTATION_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, action = 'full_report', entity_id, entity_type: req_entity_type } = await req.json();

    if (!query && !entity_id) {
      return new Response(
        JSON.stringify({ error: 'query or entity_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // ACTION: search — find entities by name/INN/OGRN
    if (action === 'search') {
      const searchRes = await fetch(`${API_BASE}/entities/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          QueryText: query,
          Filter: { EntityTypes: ['Company', 'Entrepreneur', 'Person'] },
        }),
      });

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error('Reputation search error:', searchRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Search failed: ${searchRes.status}`, details: errText }),
          { status: searchRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const searchData = await searchRes.json();
      // Normalize: extract Items array from response
      const items = Array.isArray(searchData) ? searchData : (searchData.Items || searchData.Results || searchData.items || []);
      return new Response(JSON.stringify(items), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: trademark_search — search FIPS trademarks by application/registration number
    if (action === 'trademark_search') {
      const number = query?.trim();
      if (!number) {
        return new Response(
          JSON.stringify({ error: 'query (number) required for trademark_search' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Reputation trademark_search: number=${number}`);
      const results: Record<string, unknown>[] = [];

      for (const endpoint of ['patents', 'applications']) {
        try {
          const res = await fetch(
            `${API_BASE}/fips/${endpoint}?number=${encodeURIComponent(number)}`,
            { method: 'GET', headers }
          );
          if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.Items || data.Results || data.items || []);
            results.push(...items.map((item: any) => ({ ...item, _source: endpoint })));
            console.log(`FIPS ${endpoint} by number: ${items.length} items`);
          } else {
            const errText = await res.text();
            console.error(`FIPS ${endpoint} by number error:`, res.status, errText);
          }
        } catch (e) {
          console.error(`FIPS ${endpoint} by number fetch error:`, e);
        }
      }

      console.log(`Reputation trademark_search: found ${results.length} items total`);

      return new Response(JSON.stringify({
        trademarks: results,
        count: results.length,
        query: number,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: trademarks — search FIPS trademarks by entity ID
    if (action === 'trademarks') {
      if (!entity_id) {
        return new Response(
          JSON.stringify({ error: 'entity_id required for trademarks search' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const entType = req_entity_type || 'Company';
      console.log(`Reputation trademarks: entityId=${entity_id}, entityType=${entType}`);

      const results: Record<string, unknown>[] = [];
      const seenIds = new Set<string>();

      // For Person/Entrepreneur, try both types since trademarks may be registered under either
      const typesToTry = (entType === 'Person' || entType === 'person')
        ? ['Person', 'Entrepreneur']
        : (entType === 'Entrepreneur' || entType === 'entrepreneur')
          ? ['Entrepreneur', 'Person']
          : [entType];

      for (const tryType of typesToTry) {
        for (const endpoint of ['patents', 'applications']) {
          try {
            const res = await fetch(
              `${API_BASE}/fips/${endpoint}?entityId=${encodeURIComponent(entity_id)}&entityType=${encodeURIComponent(tryType)}`,
              { method: 'GET', headers }
            );
            if (res.ok) {
              const data = await res.json();
              const items = Array.isArray(data) ? data : (data.Items || data.Results || data.items || []);
              for (const item of items) {
                const itemId = item.Id || item.id || JSON.stringify(item);
                if (!seenIds.has(itemId)) {
                  seenIds.add(itemId);
                  results.push({ ...item, _source: endpoint });
                }
              }
              console.log(`FIPS ${endpoint} (${tryType}): ${items.length} items`);
            } else {
              const errText = await res.text();
              console.error(`FIPS ${endpoint} (${tryType}) error:`, res.status, errText);
            }
          } catch (e) {
            console.error(`FIPS ${endpoint} (${tryType}) fetch error:`, e);
          }
        }
        // If found results with first type, skip other types
        if (results.length > 0) break;
      }

      console.log(`Reputation trademarks: found ${results.length} items total`);

      return new Response(JSON.stringify({
        trademarks: results,
        count: results.length,
        query: entity_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: company/entrepreneur/person — get entity card by ID
    if (action === 'company' || action === 'entrepreneur' || action === 'person') {
      if (!entity_id) {
        return new Response(
          JSON.stringify({ error: 'entity_id required for card request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const cardRes = await fetch(`${API_BASE}/entities/${action}?id=${entity_id}`, {
        method: 'GET',
        headers,
      });

      if (!cardRes.ok) {
        const errText = await cardRes.text();
        console.error(`Reputation ${action} error:`, cardRes.status, errText);
        return new Response(
          JSON.stringify({ error: `${action} request failed: ${cardRes.status}`, details: errText }),
          { status: cardRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const cardData = await cardRes.json();
      return new Response(JSON.stringify(cardData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: full_report — search + get full company card
    if (action === 'full_report') {
      // Step 1: Search
      console.log(`Reputation full_report: searching for "${query}"`);
      const searchRes = await fetch(`${API_BASE}/entities/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          QueryText: query,
          Filter: { EntityTypes: ['Company', 'Entrepreneur', 'Person'] },
        }),
      });

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error('Reputation search error:', searchRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Search failed: ${searchRes.status}`, details: errText }),
          { status: searchRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const searchData = await searchRes.json();
      const results: SearchResult[] = Array.isArray(searchData) ? searchData : (searchData.Items || searchData.Results || searchData.items || []);

      if (!results || results.length === 0) {
        return new Response(
          JSON.stringify({ search_results: [], company: null, message: 'No entities found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If multiple results found, return them for user selection (don't auto-pick)
      if (results.length > 1) {
        console.log(`Reputation: Found ${results.length} entities, returning for user selection`);
        return new Response(JSON.stringify({
          search_results: results,
          company: null,
          entity_type: null,
          additional: {},
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Reputation: Found 1 entity, fetching card`);

      // Step 2: Get card for first result
      const firstResult = results[0];
      const entityType = (firstResult.Type || 'Company').toLowerCase();
      const cardType = entityType === 'entrepreneur' ? 'entrepreneur' : 
                       entityType === 'person' ? 'person' : 'company';
      
      let companyCard = null;
      try {
        const cardRes = await fetch(`${API_BASE}/entities/${cardType}?id=${firstResult.Id}`, {
          method: 'GET',
          headers,
        });

        if (cardRes.ok) {
          companyCard = await cardRes.json();
        } else {
          console.error(`Reputation card error: ${cardRes.status}`);
          const errText = await cardRes.text();
          console.error(errText);
        }
      } catch (cardErr) {
        console.error('Error fetching company card:', cardErr);
      }

      // Step 3: Try to get additional data (scoring, etc.) — optional endpoints
      let additionalData: Record<string, unknown> = {};
      
      // Try ID lookup for extra info
      if (firstResult.Inn) {
        try {
          const idRes = await fetch(`${API_BASE}/entities/id?inn=${firstResult.Inn}`, {
            method: 'GET',
            headers,
          });
          if (idRes.ok) {
            additionalData.entityIdInfo = await idRes.json();
          } else {
            await idRes.text(); // consume body
          }
        } catch (e) {
          console.error('Entity ID lookup error:', e);
        }
      }

      return new Response(JSON.stringify({
        search_results: results,
        company: companyCard,
        entity_type: cardType,
        additional: additionalData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Reputation API error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
