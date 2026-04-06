import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function approvedPayload(ps: Record<string, unknown>): Record<string, unknown> {
  const a = ps.approved_output;
  if (a && typeof a === 'object') return a as Record<string, unknown>;
  const u = ps.user_edited_output ?? ps.user_edits;
  if (u && typeof u === 'object') return u as Record<string, unknown>;
  const o = ps.output_data;
  if (o && typeof o === 'object') return o as Record<string, unknown>;
  return {};
}

function getAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  if (!path) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(target, value as Record<string, unknown>);
    } else {
      target.value = value as unknown;
    }
    return;
  }
  const parts = path.split('.').filter(Boolean);
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value as unknown;
}

function buildInputFromEdges(
  edges: Record<string, unknown>[],
  stepsByTemplateId: Map<string, Record<string, unknown>>,
  targetTemplateStepId: string,
): Record<string, unknown> {
  const incoming = edges.filter((e) => e.target_node_id === targetTemplateStepId);
  const result: Record<string, unknown> = {};
  for (const edge of incoming) {
    const srcStep = stepsByTemplateId.get(edge.source_node_id as string);
    if (!srcStep) continue;
    const approved = approvedPayload(srcStep);
    const mapping = (edge.mapping as Record<string, unknown>[]) || [];
    for (const m of mapping) {
      const sp = (m.sourcePath as string) || '';
      const tp = (m.targetPath as string) || '';
      let val: unknown = sp ? getAtPath(approved, sp) : approved;
      if (m.transform === 'json_stringify' && val !== undefined) {
        val = JSON.stringify(val);
      }
      if (tp) setAtPath(result, tp, val);
      else if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(result, val as Record<string, unknown>);
      }
    }
  }
  return result;
}

function compareValues(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b))) {
    return a === Number(b);
  }
  if (typeof b === 'number' && typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a))) {
    return Number(a) === b;
  }
  return a === b;
}

function evaluateOrchestrationRule(
  rule: { field: string; operator: string; value?: unknown },
  payload: Record<string, unknown>,
): boolean {
  const v = rule.field ? getAtPath(payload, rule.field) : payload;
  const op = rule.operator;
  switch (op) {
    case 'exists':
      return v !== undefined && v !== null;
    case 'not_exists':
      return v === undefined || v === null;
    case 'empty':
      return v == null || v === '' || (Array.isArray(v) && v.length === 0);
    case 'not_empty':
      return !(v == null || v === '' || (Array.isArray(v) && v.length === 0));
    case 'truthy':
      return Boolean(v);
    case 'falsy':
      return !v;
    case 'eq':
      return compareValues(v, rule.value);
    case 'neq':
      return !compareValues(v, rule.value);
    case 'contains': {
      const sub = rule.value != null ? String(rule.value) : '';
      if (sub === '') return false;
      if (typeof v === 'string') return v.includes(sub);
      if (Array.isArray(v)) return v.map(String).some((s) => s.includes(sub));
      return String(v ?? '').includes(sub);
    }
    case 'not_contains': {
      const sub = rule.value != null ? String(rule.value) : '';
      if (sub === '') return true;
      if (typeof v === 'string') return !v.includes(sub);
      if (Array.isArray(v)) return !v.map(String).some((s) => s.includes(sub));
      return !String(v ?? '').includes(sub);
    }
    case 'gt':
      return Number(v) > Number(rule.value);
    case 'gte':
      return Number(v) >= Number(rule.value);
    case 'lt':
      return Number(v) < Number(rule.value);
    case 'lte':
      return Number(v) <= Number(rule.value);
    default:
      return true;
  }
}

