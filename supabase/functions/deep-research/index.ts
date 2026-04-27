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

// Lightweight extractor: pulls out the "content" delta from a Perplexity SSE
// `data:` JSON line WITHOUT a full JSON.parse. This dramatically lowers CPU
// usage on long deep-research streams that contain massive <think> blocks.
//
// Returns the raw delta string (still un-unescaped JSON-string contents) or null.
function fastExtractContent(payload: string): string | null {
  // Look for the first occurrence of "content":"..."
  const key = '"content":"';
  const start = payload.indexOf(key);
  if (start === -1) return null;
  let i = start + key.length;
  let out = '';
  while (i < payload.length) {
    const ch = payload.charCodeAt(i);
    if (ch === 92 /* \ */) {
      // Escape sequence: copy the next character verbatim (handles \", \\, \n, etc.)
      const next = payload[i + 1];
      if (next === undefined) break;
      if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else if (next === 'r') out += '\r';
      else if (next === 'u') {
        // \uXXXX
        const hex = payload.slice(i + 2, i + 6);
        if (hex.length === 4) {
          const code = parseInt(hex, 16);
          if (!isNaN(code)) out += String.fromCharCode(code);
          i += 6;
          continue;
        }
        i += 2;
        continue;
      } else {
        out += next;
      }
      i += 2;
      continue;
    }
    if (ch === 34 /* " */) return out;
    out += payload[i];
    i++;
  }
  return out || null;
}

function fastExtractCitations(payload: string): string[] | null {
  const key = '"citations":[';
  const start = payload.indexOf(key);
  if (start === -1) return null;
  const end = payload.indexOf(']', start + key.length);
  if (end === -1) return null;
  const arr = payload.slice(start + key.length, end);
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(arr)) !== null) {
    if (m[1]) out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return out.length ? out : null;
}

