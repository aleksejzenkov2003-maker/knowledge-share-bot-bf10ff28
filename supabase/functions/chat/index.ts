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
  provider_id?: string;
  conversation_id?: string;
  message_history?: { role: string; content: string }[];
}

interface ProviderConfig {
  provider_type: string;
  api_key: string;
  default_model: string;
  base_url?: string;
}

// Provider adapters for different API formats
async function callPerplexity(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  messageHistory?: { role: string; content: string }[]
): Promise<{ content: string; citations?: string[]; usage?: any }> {
  // Build messages array
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt }
  ];
  
  if (messageHistory && messageHistory.length > 0) {
    messages.push(...messageHistory);
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Perplexity API error:', response.status, errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: data.citations || [],
    usage: data.usage,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  messageHistory?: { role: string; content: string }[]
): Promise<{ content: string; usage?: any }> {
  // Build messages array for Anthropic (doesn't use system in messages array)
  let messages: { role: string; content: string }[];
  
  if (messageHistory && messageHistory.length > 0) {
    messages = messageHistory.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
  } else {
    messages = [{ role: 'user', content: userMessage }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', response.status, errorText);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  return {
    content,
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  baseUrl: string = 'https://api.openai.com/v1',
  messageHistory?: { role: string; content: string }[]
): Promise<{ content: string; usage?: any }> {
  // Build messages array
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt }
  ];
  
  if (messageHistory && messageHistory.length > 0) {
    messages.push(...messageHistory);
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
  };
}

// ============= GIGACHAT OAUTH TOKEN CACHE =============
let gigachatTokenCacheChat: { token: string; expiresAt: number } | null = null;

async function getGigaChatAccessTokenChat(authKey: string): Promise<string> {
  if (gigachatTokenCacheChat && Date.now() < gigachatTokenCacheChat.expiresAt - 60000) {
    return gigachatTokenCacheChat.token;
  }
  
  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': crypto.randomUUID(),
      'Authorization': `Basic ${authKey}`,
    },
    body: 'scope=GIGACHAT_API_PERS',
  });
  
  if (!response.ok) {
    throw new Error(`GigaChat OAuth failed: ${response.status}`);
  }
  
  const data = await response.json();
  gigachatTokenCacheChat = {
    token: data.access_token,
    expiresAt: data.expires_at * 1000,
  };
  return data.access_token;
}