function evaluateIfElseOrchestration(
  orch: { kind?: string; combine?: string; rules?: unknown[] } | null | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!orch || orch.kind !== 'if_else' || !Array.isArray(orch.rules) || orch.rules.length === 0) {
    return false;
  }
  const combine = orch.combine === 'any' ? 'any' : 'all';
  const results = (orch.rules as { field: string; operator: string; value?: unknown }[]).map((r) =>
    evaluateOrchestrationRule(r, payload)
  );
  return combine === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function evaluateQualityOrchestration(
  orch: { kind?: string; combine?: string; rules?: unknown[] } | null | undefined,
  payload: Record<string, unknown>,
): { passed: boolean; errors: string[] } {
  if (!orch || orch.kind !== 'quality_check' || !Array.isArray(orch.rules)) {
    return { passed: true, errors: [] };
  }
  const combine = orch.combine === 'any' ? 'any' : 'all';
  const errors: string[] = [];
  const rules = orch.rules as { field: string; operator: string; value?: unknown }[];
  const results = rules.map((r, i) => {
    const ok = evaluateOrchestrationRule(r, payload);
    if (!ok) errors.push(`Правило ${i + 1} (${r.field}): не выполнено`);
    return ok;
  });
  const passed = combine === 'any' ? results.some(Boolean) : results.every(Boolean);
  return { passed, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { step_id, message, additional_context } = await req.json();

    if (!step_id) {
      return new Response(JSON.stringify({ error: 'step_id is required' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Load step with workflow
    const { data: step, error: stepError } = await supabase
      .from('project_workflow_steps')
      .select('*, project_workflows!inner(project_id, template_id)')
      .eq('id', step_id)
      .single();

    if (stepError || !step) {
      return new Response(JSON.stringify({ error: 'Step not found' }), {
        status: 404, headers: jsonHeaders,
      });
    }

    const projectId = step.project_workflows.project_id;

    // Check membership
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a project member' }), {
        status: 403, headers: jsonHeaders,
      });
    }

    // Load template step for node_type, prompt_override, script_config, schemas
    let templateStep: Record<string, any> | null = null;
    if (step.template_step_id) {
      const { data } = await supabase
        .from('workflow_template_steps')
        .select('*')
        .eq('id', step.template_step_id)
        .single();
      templateStep = data;
    }

    const nodeType = templateStep?.node_type || 'agent';
    const promptOverride = templateStep?.prompt_override || null;
    const scriptConfig = templateStep?.script_config || {};
    const outputSchema = templateStep?.output_schema || {};
    const inputSchema = templateStep?.input_schema || {};

    let workingInput: Record<string, unknown> = {
      ...((step.input_data as Record<string, unknown>) || {}),
    };
    const templateIdForEdges = step.project_workflows.template_id as string;
    if (templateStep?.id) {
      const { data: edgeRows } = await supabase
        .from('workflow_template_edges')
        .select('*')
        .eq('template_id', templateIdForEdges);
      const { data: allWfSteps } = await supabase
        .from('project_workflow_steps')
        .select('*')
        .eq('workflow_id', step.workflow_id);
      if (edgeRows && allWfSteps && edgeRows.length > 0) {
        const map = new Map<string, Record<string, unknown>>();
        for (const s of allWfSteps) {
          if (s.template_step_id) map.set(s.template_step_id as string, s as Record<string, unknown>);
        }
        const built = buildInputFromEdges(
          edgeRows as Record<string, unknown>[],
          map,
          templateStep.id as string,
        );
        if (built && Object.keys(built).length > 0) {
          workingInput = { ...built, ...workingInput };
        }
      }
    }

    // Update step status to running + сохранить смерженный input (рёбра + маппинг)
    await supabase
      .from('project_workflow_steps')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        error_message: null,
        input_data: workingInput,
      })
      .eq('id', step_id);

    // Update workflow status
    await supabase
      .from('project_workflows')
      .update({ status: 'running' })
      .eq('id', step.workflow_id);

    // ============ INPUT NODE ============
    if (nodeType === 'input') {
      // Input nodes just pass input_data as output_data
      const outputData = workingInput && Object.keys(workingInput).length > 0
        ? workingInput
        : { content: message || '' };

      await supabase
        .from('project_workflow_steps')
        .update({
          status: 'completed',
          output_data: outputData,
          raw_output: outputData,
          human_readable_output: {
            title: 'Входные данные',
            summary: typeof outputData === 'object' && outputData && 'content' in outputData
              ? String((outputData as Record<string, unknown>).content)
              : JSON.stringify(outputData),
          },
          completed_at: new Date().toISOString(),
        })
        .eq('id', step_id);

      await checkWorkflowCompletion(supabase, step.workflow_id);

      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ type: 'content', content: typeof outputData === 'object' && 'content' in outputData ? outputData.content : JSON.stringify(outputData) })}\n\ndata: [DONE]\n\n`
      );
      return new Response(body, { headers: corsHeaders });
    }

    // ============ CONDITION (ветвление if / else) ============
    if (nodeType === 'condition') {
      const orch = (scriptConfig as Record<string, unknown>)?.orchestration as
        | { kind?: string; combine?: string; rules?: unknown[] }
        | undefined;
      const ok = evaluateIfElseOrchestration(orch, workingInput);
      const outputData = {
        ...workingInput,
        _branch: ok ? 'true' : 'false',
        _condition_met: ok,
      } as Record<string, unknown>;
      const summary = ok ? 'Условие выполнено — пойдёт ветка «Да»' : 'Условие не выполнено — пойдёт ветка «Нет»';

      await supabase.from('project_workflow_steps').update({
        status: 'completed',
        output_data: outputData,
        raw_output: outputData,
        human_readable_output: { title: 'Условие (IF)', summary },
        completed_at: new Date().toISOString(),
      }).eq('id', step_id);

      await checkWorkflowCompletion(supabase, step.workflow_id);

      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ type: 'content', content: summary })}\n\ndata: [DONE]\n\n`,
      );
      return new Response(body, { headers: corsHeaders });
    }

    // ============ QUALITY CHECK (проверка результата) ============
    if (nodeType === 'quality_check') {
      const orch = (scriptConfig as Record<string, unknown>)?.orchestration as
        | { kind?: string; combine?: string; rules?: unknown[] }
        | undefined;
      const { passed, errors } = evaluateQualityOrchestration(orch, workingInput);
      const outputData = {
        ...workingInput,
        quality_passed: passed,
        quality_errors: errors,
      } as Record<string, unknown>;
      const summary = passed
        ? 'Проверка пройдена'
        : `Проверка не пройдена: ${errors.slice(0, 5).join('; ')}`;

      await supabase.from('project_workflow_steps').update({
        status: 'completed',
        output_data: outputData,
        raw_output: outputData,
        human_readable_output: { title: 'Проверка данных', summary },
        completed_at: new Date().toISOString(),
      }).eq('id', step_id);

      await supabase.from('project_step_messages').insert({
        step_id,
        user_id: user.id,
        message_role: 'assistant',
        content: summary,
      });

      await checkWorkflowCompletion(supabase, step.workflow_id);

      const encoder = new TextEncoder();
      const body = encoder.encode(
        `data: ${JSON.stringify({ type: 'content', content: summary })}\n\ndata: [DONE]\n\n`,
      );
      return new Response(body, { headers: corsHeaders });
    }

    // ============ SCRIPT NODE ============
    if (nodeType === 'script') {
      const functionName = scriptConfig.function_name || scriptConfig.scriptKey;
      if (!functionName) {
        await supabase.from('project_workflow_steps').update({
          status: 'error', error_message: 'No function_name in script_config',
        }).eq('id', step_id);
        return new Response(JSON.stringify({ error: 'No function_name in script_config' }), {
          status: 400, headers: jsonHeaders,
        });
      }

      try {
        // Build params from input_data and script_config.params
        const params = { ...scriptConfig.params, ...workingInput };
        const scriptUrl = `${supabaseUrl}/functions/v1/${functionName}`;
        const scriptResponse = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify(params),
        });

        const resultText = await scriptResponse.text();
        let resultData: Record<string, unknown>;
        try {
          resultData = JSON.parse(resultText);
        } catch {
          resultData = { content: resultText };
        }

        await supabase.from('project_workflow_steps').update({
          status: 'completed',
          output_data: resultData,
          raw_output: resultData,
          human_readable_output: {
            title: 'Скрипт',
            summary: typeof resultData === 'object' && resultData && 'content' in resultData
              ? String(resultData.content)
              : JSON.stringify(resultData).slice(0, 500),
          },
          completed_at: new Date().toISOString(),
        }).eq('id', step_id);

        await supabase.from('project_step_messages').insert({
          step_id, user_id: user.id, message_role: 'assistant',
          content: typeof resultData === 'object' && 'content' in resultData
            ? String(resultData.content)
            : JSON.stringify(resultData),
        });

        await checkWorkflowCompletion(supabase, step.workflow_id);

        const encoder = new TextEncoder();
        const body = encoder.encode(
          `data: ${JSON.stringify({ type: 'content', content: JSON.stringify(resultData) })}\n\ndata: [DONE]\n\n`
        );
        return new Response(body, { headers: corsHeaders });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Script execution failed';
        await supabase.from('project_workflow_steps').update({
          status: 'error', error_message: errorMsg,
        }).eq('id', step_id);
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500, headers: jsonHeaders,
        });
      }
    }

    // ============ AGENT & OUTPUT NODES ============
    // Load agent
    let agentRoleId = step.agent_id;
    if (!agentRoleId && templateStep?.agent_id) {
      agentRoleId = templateStep.agent_id;
    }

    // Load previous steps' output for context
    const { data: prevSteps } = await supabase
      .from('project_workflow_steps')
      .select('step_order, output_data, user_edits, user_edited_output, approved_output')
      .eq('workflow_id', step.workflow_id)
      .lt('step_order', step.step_order)
      .eq('status', 'completed')
      .order('step_order');

    // Load project memory
    const { data: projectMemory } = await supabase
      .from('project_memory')
      .select('memory_type, content')
      .eq('project_id', projectId)
      .eq('is_active', true);

    // Load step messages for chat history
    const { data: stepMessages } = await supabase
      .from('project_step_messages')
      .select('message_role, content')
      .eq('step_id', step_id)
      .order('created_at');

    // Build context message
    let contextMessage = '';

    if (prevSteps && prevSteps.length > 0) {
      contextMessage += '## Результаты предыдущих этапов\n\n';
      for (const ps of prevSteps) {
        const data = approvedPayload(ps as Record<string, unknown>);
        const content = typeof data === 'object' && data !== null && 'content' in data
          ? (data as Record<string, unknown>).content
          : JSON.stringify(data);
        contextMessage += `### Этап ${ps.step_order}\n${content}\n\n`;
      }
    }

    if (workingInput && Object.keys(workingInput).length > 0) {
      contextMessage += '## Входные данные текущего этапа\n\n';
      const inputContent = typeof workingInput === 'object' && 'content' in workingInput
        ? workingInput.content
        : JSON.stringify(workingInput);
      contextMessage += `${inputContent}\n\n`;
    }

    if (projectMemory && projectMemory.length > 0) {
      contextMessage += '## Память проекта\n\n';
      for (const mem of projectMemory) {
        contextMessage += `- [${mem.memory_type}] ${mem.content}\n`;
      }
      contextMessage += '\n';
    }

    if (additional_context) {
      contextMessage += `## Дополнительный контекст\n\n${additional_context}\n\n`;
    }

    // Build system_prompt_append from prompt_override + output_schema
    let systemPromptAppend = '';

    if (promptOverride) {
      systemPromptAppend += promptOverride;
    }

    if (nodeType === 'output') {
      systemPromptAppend += '\n\nТвоя задача — собрать и структурировать результаты всех предыдущих этапов в финальный документ. Объедини все данные в единый связный текст.';
    }

    if (outputSchema && Object.keys(outputSchema).length > 0) {
      systemPromptAppend += `\n\nВерни результат в формате JSON со следующей структурой:\n\`\`\`json\n${JSON.stringify(outputSchema, null, 2)}\n\`\`\``;
    }

    // Build message history
    const messageHistory: { role: string; content: string }[] = [];

    if (contextMessage) {
      messageHistory.push({ role: 'user', content: contextMessage });
      messageHistory.push({ role: 'assistant', content: 'Понял контекст. Готов выполнить задачу этого этапа.' });
    }

    if (stepMessages && stepMessages.length > 0) {
      for (const msg of stepMessages) {
        messageHistory.push({ role: msg.message_role, content: msg.content });
      }
    }

    const userMessage = message || 'Выполни задачу этого этапа на основе предоставленного контекста.';

    // Load context packs
    const { data: contextPacks } = await supabase
      .from('project_context_packs')
      .select('context_pack_id, context_packs!inner(folder_ids)')
      .eq('project_id', projectId)
      .eq('is_enabled', true);

    const contextFolderIds = contextPacks?.flatMap(
      (p: any) => p.context_packs?.folder_ids || []
    ) || [];

    // Call chat-stream
    const chatStreamUrl = `${supabaseUrl}/functions/v1/chat-stream`;
    const chatBody: Record<string, unknown> = {
      message: userMessage,
      message_history: messageHistory,
      project_id: projectId,
    };

    if (agentRoleId) chatBody.role_id = agentRoleId;
    if (contextFolderIds.length > 0) chatBody.context_folder_ids = contextFolderIds;
    if (systemPromptAppend.trim()) chatBody.system_prompt_append = systemPromptAppend.trim();

    const chatResponse = await fetch(chatStreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(chatBody),
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      await supabase.from('project_workflow_steps').update({
        status: 'error', error_message: `Chat stream error: ${errText}`,
      }).eq('id', step_id);
      return new Response(JSON.stringify({ error: 'Chat stream failed' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    // Stream through, accumulate content
    const reader = chatResponse.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: 'No stream reader' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    let fullContent = '';
    let metadata: Record<string, unknown> = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            controller.enqueue(value);

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]' || !data) continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'content' && parsed.content) {
                    fullContent += parsed.content;
                  }
                  if (parsed.type === 'metadata') {
                    metadata = parsed;
                  }
                } catch { /* skip */ }
              }
            }
          }

          let parsedResult: Record<string, unknown> | null = null;
          try {
            const m = fullContent.match(/\{[\s\S]*\}/);
            if (m) parsedResult = JSON.parse(m[0]);
          } catch { /* ignore */ }

          const raw_output = parsedResult
            ? { ...parsedResult, _stream_text: fullContent, metadata }
            : { content: fullContent, metadata };
          const humanReadable = (parsedResult?.human_readable as Record<string, unknown>) || {
            title: 'Результат агента',
            summary: fullContent.slice(0, 1200),
          };

          await supabase.from('project_workflow_steps').update({
            status: 'completed',
            output_data: raw_output,
            raw_output,
            human_readable_output: humanReadable,
            completed_at: new Date().toISOString(),
          }).eq('id', step_id);

          await supabase.from('project_step_messages').insert({
            step_id, user_id: user.id, message_role: 'assistant',
            content: fullContent, metadata: metadata as any,
          });

          await checkWorkflowCompletion(supabase, step.workflow_id);

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          await supabase.from('project_workflow_steps').update({
            status: 'error', error_message: errorMsg,
          }).eq('id', step_id);
          controller.error(err);
        }
      },
    });

    return new Response(stream, { headers: corsHeaders });
  } catch (error) {
    console.error('workflow-step-execute error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function checkWorkflowCompletion(supabase: any, workflowId: string) {
  const { data: allSteps } = await supabase
    .from('project_workflow_steps')
    .select('status')
    .eq('workflow_id', workflowId);
  const allCompleted = allSteps?.every((s: any) => s.status === 'completed' || s.status === 'skipped');
  if (allCompleted) {
    await supabase.from('project_workflows').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', workflowId);
  }
}
