import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

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

    const { message, role_id, department_id, model, provider_id, message_history }: ChatRequest = await req.json();

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
    }

    // Get provider configuration
    let providerConfig: ProviderConfig | null = null;
    
    // Helper function to get effective API key (fallback to env if not in provider)
    const getEffectiveApiKey = (providerType: string, providerApiKey: string | null): string => {
      if (providerApiKey) return providerApiKey;
      
      switch (providerType) {
        case 'perplexity':
          return PERPLEXITY_API_KEY || '';
        case 'anthropic':
          return ANTHROPIC_API_KEY || '';
        case 'lovable':
          return LOVABLE_API_KEY || '';
        default:
          return '';
      }
    };
    
    if (selectedProviderId) {
      const { data: provider } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('id', selectedProviderId)
        .eq('is_active', true)
        .single();
      
      if (provider) {
        const effectiveApiKey = getEffectiveApiKey(provider.provider_type, provider.api_key);
        providerConfig = {
          provider_type: provider.provider_type,
          api_key: effectiveApiKey,
          default_model: provider.default_model || '',
          base_url: provider.base_url || undefined,
        };
      }
    }
    
    if (!providerConfig) {
      const { data: defaultProvider } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();
      
      if (defaultProvider) {
        const effectiveApiKey = getEffectiveApiKey(defaultProvider.provider_type, defaultProvider.api_key);
        providerConfig = {
          provider_type: defaultProvider.provider_type,
          api_key: effectiveApiKey,
          default_model: defaultProvider.default_model || '',
          base_url: defaultProvider.base_url || undefined,
        };
        selectedProviderId = defaultProvider.id;
      }
    }

    // Fallback to env-configured providers if no provider in DB
    if (!providerConfig) {
      if (PERPLEXITY_API_KEY) {
        providerConfig = {
          provider_type: 'perplexity',
          api_key: PERPLEXITY_API_KEY,
          default_model: 'sonar-pro',
        };
      } else if (ANTHROPIC_API_KEY) {
        providerConfig = {
          provider_type: 'anthropic',
          api_key: ANTHROPIC_API_KEY,
          default_model: 'claude-sonnet-4-20250514',
        };
      } else if (LOVABLE_API_KEY) {
        providerConfig = {
          provider_type: 'lovable',
          api_key: LOVABLE_API_KEY,
          default_model: 'google/gemini-2.5-flash',
        };
      }
    }

    if (!providerConfig || !providerConfig.api_key) {
      throw new Error('No AI provider configured or API key missing');
    }

    const finalModel = selectedModel || providerConfig.default_model;

    // RAG context - load ALL documents from selected folders
    let ragContext: string[] = [];
    let usedSemanticSearch = false;

    if (folderIds.length > 0) {
      const { data: docs } = await supabase
        .from('documents')
        .select('id, name')
        .in('folder_id', folderIds)
        .eq('status', 'ready');

      if (docs && docs.length > 0) {
        const docIds = docs.map(d => d.id);
        
        // Load ALL chunks from all documents in selected folders
        const { data: chunks } = await supabase
          .from('document_chunks')
          .select('content, chunk_index, document_id')
          .in('document_id', docIds)
          .order('document_id')
          .order('chunk_index');

        if (chunks && chunks.length > 0) {
          // Group chunks by document and combine them
          const documentContents: Record<string, { name: string; chunks: string[] }> = {};
          
          for (const doc of docs) {
            documentContents[doc.id] = { name: doc.name, chunks: [] };
          }
          
          for (const chunk of chunks) {
            if (documentContents[chunk.document_id]) {
              documentContents[chunk.document_id].chunks[chunk.chunk_index] = chunk.content;
            }
          }
          
          // Build full document context
          ragContext = Object.entries(documentContents)
            .filter(([_, doc]) => doc.chunks.length > 0)
            .map(([_, doc]) => `=== Документ: ${doc.name} ===\n${doc.chunks.filter(Boolean).join('\n')}`);
          
          console.log(`RAG: Loaded ${ragContext.length} documents with ${chunks.length} total chunks`);
        }
      }
    }

    // Build messages
    let finalPrompt = message;
    if (ragContext.length > 0) {
      finalPrompt = `Context from documents:\n${ragContext.join('\n\n')}\n\nUser question: ${message}`;
    }

    let messages: { role: string; content: string }[];
    
    if (isProjectMode && message_history && message_history.length > 0) {
      messages = message_history.map((msg, idx) => {
        if (idx === message_history.length - 1 && msg.role === 'user' && ragContext.length > 0) {
          return { role: msg.role, content: `Context from documents:\n${ragContext.join('\n\n')}\n\nUser question: ${msg.content}` };
        }
        return msg;
      });
    } else {
      messages = [{ role: 'user', content: finalPrompt }];
    }

    console.log(`Streaming from ${providerConfig.provider_type} with model: ${finalModel}`);

    // Create streaming response based on provider
    let streamResponse: Response;
    
    switch (providerConfig.provider_type) {
      case 'anthropic':
        streamResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': providerConfig.api_key || ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
            stream: true,
          }),
        });
        break;

      case 'openai':
        streamResponse = await fetch(`${providerConfig.base_url || 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${providerConfig.api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true,
          }),
        });
        break;

      case 'lovable':
        streamResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY || providerConfig.api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true,
          }),
        });
        break;

      case 'perplexity':
      default:
        streamResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${providerConfig.api_key || PERPLEXITY_API_KEY || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: finalModel,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true,
          }),
        });
        break;
    }

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      console.error('Provider stream error:', streamResponse.status, errorText);
      throw new Error(`Provider error: ${streamResponse.status}`);
    }

    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  let content = '';

                  // Handle different provider formats
                  if (providerConfig!.provider_type === 'anthropic') {
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      content = parsed.delta.text;
                    }
                  } else {
                    content = parsed.choices?.[0]?.delta?.content || '';
                  }

                  if (content) {
                    fullContent += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));
                  }
                } catch {
                  // Ignore parsing errors
                }
              }
            }
          }

          // Send metadata at the end
          const responseTimeMs = Date.now() - startTime;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            rag_context: ragContext.length > 0 ? ragContext : undefined,
            semantic_search: usedSemanticSearch,
          })}\n\n`));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          // Log chat
          await supabase.from('chat_logs').insert({
            user_id: userId,
            department_id: deptId,
            provider_id: selectedProviderId || null,
            prompt: message,
            response: fullContent,
            response_time_ms: responseTimeMs,
            metadata: { 
              model: finalModel,
              provider_type: providerConfig!.provider_type,
              role_id,
              rag_chunks: ragContext.length,
              streaming: true,
            },
          });
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, { headers: corsHeaders });

  } catch (error) {
    console.error('Chat stream error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