// Stream <think> tags out of the stream. Stateful across calls.
function stripThinkContent(chunk: string, state: { insideThinkBlock: boolean }) {
  let remaining = chunk;
  let cleaned = '';
  while (remaining.length > 0) {
    if (state.insideThinkBlock) {
      const closeIndex = remaining.indexOf('</think>');
      if (closeIndex === -1) return cleaned;
      remaining = remaining.slice(closeIndex + 8);
      state.insideThinkBlock = false;
      continue;
    }
    const openIndex = remaining.indexOf('<think>');
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

interface RunStreamOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  maxTokens: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  signal: AbortSignal;
  onContent: (delta: string) => void;
  onCitations: (cits: string[]) => void;
}

async function runPerplexityStream(opts: RunStreamOptions): Promise<{ contentLength: number }> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [{ role: 'system', content: opts.systemPrompt }, ...opts.messages],
    stream: true,
    max_tokens: opts.maxTokens,
  };
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => '');
    console.error(`Perplexity error model=${opts.model}, status=${response.status}, body=${errBody.slice(0, 300)}`);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Track last full chunk for delta-vs-cumulative detection by longest
  // common prefix. This is robust to mid-stream rewrites that Perplexity
  // sometimes emits inside reasoning chunks.
  let lastRawFull = '';
  let buffer = '';
  let contentLength = 0;
  let modeDetected: 'delta' | 'cumulative' | null = null;

  // Compute the new suffix that must be emitted given a previous and a
  // current snapshot. If `current` starts with `previous` it's pure
  // cumulative (just slice). Otherwise we drop only the common prefix —
  // this handles the rare case where the model rewrote a tail token.
  const diffSuffix = (prev: string, curr: string): string => {
    if (!prev) return curr;
    if (curr.startsWith(prev)) return curr.slice(prev.length);
    let i = 0;
    const max = Math.min(prev.length, curr.length);
    while (i < max && prev.charCodeAt(i) === curr.charCodeAt(i)) i++;
    return curr.slice(i);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nlIdx = buffer.indexOf('\n');
    while (nlIdx !== -1) {
      const line = buffer.slice(0, nlIdx).trimEnd();
      buffer = buffer.slice(nlIdx + 1);
      nlIdx = buffer.indexOf('\n');

      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      const rawDelta = fastExtractContent(payload);
      if (rawDelta !== null) {
        // Auto-detect mode on the second chunk: if the new raw payload
        // starts with the previous full payload, this stream is cumulative.
        if (modeDetected === null && lastRawFull) {
          modeDetected = rawDelta.startsWith(lastRawFull) ? 'cumulative' : 'delta';
        }

        let toEmit: string;
        if (modeDetected === 'cumulative') {
          // Each chunk contains everything so far. Diff against last full
          // payload, then strip <think>…</think> from the diff with a
          // fresh state (because <think> blocks live entirely inside the
          // cumulative payload, never split across chunks here).
          const newRaw = diffSuffix(lastRawFull, rawDelta);
          lastRawFull = rawDelta;
          toEmit = stripThinkContent(newRaw, { insideThinkBlock: false });
        } else {
          // Pure delta stream OR first chunk: append.
          lastRawFull += rawDelta;
          toEmit = stripThinkContent(rawDelta, { insideThinkBlock: false });
        }

        if (toEmit) {
          contentLength += toEmit.length;
          opts.onContent(toEmit);
        }
      }
      const cits = fastExtractCitations(payload);
      if (cits) opts.onCitations(cits);
    }
  }
  return { contentLength };
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
      console.error('[deep-research] JWT validation failed:', claimsError?.message || 'no claims');
      return new Response(
        JSON.stringify({ error: 'TOKEN_EXPIRED', message: 'Сессия истекла, обновите страницу' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub;
    const jwtExp = (claimsData.claims as any).exp as number | undefined;
    const secondsToExpiry = jwtExp ? jwtExp - Math.floor(Date.now() / 1000) : null;
    console.log(`[deep-research] JWT valid for user=${userId}, expires in ${secondsToExpiry}s`);

    const { message, role_id, message_history } = await req.json() as ChatRequest;
    console.log(`Deep research request from user ${userId}, role_id=${role_id}`);

    let systemPrompt = 'Ты — исследовательский ассистент. Проводи глубокий анализ и исследование по запросу пользователя.';
    let primaryModel = 'sonar-deep-research';
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
        if (modelConfig?.model) primaryModel = modelConfig.model;
        if (modelConfig?.provider_id) selectedProviderId = modelConfig.provider_id;
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
      if (provider?.api_key) apiKey = provider.api_key;
    }

    if (!apiKey) {
      throw new Error('Perplexity API key not configured');
    }

    // Build history. For deep-research we want a CLEAN, COMPACT input:
    // - drop service/fallback notices
    // - drop massive previous assistant research reports (they bloat context
    //   and cause the next run to stall)
    // For the fallback (sonar-reasoning-pro) we keep more history but still
    // trim noise.
    const NOISE_MARKERS = [
      'Глубокое исследование недоступно',
      'Превышено время CPU',
      '[Генерация остановлена]',
      'Выполняется глубокое исследование',
    ];
    const isNoise = (c: string) => NOISE_MARKERS.some(m => c.includes(m));

    const cleanedHistory: { role: string; content: string }[] = [];
    if (message_history && message_history.length > 0) {
      for (const m of message_history) {
        const content = (m.content || '').trim();
        if (!content) continue;
        if (isNoise(content)) continue;
        cleanedHistory.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
      }
    }
    if (cleanedHistory.length === 0) {
      cleanedHistory.push({ role: 'user', content: message });
    }

    // For the fallback path: keep last ~6 turns and cap each assistant
    // message to ~2000 chars so we never resend a full prior research report.
    const tailHistory = cleanedHistory.slice(-6).map(m => ({
      role: m.role,
      content: m.role === 'assistant' && m.content.length > 2000
        ? m.content.slice(0, 2000) + '…'
        : m.content,
    }));
    // Alternate roles
    const alternated: typeof tailHistory = [];
    for (const msg of tailHistory) {
      if (alternated.length > 0 && alternated[alternated.length - 1].role === msg.role) {
        alternated[alternated.length - 1].content += '\n\n' + msg.content;
      } else {
        alternated.push({ ...msg });
      }
    }
    // Find last user message for deep-research input shrinking.
    let lastUserMessage = message;
    for (let i = alternated.length - 1; i >= 0; i--) {
      if (alternated[i].role === 'user') { lastUserMessage = alternated[i].content; break; }
    }
    const deepResearchMessages = [{ role: 'user', content: lastUserMessage }];

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': hb\n\n')); } catch { /* noop */ }
        }, 10000);

        // Batch content emissions to ~250ms ticks so we don't flood the SSE channel.
        let pendingDelta = '';
        let fullContent = '';
        const citationsSet = new Set<string>();
        let fallbackUsed: string | null = null;
        let firstContentAt: number | null = null;

        const flushPending = () => {
          if (!pendingDelta) return;
          const chunk = pendingDelta;
          pendingDelta = '';
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: chunk, append: true })}\n\n`));
          } catch { /* noop */ }
        };
        const flusher = setInterval(flushPending, 250);

        let lastUsefulContentAt: number | null = null;
        const onContent = (delta: string) => {
          if (firstContentAt === null) firstContentAt = Date.now();
          // Count only non-whitespace useful text as "progress"
          if (delta && delta.trim().length > 0) {
            lastUsefulContentAt = Date.now();
          }
          fullContent += delta;
          pendingDelta += delta;
        };
        const onCitations = (cits: string[]) => {
          for (const c of cits) if (c) citationsSet.add(c);
        };

        try {
          const abortController = new AbortController();
          // Hard wall-clock cap close to platform CPU limit.
          const hardTimeout = setTimeout(() => {
            console.warn('Primary deep-research hit hard wall-clock cap (300s) — aborting');
            try { abortController.abort(); } catch { /* noop */ }
          }, 300000);

          // Smart watchdog: only abort the primary attempt when there is
          // genuinely no useful progress. We do NOT abort just because some
          // arbitrary fixed time elapsed while the model is still streaming.
          const noContentWatchdog = setInterval(() => {
            const now = Date.now();
            // Case 1: no first content within 90s → likely stalled, fall back.
            if (firstContentAt === null && (now - startTime) > 90000) {
              console.warn('Primary deep-research produced no content within 90s — aborting for fallback');
              try { abortController.abort(); } catch { /* noop */ }
              return;
            }
            // Case 2: had content, but stream stalled (no useful tokens) for 75s → fall back.
            if (lastUsefulContentAt !== null && (now - lastUsefulContentAt) > 75000) {
              console.warn('Primary deep-research stalled (>75s no useful tokens) — aborting for fallback');
              try { abortController.abort(); } catch { /* noop */ }
            }
          }, 5000);

          try {
            const isDeepResearch = primaryModel.includes('deep-research');
            await runPerplexityStream({
              apiKey,
              model: primaryModel,
              systemPrompt,
              messages: isDeepResearch ? deepResearchMessages : alternated,
              // Финальный отчёт может быть длинным (10-15 тыс знаков). 8000 токенов резало текст на полуслове —
              // поднимаем до 16000, чтобы дать модели договорить. Perplexity sonar-deep-research поддерживает до 32k output.
              maxTokens: 16000,
              // 'medium' даёт полный отчёт; 'low' обрывал текст на полуслове.
              reasoningEffort: isDeepResearch ? 'medium' : undefined,
              signal: abortController.signal,
              onContent,
              onCitations,
            });
          } catch (primaryErr) {
            console.error('Primary deep-research failed, attempting fallback:', primaryErr);
            // Notify the user we're switching modes.
            const notice = (fullContent ? '\n\n' : '') + '_⚠️ Глубокое исследование недоступно, переключаюсь на быстрый анализ с веб-поиском..._\n\n';
            fullContent += notice;
            pendingDelta += notice;
            flushPending();

            fallbackUsed = 'sonar-reasoning-pro';
            const fallbackAbort = new AbortController();
            const fallbackTimeout = setTimeout(() => fallbackAbort.abort(), 120000);
            try {
              await runPerplexityStream({
                apiKey,
                model: 'sonar-reasoning-pro',
                systemPrompt,
                messages: alternated,
                maxTokens: 8000,
                signal: fallbackAbort.signal,
                onContent,
                onCitations,
              });
            } finally {
              clearTimeout(fallbackTimeout);
            }
          } finally {
            clearTimeout(hardTimeout);
            clearInterval(noContentWatchdog);
          }

          flushPending();

          const cleanedForLog = fullContent.trim();
          if (!cleanedForLog) {
            throw new Error('Превышено время CPU у функции исследования. Попробуйте сузить запрос.');
          }

          const responseTimeMs = Date.now() - startTime;
          const citations = Array.from(citationsSet);
          console.log(`Deep research streamed in ${responseTimeMs}ms, length=${fullContent.length}, citations=${citations.length}, fallback=${fallbackUsed || 'none'}`);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: responseTimeMs,
            web_search_citations: citations.length > 0 ? citations : undefined,
            web_search_used: citations.length > 0,
            fallback_used: fallbackUsed,
            model: fallbackUsed || primaryModel,
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
              model: fallbackUsed || primaryModel,
              provider_type: 'perplexity',
              role_id,
              deep_research: true,
              streaming: true,
              fallback_used: fallbackUsed,
            },
          });
        } catch (err) {
          flushPending();
          console.error('Deep research error:', err);
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'content',
            content: `\n\n⚠️ Ошибка исследования: ${errorMsg}`,
            append: true,
          })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            response_time_ms: Date.now() - startTime,
            fallback_used: fallbackUsed,
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally {
          clearInterval(heartbeat);
          clearInterval(flusher);
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
