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

    const { query, action = 'full_report', entity_id } = await req.json();

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
          Filter: { EntityTypes: ['Company', 'Entrepreneur'] },
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
      return new Response(JSON.stringify(searchData), {
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
          Filter: { EntityTypes: ['Company', 'Entrepreneur'] },
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
      const results: SearchResult[] = Array.isArray(searchData) ? searchData : (searchData.Results || searchData.items || []);

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
          search_results: results.slice(0, 10),
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
        search_results: results.slice(0, 5), // Return top 5 matches
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
