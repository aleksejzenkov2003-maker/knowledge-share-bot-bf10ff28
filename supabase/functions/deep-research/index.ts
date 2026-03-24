import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ChatRequest {
  message: string;
  role_id?: string;
  conversation_id?: string;
  message_history?: { role: string; content: string }[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY') || '';

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { message, role_id, conversation_id, message_history } = await req.json() as ChatRequest;
    console.log(`Deep research request from user ${userId}, role_id=${role_id}`);

    // Get role config
    let systemPrompt = 'Ты — исследовательский ассистент. Проводи глубокий анализ и исследование по запросу пользователя.';
    let selectedModel = 'sonar-deep-research';
    let deptId: string | null = null;
    let selectedProviderId: string | null = null;

    if (role_id) {
      const { data: role } = await supabase
        .from('chat_roles')
        .select('*, system_prompt:system_prompts(prompt_text)')
        .eq('id', role_id)
        .single();

      if (role) {
        deptId = role.department_id;
        if (role.system_prompt?.prompt_text) {
          systemPrompt = role.system_prompt.prompt_text;
        }
        const modelConfig = role.model_config as { provider_id?: string; model?: string } | null;
        if (modelConfig?.model) {
          selectedModel = modelConfig.model;
        }
        if (modelConfig?.provider_id) {
          selectedProviderId = modelConfig.provider_id;
        }
      }
    }

    // Get API key from provider or env
    let apiKey = PERPLEXITY_API_KEY;
    if (selectedProviderId) {
      const { data: provider } = await supabase
        .from('ai_providers')
        .select('api_key')
        .eq('id', selectedProviderId)
        .eq('is_active', true)
        .single();
      if (provider?.api_key) {
        apiKey = provider.api_key;
      }
    }

    if (!apiKey) {
      throw new Error('Perplexity API key not configured');
    }

    // Build messages
    const simpleMessages: { role: string; content: string }[] = [];
    if (message_history && message_history.length > 0) {
      for (const m of message_history) {
        simpleMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      }
    } else {
      simpleMessages.push({ role: 'user', content: message });
    }

    // Ensure role alternation for Perplexity
    const alternated: typeof simpleMessages = [];
    for (const msg of simpleMessages) {
      if (alternated.length > 0 && alternated[alternated.length - 1].role === msg.role) {
        alternated[alternated.length - 1].content += '\n\n' + msg.content;
      } else {
        alternated.push({ ...msg });
      }
    }

    console.log(`Calling Perplexity: model=${selectedModel}, messages=${alternated.length}`);

    // Use SSE streaming to keep the connection alive via heartbeats
    // while we wait for the deep-research response
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Heartbeat every 10 seconds to keep connection alive
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            clearInterval(heartbeat);
          }
        }, 10000);

        try {
          // Make the actual Perplexity API call (non-streaming, deep-research doesn't support streaming)
          const abortController = new AbortController();
          const timeout = setTimeout(() => abortController.abort(), 300000); // 5 min timeout

          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            signal: abortController.signal,
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: selectedModel,
              messages: [{ role: 'system', content: systemPrompt }, ...alternated],
              max_tokens: 12000,
              stream: false,
            }),
          });

          clearTimeout(timeout);

          if (!response.ok) {
            const errBody = await response.text();
            console.error(`Perplexity error: status=${response.status}, body=${errBody}`);
            throw new Error(`Perplexity API error: ${response.status}`);
          }

          const jsonResponse = await response.json();
          let content = jsonResponse.choices?.[0]?.message?.content || '';

          // Strip <think> blocks
          content = content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();

          // Capture citations
          const webSearchCitations = jsonResponse.citations || [];

          const responseTimeMs = Date.now() - startTime;
          console.log(`Deep research completed in ${responseTimeMs}ms, content length: ${content.length}, citations: ${webSearchCitations.length}`);

          // Send content
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`));

          // Send metadata
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            web_search_citations: webSearchCitations.length > 0 ? webSearchCitations : undefined,
            web_search_used: webSearchCitations.length > 0,
          })}\n\n`));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));

          // Log
          await supabase.from('chat_logs').insert({
            user_id: userId,
            department_id: deptId,
            provider_id: selectedProviderId || null,
            prompt: message,
            response: content,
            response_time_ms: responseTimeMs,
            metadata: {
              model: selectedModel,
              provider_type: 'perplexity',
              role_id,
              deep_research: true,
            },
          });
        } catch (err) {
          console.error('Deep research error:', err);
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'content',
            content: `Ошибка исследования: ${errorMsg}. Попробуйте упростить запрос или повторить позже.`,
          })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: Date.now() - startTime,
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Deep research handler error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
