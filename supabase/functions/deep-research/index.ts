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

function stripThinkContent(chunk: string, state: { insideThinkBlock: boolean }) {
  let remaining = chunk;
  let cleaned = '';

  while (remaining.length > 0) {
    const lowered = remaining.toLowerCase();

    if (state.insideThinkBlock) {
      const closeIndex = lowered.indexOf('</think>');
      if (closeIndex === -1) {
        return cleaned;
      }

      remaining = remaining.slice(closeIndex + 8);
      state.insideThinkBlock = false;
      continue;
    }

    const openIndex = lowered.indexOf('<think>');
    if (openIndex === -1) {
      cleaned += remaining;
      break;
    }

    cleaned += remaining.slice(0, openIndex);
    remaining = remaining.slice(openIndex + 7);
    state.insideThinkBlock = true;
  }

  return cleaned;
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

    const { message, role_id, message_history } = await req.json() as ChatRequest;
    console.log(`Deep research request from user ${userId}, role_id=${role_id}`);

    // Defaults
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

    // Build messages w/ alternation
    const simpleMessages: { role: string; content: string }[] = [];
    if (message_history && message_history.length > 0) {
      for (const m of message_history) {
        simpleMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      }
    } else {
      simpleMessages.push({ role: 'user', content: message });
    }
    const alternated: typeof simpleMessages = [];
    for (const msg of simpleMessages) {
      if (alternated.length > 0 && alternated[alternated.length - 1].role === msg.role) {
        alternated[alternated.length - 1].content += '\n\n' + msg.content;
      } else {
        alternated.push({ ...msg });
      }
    }

    console.log(`Calling Perplexity (streaming): model=${selectedModel}, messages=${alternated.length}`);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': hb\n\n')); } catch { /* noop */ }
        }, 10000);

        let fullContent = '';
        const citationsSet = new Set<string>();
        const thinkState = { insideThinkBlock: false };

        try {
          const abortController = new AbortController();
          const hardTimeout = setTimeout(() => abortController.abort(), 350000);

          const body: Record<string, unknown> = {
            model: selectedModel,
            messages: [{ role: 'system', content: systemPrompt }, ...alternated],
            stream: true,
            max_tokens: selectedModel.includes('deep-research') ? 4000 : 8000,
          };
          // For deep-research speed up massively
          if (selectedModel.includes('deep-research')) {
            body.reasoning_effort = 'low';
          }

          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            signal: abortController.signal,
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });

          clearTimeout(hardTimeout);

          if (!response.ok || !response.body) {
            const errBody = await response.text().catch(() => '');
            console.error(`Perplexity error: status=${response.status}, body=${errBody.slice(0, 500)}`);
            throw new Error(`Perplexity API error: ${response.status}`);
          }

          const reader = response.body.getReader();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Split by SSE message boundary
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (payload === '[DONE]') continue;

              try {
                const json = JSON.parse(payload);
                const delta: string | undefined = json.choices?.[0]?.delta?.content
                  ?? json.choices?.[0]?.message?.content;
                if (delta) {
                  const cleanedDelta = stripThinkContent(delta, thinkState);
                  if (cleanedDelta) {
                    fullContent += cleanedDelta;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: cleanedDelta, append: true })}\n\n`));
                  }
                }
                const cits: string[] | undefined = json.citations || json.choices?.[0]?.message?.citations;
                if (Array.isArray(cits)) for (const c of cits) if (c) citationsSet.add(c);
              } catch (e) {
                console.warn('SSE parse error', e);
              }
            }
          }

          // Strip <think> blocks from final content for log; do not re-emit (already streamed).
          const cleanedForLog = fullContent.trim();
          if (!cleanedForLog) {
            throw new Error('Исследование не вернуло текст ответа');
          }
          const responseTimeMs = Date.now() - startTime;
          const citations = Array.from(citationsSet);
          console.log(`Deep research streamed in ${responseTimeMs}ms, length=${fullContent.length}, citations=${citations.length}`);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            web_search_citations: citations.length > 0 ? citations : undefined,
            web_search_used: citations.length > 0,
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));

          await supabase.from('chat_logs').insert({
            user_id: userId,
            department_id: deptId,
            provider_id: selectedProviderId || null,
            prompt: message,
            response: cleanedForLog,
            response_time_ms: responseTimeMs,
            metadata: {
              model: selectedModel,
              provider_type: 'perplexity',
              role_id,
              deep_research: true,
              streaming: true,
            },
          });
        } catch (err) {
          console.error('Deep research error:', err);
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'content',
            content: `\n\n⚠️ Ошибка исследования: ${errorMsg}. Попробуйте упростить запрос или повторить позже.`,
            append: true,
          })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: Date.now() - startTime,
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally {
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* noop */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
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