async function callGigaChat(
  authKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  messageHistory?: { role: string; content: string }[]
): Promise<{ content: string; usage?: any }> {
  const accessToken = await getGigaChatAccessTokenChat(authKey);
  
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt }
  ];
  
  if (messageHistory && messageHistory.length > 0) {
    messages.push(...messageHistory);
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const response = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GigaChat API error:', response.status, errorText);
    throw new Error(`GigaChat API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return {
    content,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  messageHistory?: { role: string; content: string }[]
): Promise<{ content: string; usage?: any }> {
  // Build contents array for Gemini format
  const contents: { role: string; parts: { text: string }[] }[] = [];
  
  if (messageHistory && messageHistory.length > 0) {
    for (const msg of messageHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  } else {
    contents.push({ role: 'user', parts: [{ text: userMessage }] });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return {
    content,
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GIGACHAT_API_KEY = Deno.env.get('GIGACHAT_API_KEY');

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

    const { message, role_id, department_id, model, provider_id, conversation_id, message_history }: ChatRequest = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let systemPrompt = 'You are a helpful AI assistant.';
    let folderIds: string[] = [];
    let deptId = department_id;
    let selectedModel = model;
    let selectedProviderId = provider_id;
    let isProjectMode = false;

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
        isProjectMode = role.is_project_mode || false;
        if (role.system_prompt?.prompt_text) {
          systemPrompt = role.system_prompt.prompt_text;
        }
        // Get model config from role if available
        const modelConfig = role.model_config as { provider_id?: string; model?: string } | null;
        if (modelConfig) {
          if (!selectedProviderId && modelConfig.provider_id) {
            selectedProviderId = modelConfig.provider_id;
          }
          if (!selectedModel && modelConfig.model) {
            selectedModel = modelConfig.model;
          }
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

    // Get provider configuration
    let providerConfig: ProviderConfig | null = null;
    
    if (selectedProviderId) {
      // Get specific provider
      const { data: provider } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('id', selectedProviderId)
        .eq('is_active', true)
        .single();
      
      if (provider) {
        providerConfig = {
          provider_type: provider.provider_type,
          api_key: provider.api_key || '',
          default_model: provider.default_model || '',
          base_url: provider.base_url || undefined,
        };
      }
    }
    
    if (!providerConfig) {
      // Get default provider
      const { data: defaultProvider } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();
      
      if (defaultProvider) {
        providerConfig = {
          provider_type: defaultProvider.provider_type,
          api_key: defaultProvider.api_key || '',
          default_model: defaultProvider.default_model || '',
          base_url: defaultProvider.base_url || undefined,
        };
        selectedProviderId = defaultProvider.id;
      }
    }

    // Fallback to environment-based providers
    // Priority: Gemini > Anthropic > Perplexity
    if (!providerConfig) {
      if (GEMINI_API_KEY) {
        providerConfig = {
          provider_type: 'gemini',
          api_key: GEMINI_API_KEY,
          default_model: 'gemini-2.5-flash',
        };
      } else if (ANTHROPIC_API_KEY) {
        providerConfig = {
          provider_type: 'anthropic',
          api_key: ANTHROPIC_API_KEY,
          default_model: 'claude-sonnet-4-20250514',
        };
      } else if (PERPLEXITY_API_KEY) {
        providerConfig = {
          provider_type: 'perplexity',
          api_key: PERPLEXITY_API_KEY,
          default_model: 'sonar',
        };
      }
    }

    if (!providerConfig) {
      throw new Error('No AI provider configured. Please add an API key or configure a provider.');
    }

    // Use selected model or fallback to provider default
    const finalModel = selectedModel || providerConfig.default_model;

    // RAG: Semantic search in documents
    let ragContext: string[] = [];
    let usedSemanticSearch = false;

    if (folderIds.length > 0) {
      console.log(`Searching in folders: ${folderIds.join(', ')}`);
      
      // Try semantic search first if we have Gemini API
      if (GEMINI_API_KEY) {
        try {
          console.log('Generating query embedding for semantic search...');
          const queryEmbedding = await generateQueryEmbedding(message, GEMINI_API_KEY);
          
          if (queryEmbedding && queryEmbedding.length === 1536) {
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

    // Build message history for project mode
    let finalMessageHistory: { role: string; content: string }[] | undefined;
    
    if (isProjectMode && message_history && message_history.length > 0) {
      // In project mode, use the full message history but augment the last user message with RAG context
      finalMessageHistory = message_history.map((msg, idx) => {
        if (idx === message_history.length - 1 && msg.role === 'user' && ragContext.length > 0) {
          return {
            role: msg.role,
            content: `Context from documents:\n${ragContext.join('\n\n')}\n\nUser question: ${msg.content}`
          };
        }
        return msg;
      });
      console.log(`Project mode: using ${finalMessageHistory.length} messages from history`);
    }

    console.log(`Calling ${providerConfig.provider_type} API with model: ${finalModel}, RAG chunks: ${ragContext.length}, semantic: ${usedSemanticSearch}, project_mode: ${isProjectMode}`);
    
    // Call appropriate provider
    let response: { content: string; citations?: string[]; usage?: any };
    
    switch (providerConfig.provider_type) {
      case 'anthropic':
        response = await callAnthropic(
          providerConfig.api_key || ANTHROPIC_API_KEY || '',
          finalModel,
          systemPrompt,
          finalPrompt,
          finalMessageHistory
        );
        break;
      case 'openai':
        response = await callOpenAI(
          providerConfig.api_key,
          finalModel,
          systemPrompt,
          finalPrompt,
          providerConfig.base_url,
          finalMessageHistory
        );
        break;
      case 'gemini':
        response = await callGemini(
          GEMINI_API_KEY || providerConfig.api_key,
          finalModel,
          systemPrompt,
          finalPrompt,
          finalMessageHistory
        );
        break;
      case 'gigachat':
        response = await callGigaChat(
          GIGACHAT_API_KEY || providerConfig.api_key,
          finalModel,
          systemPrompt,
          finalPrompt,
          finalMessageHistory
        );
        break;
      case 'perplexity':
      default:
        response = await callPerplexity(
          providerConfig.api_key || PERPLEXITY_API_KEY || '',
          finalModel,
          systemPrompt,
          finalPrompt,
          finalMessageHistory
        );
        break;
    }

    const responseTimeMs = Date.now() - startTime;
    const usage = response.usage || {};

    // Log chat
    await supabase.from('chat_logs').insert({
      user_id: userId,
      department_id: deptId,
      provider_id: selectedProviderId || null,
      prompt: message,
      response: response.content,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      response_time_ms: responseTimeMs,
      metadata: { 
        model: finalModel,
        provider_type: providerConfig.provider_type,
        role_id, 
        rag_chunks: ragContext.length,
        semantic_search: usedSemanticSearch
      },
    });

    return new Response(
      JSON.stringify({
        content: response.content,
        citations: response.citations,
        model: finalModel,
        provider_type: providerConfig.provider_type,
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

// Generate query embedding using Gemini API directly
async function generateQueryEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `You are a text embedding generator. Analyze the given text and generate a semantic embedding.
For the given text, output ONLY a JSON array of exactly 1536 floating point numbers between -1 and 1.
These numbers should represent the semantic meaning of the text.
Output ONLY the JSON array, nothing else. Example: [0.1, -0.2, 0.3, ...]

Generate embedding for: "${text.substring(0, 500)}"` }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8000,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini embedding error:', response.status, errorText);
    throw new Error(`Failed to generate query embedding: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
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
