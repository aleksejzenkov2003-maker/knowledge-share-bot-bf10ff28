import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatRequest {
  message: string;
  role_id?: string;
  department_id?: string;
  model?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { message, role_id, department_id, model = 'sonar' }: ChatRequest = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let systemPrompt = 'You are a helpful AI assistant.';
    let folderIds: string[] = [];
    let deptId = department_id;

    // Get role config if role_id provided
    if (role_id) {
      const { data: role } = await supabase
        .from('chat_roles')
        .select('*, system_prompt:system_prompts(prompt_text)')
        .eq('id', role_id)
        .single();

      if (role) {
        deptId = role.department_id;
        folderIds = role.folder_ids || [];
        if (role.system_prompt?.prompt_text) {
          systemPrompt = role.system_prompt.prompt_text;
        }
      }
    } else if (department_id) {
      const { data: promptData } = await supabase
        .from('system_prompts')
        .select('prompt_text')
        .eq('department_id', department_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (promptData?.prompt_text) {
        systemPrompt = promptData.prompt_text;
      }
    }

    // RAG: Semantic search in documents
    let ragContext: string[] = [];
    let usedSemanticSearch = false;

    if (folderIds.length > 0) {
      console.log(`Searching in folders: ${folderIds.join(', ')}`);
      
      // Try semantic search first if we have Lovable AI
      if (LOVABLE_API_KEY) {
        try {
          console.log('Generating query embedding for semantic search...');
          const queryEmbedding = await generateQueryEmbedding(message, LOVABLE_API_KEY);
          
          if (queryEmbedding && queryEmbedding.length === 1536) {
            // Use the match_document_chunks function for semantic search
            const { data: semanticChunks, error: semanticError } = await supabase.rpc(
              'match_document_chunks',
              {
                query_embedding: `[${queryEmbedding.join(',')}]`,
                match_threshold: 0.5,
                match_count: 5,
                folder_ids: folderIds
              }
            );

            if (!semanticError && semanticChunks && semanticChunks.length > 0) {
              ragContext = semanticChunks.map((c: any) => c.content);
              usedSemanticSearch = true;
              console.log(`Found ${ragContext.length} chunks via semantic search`);
            } else if (semanticError) {
              console.error('Semantic search error:', semanticError);
            }
          }
        } catch (embError) {
          console.error('Error in semantic search:', embError);
        }
      }

      // Fallback to regular search if semantic search didn't work
      if (ragContext.length === 0) {
        console.log('Falling back to regular chunk search...');
        
        // Get documents in specified folders
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('id')
          .in('folder_id', folderIds)
          .eq('status', 'ready');

        if (docsError) {
          console.error('Error fetching documents:', docsError);
        }

        if (docs && docs.length > 0) {
          const docIds = docs.map(d => d.id);
          console.log(`Found ${docIds.length} documents in folders`);

          // Get chunks for these documents
          const { data: chunks, error: chunksError } = await supabase
            .from('document_chunks')
            .select('content, chunk_index, document_id')
            .in('document_id', docIds)
            .order('chunk_index')
            .limit(5);

          if (chunksError) {
            console.error('Error fetching chunks:', chunksError);
          }

          if (chunks && chunks.length > 0) {
            ragContext = chunks.map(c => c.content);
            console.log(`Found ${ragContext.length} relevant chunks (fallback)`);
          }
        } else {
          console.log('No ready documents found in specified folders');
        }
      }
    }

    // Augment prompt with RAG context
    let finalPrompt = message;
    if (ragContext.length > 0) {
      finalPrompt = `Context from documents:\n${ragContext.join('\n\n')}\n\nUser question: ${message}`;
    }

    console.log(`Calling Perplexity API with model: ${model}, RAG chunks: ${ragContext.length}, semantic: ${usedSemanticSearch}`);
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: finalPrompt }
        ],
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', perplexityResponse.status, errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices?.[0]?.message?.content || '';
    const citations = perplexityData.citations || [];
    const usage = perplexityData.usage || {};
    const responseTimeMs = Date.now() - startTime;

    // Log chat
    await supabase.from('chat_logs').insert({
      user_id: userId,
      department_id: deptId,
      prompt: message,
      response: content,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      response_time_ms: responseTimeMs,
      metadata: { 
        model, 
        role_id, 
        rag_chunks: ragContext.length,
        semantic_search: usedSemanticSearch
      },
    });

    return new Response(
      JSON.stringify({
        content,
        citations,
        model,
        response_time_ms: responseTimeMs,
        rag_context: ragContext.length > 0 ? ragContext : undefined,
        semantic_search: usedSemanticSearch,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chat function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Generate query embedding using Lovable AI
async function generateQueryEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        {
          role: 'system',
          content: `You are a text embedding generator. Analyze the given text and generate a semantic embedding.
For the given text, output ONLY a JSON array of exactly 1536 floating point numbers between -1 and 1.
These numbers should represent the semantic meaning of the text.
Output ONLY the JSON array, nothing else. Example: [0.1, -0.2, 0.3, ...]`
        },
        {
          role: 'user',
          content: `Generate embedding for: "${text.substring(0, 500)}"`
        }
      ],
      temperature: 0,
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI embedding error:', response.status, errorText);
    throw new Error(`Failed to generate query embedding: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    const jsonMatch = content.match(/\[[\d\s,.\-e]+\]/);
    if (jsonMatch) {
      const embedding = JSON.parse(jsonMatch[0]);
      if (Array.isArray(embedding) && embedding.length > 0) {
        while (embedding.length < 1536) {
          embedding.push(0);
        }
        return embedding.slice(0, 1536);
      }
    }
  } catch (parseError) {
    console.error('Failed to parse query embedding:', parseError);
  }
  
  // Fallback
  return createSimpleEmbedding(text);
}

// Fallback simple embedding
function createSimpleEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (i + 1) * (j + 1)) % 1536;
      embedding[index] += 0.1 / (1 + Math.sqrt(i));
    }
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}
