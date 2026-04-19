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

function deriveStructuredInputFromContent(content: string): Record<string, unknown> {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return {};

  const result: Record<string, unknown> = { content: normalized };

  // Helper: extract labeled value (e.g. "Контактное лицо: Марат" → "Марат")
  const extractLabel = (pattern: RegExp): string | null => {
    const m = normalized.match(pattern);
    return m?.[1]?.trim() || null;
  };

  // Parse labeled fields commonly found in trademark request forms
  const contactPerson = extractLabel(/контактное\s+лицо\s*[:\-–]\s*(.+?)(?:\n|телефон|email|$)/i);
  if (contactPerson) result.contact_person = contactPerson;

  const phone = extractLabel(/(?:телефон|тел\.?)\s*(?:\/\s*email)?\s*[:\-–]\s*(.+?)(?:\n|основн|описание|$)/i);
  if (phone) result.phone = phone;

  const email = extractLabel(/(?:email|e-mail|эл\.?\s*почта)\s*[:\-–]\s*(\S+)/i);
  if (email) result.email = email;

  const goodsServices = extractLabel(/основны[ей]\s+товар[ыа]\s+и\s+услуг[иа]\s*[:\-–]\s*(.+?)(?:\n|[A-ZА-ЯЁ]{3,}|описание|$)/i);
  if (goodsServices) result.goods_services = goodsServices;

  const designationDesc = extractLabel(/описание\s+знака\s*[:\-–]\s*(.+)/is);
  if (designationDesc) result.designation_description = designationDesc.replace(/\s+/g, ' ').trim();

  // Trademark / brand: quoted «…» or "…", or standalone ALL-CAPS word (≥3 chars)
  const quotedTm = normalized.match(/[«"]([^"»]{2,80})[»"]/u)?.[1];
  if (quotedTm) {
    result.trademark = quotedTm.trim();
    result.designation = quotedTm.trim();
  }

  if (!result.trademark) {
    const stopWords = new Set([
      'ИНН', 'ОГРН', 'ИП', 'ООО', 'ОАО', 'ЗАО', 'АО', 'ПАО', 'НКО',
      'МКТУ', 'ФИПС', 'JSON', 'DONE',
    ]);
    const allCaps = normalized.match(/\b([A-ZА-ЯЁ]{3,40})\b/gu) || [];
    const brand = allCaps.find((w) => !stopWords.has(w));
    if (brand) {
      result.trademark = brand;
      result.designation = brand;
    }
  }

  // Company name from legal forms or "компания:" label
  const legalMatch = normalized.match(/\b(ООО|ОАО|ЗАО|АО|ПАО|ИП|НКО)\s+[«"]?([^»",.;\n]{2,120})[»"]?/iu);
  if (legalMatch) {
    result.company_name = legalMatch[0].trim();
    result.applicant = legalMatch[0].trim();
  }
  if (!result.company_name) {
    const labeledCompany = extractLabel(/(?:компания|заявитель|организация|наименование)\s*[:\-–]\s*([^\n,.;]{3,120})/i);
    if (labeledCompany) {
      result.company_name = labeledCompany;
      result.applicant = labeledCompany;
    }
  }
  // If still no company, use trademark as a proxy (common for brand-centric requests)
  if (!result.company_name && result.trademark) {
    result.company_name = result.trademark;
  }

  if (!result.goods_services) {
    result.goods_services = normalized;
  }

  return result;
}

function extractReputationQuery(seed: string): string | null {
  const txt = seed.replace(/\s+/g, ' ').trim();
  if (!txt) return null;

  // 1. INN (10 or 12 digits)
  const inn = txt.match(/\b\d{10}(?:\d{2})?\b/)?.[0];
  if (inn) return inn;

  // 2. OGRN (13 or 15 digits)
  const ogrn = txt.match(/\b\d{13}(?:\d{2})?\b/)?.[0];
  if (ogrn) return ogrn;

  // 3. Quoted names «АВАНТЕРМ» / "АВАНТЕРМ"
  const quoted = txt.match(/[«"]([^"»]{2,120})[»"]/u)?.[1];
  if (quoted) return quoted.trim();

  // 4. Legal-form prefixed names: ООО «Рога», ИП Иванов
  const legalForm =
    txt.match(/\b(ООО|ОАО|ЗАО|АО|ПАО|ИП|НКО)\s+[«"]?([^»",.;\n]{2,120})[»"]?/iu);
  if (legalForm) return legalForm[0].trim();

  // 5. All-caps brand names (≥3 Cyrillic/Latin uppercase chars), e.g. АВАНТЕРМ
  const allCaps = txt.match(/\b([A-ZА-ЯЁ]{3,40})\b/u);
  if (allCaps) {
    const candidate = allCaps[1];
    const stopWords = new Set([
      'ИНН', 'ОГРН', 'ИП', 'ООО', 'ОАО', 'ЗАО', 'АО', 'ПАО', 'НКО',
      'МКТУ', 'ФИПС', 'ТЗ', 'КП', 'RAG', 'JSON', 'DONE', 'POST', 'GET',
    ]);
    if (!stopWords.has(candidate)) return candidate;
  }

  // 6. Labeled field: "компания:", "заявитель:", "название:"
  const labeled =
    txt.match(/(?:компания|заявитель|название|бренд|наименование)\s*[:\-–]\s*([^\n,.;]{3,120})/iu)?.[1];
  if (labeled) return labeled.trim();

  // 7. Fallback — first meaningful phrase (skip very long prompt text)
  const firstLine = txt.split(/[.\n]/).find((s) => s.trim().length >= 3 && s.trim().length <= 120);
  if (firstLine) return firstLine.trim();

  return txt.slice(0, 120);
}

async function readSseContent(resp: Response): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const reader = resp.body?.getReader();
  if (!reader) return { content: '', metadata: {} };
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  let metadata: Record<string, unknown> = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const p = JSON.parse(raw);
        if (p.type === 'content' && p.content) content += String(p.content);
        if (p.type === 'metadata' && typeof p === 'object') metadata = p as Record<string, unknown>;
      } catch {
        // ignore malformed chunks
      }
    }
  }
  return { content, metadata };
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

    // Validate JWT via claims (does not require a live session on the server)
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    let user: any;
    if (claimsError || !claimsData?.claims?.sub) {
      // Fallback to getUser if getClaims is unavailable
      const { data: { user: fallbackUser }, error: fallbackErr } = await supabaseAuth.auth.getUser();
      if (fallbackErr || !fallbackUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: jsonHeaders,
        });
      }
      user = fallbackUser;
    } else {
      // Build a minimal user object from claims
      user = { id: claimsData.claims.sub as string, email: (claimsData.claims.email as string) || '' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { step_id, message, additional_context, attachments: requestAttachments } = await req.json();

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

    // Check membership (admins bypass project membership check)
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: 'Not a project member' }), {
          status: 403, headers: jsonHeaders,
        });
      }
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
      let outputData = workingInput && Object.keys(workingInput).length > 0
        ? workingInput
        : { content: message || '' };

      const contentValue =
        typeof (outputData as Record<string, unknown>)?.content === 'string'
          ? String((outputData as Record<string, unknown>).content)
          : '';
      if (contentValue.trim()) {
        // Normalize free-text user input into structured keys for downstream dossier steps.
        outputData = {
          ...deriveStructuredInputFromContent(contentValue),
          ...(outputData as Record<string, unknown>),
        };
      }

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
        const params = {
          ...scriptConfig.params,
          ...workingInput,
          __workflow: {
            project_id: projectId,
            workflow_id: step.workflow_id,
            step_id,
            template_id: templateIdForEdges,
            template_step_id: templateStep?.id ?? null,
            step_order: step.step_order,
          },
        };
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
    // Load agent: prefer template config (fresh source of truth), fallback to snapshot in project step
    let agentRoleId = templateStep?.agent_id || step.agent_id;

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

    // Build a meaningful step-specific query.
    // Important: do not default to workingInput.content because it can copy previous step output
    // and cause all downstream agents to answer the same task.
    let userMessage = message || '';
    if (!userMessage) {
      const stepName = String(templateStep?.name || `Этап ${step.step_order}`);
      const stepDescription = String(templateStep?.description || '');
      const wi = (workingInput || {}) as Record<string, unknown>;
      const hints: string[] = [];
      const pushHint = (v: unknown) => {
        if (typeof v === 'string' && v.trim()) hints.push(v.trim());
      };
      pushHint(wi.trademark);
      pushHint(wi.designation);
      pushHint(wi.company_name);
      pushHint(wi.applicant);
      pushHint(wi.inn);
      pushHint(wi.goods_services);
      pushHint(wi.designation_type);
      const hintText = hints.join(' | ').slice(0, 700);
      userMessage = [
        `Выполни этап workflow: "${stepName}".`,
        stepDescription ? `Описание этапа: ${stepDescription}` : '',
        hintText ? `Ключевые данные: ${hintText}` : '',
        'Используй контекст предыдущих этапов и документы RAG проекта.',
      ].filter(Boolean).join('\n');
    }

    // Load context packs
    const { data: contextPacks } = await supabase
      .from('project_context_packs')
      .select('context_pack_id, context_packs!inner(folder_ids)')
      .eq('project_id', projectId)
      .eq('is_enabled', true);

    let contextFolderIds = contextPacks?.flatMap(
      (p: any) => p.context_packs?.folder_ids || []
    ) || [];

    // Fallback: if no context packs are enabled, include all folders of documents
    // attached to this project so agents can see project RAG (e.g., full МКТУ file).
    if (contextFolderIds.length === 0) {
      const { data: projectDocs } = await supabase
        .from('project_documents')
        .select('documents!inner(folder_id)')
        .eq('project_id', projectId);

      const fallbackFolderIds = (projectDocs || [])
        .map((row: any) => row?.documents?.folder_id as string | null)
        .filter((v: string | null): v is string => !!v);

      if (fallbackFolderIds.length > 0) {
        contextFolderIds = Array.from(new Set(fallbackFolderIds));
      }
    }

    const chatStreamUrl = `${supabaseUrl}/functions/v1/chat-stream`;
    let reputationEnabled = false;
    if (agentRoleId) {
      const { data: roleCfg } = await supabase
        .from('chat_roles')
        .select('external_apis')
        .eq('id', agentRoleId)
        .single();
      const apis = roleCfg?.external_apis as { reputation?: { enabled?: boolean } } | null;
      reputationEnabled = Boolean(apis?.reputation?.enabled);
    }
    const chatBody: Record<string, unknown> = {
      message: userMessage,
      message_history: messageHistory,
      project_id: projectId,
    };

    if (agentRoleId) chatBody.role_id = agentRoleId;
    if (contextFolderIds.length > 0) chatBody.context_folder_ids = contextFolderIds;
    if (systemPromptAppend.trim()) chatBody.system_prompt_append = systemPromptAppend.trim();

    // Collect attachments from: request, current step input/output, AND ALL previous steps in the run
    // (auto-inheritance — independent of edge mapping, so docs from step 1 reach all later agents)
    type AttachmentLike = { file_path?: string; file_name?: string; file_type?: string; file_size?: number; contains_pii?: boolean };
    const collectAttachments = (src: unknown): AttachmentLike[] => {
      if (!src) return [];
      if (Array.isArray(src)) return src.filter((a) => a && typeof a === 'object' && (a as AttachmentLike).file_path) as AttachmentLike[];
      return [];
    };
    const stepInputData = (step.input_data as Record<string, unknown>) || {};
    const merged: AttachmentLike[] = [
      ...collectAttachments(requestAttachments),
      ...collectAttachments(stepInputData.attachments),
      ...collectAttachments((workingInput as Record<string, unknown>).attachments),
    ];
    // Inherit attachments from ALL previous steps of this workflow run
    if (prevSteps && prevSteps.length > 0) {
      for (const ps of prevSteps as Record<string, unknown>[]) {
        const out = (ps.output_data as Record<string, unknown>) || {};
        const approved = (ps.approved_output as Record<string, unknown>) || {};
        const userEd = (ps.user_edited_output as Record<string, unknown>) || (ps.user_edits as Record<string, unknown>) || {};
        merged.push(...collectAttachments(out.attachments));
        merged.push(...collectAttachments(approved.attachments));
        merged.push(...collectAttachments(userEd.attachments));
      }
    }
    // Also pull from input_data of all run steps (covers attachments uploaded on input nodes)
    {
      const { data: runStepsForAtt } = await supabase
        .from('project_workflow_steps')
        .select('input_data, output_data')
        .eq('workflow_id', step.workflow_id);
      for (const rs of (runStepsForAtt || []) as Record<string, unknown>[]) {
        const inp = (rs.input_data as Record<string, unknown>) || {};
        const outp = (rs.output_data as Record<string, unknown>) || {};
        merged.push(...collectAttachments(inp.attachments));
        merged.push(...collectAttachments(outp.attachments));
      }
    }
    // Deduplicate by file_path, limit 5
    const dedupedAttachments = Array.from(
      new Map(merged.filter((a) => a.file_path).map((a) => [a.file_path as string, a])).values()
    ).slice(0, 5);
    if (dedupedAttachments.length > 0) {
      chatBody.attachments = dedupedAttachments;
      console.log(`[workflow-step-execute] Forwarding ${dedupedAttachments.length} attachments (inherited+current) to chat-stream`);
    }

    // When reputation is enabled, always pass reputation_query so chat-stream
    // does NOT short-circuit into "reputation-only" mode that skips the LLM.
    if (reputationEnabled) {
      const wi = (workingInput || {}) as Record<string, unknown>;
      const repSeed = [
        String(wi.company_name || ''),
        String(wi.trademark || ''),
        String(wi.applicant || ''),
        String(wi.designation || ''),
        String(wi.inn || ''),
        String(wi.content || ''),
      ].filter(Boolean).join(' ');
      const repQ = extractReputationQuery(repSeed);
      if (repQ) chatBody.reputation_query = repQ;
    }

    const WORKFLOW_CHAT_TIMEOUT = 180000; // 3 min timeout for workflow agent calls
    const chatResponse = await fetch(chatStreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(chatBody),
      signal: AbortSignal.timeout(WORKFLOW_CHAT_TIMEOUT),
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

          // ── Dossier pipeline: second enrichment pass ──
          // The first chat-stream call already included reputation_query (when enabled),
          // so the LLM received reputation data as context. This second pass is only
          // needed when the first call's output indicates it couldn't find company data
          // (e.g. the LLM mentions it couldn't find the company in reputation DB)
          // and we want to try a refined query extracted from the LLM's own output.
          const isDossierStep = String(templateStep?.name || '').toLowerCase().includes('досье');
          const alreadyHasReputation = Boolean(metadata?.reputation_company_data || metadata?.reputation_enriched);
          if (isDossierStep && reputationEnabled && agentRoleId && !alreadyHasReputation) {
            const repQuerySeed = [
              fullContent,
              String((workingInput as Record<string, unknown>)?.company_name || ''),
              String((workingInput as Record<string, unknown>)?.inn || ''),
              String((workingInput as Record<string, unknown>)?.applicant || ''),
            ].filter(Boolean).join(' ');
            const reputationQuery = extractReputationQuery(repQuerySeed);
            if (reputationQuery) {
              try {
                const enrichBody: Record<string, unknown> = {
                  message: [
                    'Сформируй финальное досье клиента на основе текущего черновика.',
                    'Дополни его результатами Reputation API и сохрани структуру ответа этапа.',
                    'Если API не вернул данных, сохрани имеющуюся информацию и укажи что данные из открытых реестров не найдены.',
                    '',
                    'Черновик досье:',
                    fullContent.slice(0, 12000),
                  ].join('\n'),
                  role_id: agentRoleId,
                  project_id: projectId,
                  reputation_query: reputationQuery,
                };
                if (contextFolderIds.length > 0) enrichBody.context_folder_ids = contextFolderIds;
                if (systemPromptAppend.trim()) enrichBody.system_prompt_append = systemPromptAppend.trim();

                const enrichResp = await fetch(chatStreamUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                  body: JSON.stringify(enrichBody),
                  signal: AbortSignal.timeout(WORKFLOW_CHAT_TIMEOUT),
                });
                if (enrichResp.ok) {
                  const enriched = await readSseContent(enrichResp);
                  if (enriched.content.trim() && enriched.content.trim().length > 100) {
                    fullContent = enriched.content.trim();
                    metadata = { ...metadata, ...enriched.metadata, reputation_enriched: true };
                  }
                }
              } catch (enrichErr) {
                console.error('Dossier enrichment error (non-fatal):', enrichErr);
              }
            }
          }

          // ── Parse two-document output (КП_КЛИЕНТ / КП_СОТРУДНИК) ──
          let clientKp: string | null = null;
          let internalReport: string | null = null;

          const kpClientMarker = '===КП_КЛИЕНТ===';
          const kpEmployeeMarker = '===КП_СОТРУДНИК===';
          const clientIdx = fullContent.indexOf(kpClientMarker);
          const employeeIdx = fullContent.indexOf(kpEmployeeMarker);

          if (clientIdx !== -1 && employeeIdx !== -1 && employeeIdx > clientIdx) {
            clientKp = fullContent
              .slice(clientIdx + kpClientMarker.length, employeeIdx)
              .trim();
            internalReport = fullContent
              .slice(employeeIdx + kpEmployeeMarker.length)
              .trim();
          }

          let parsedResult: Record<string, unknown> | null = null;
          try {
            const m = fullContent.match(/\{[\s\S]*\}/);
            if (m) parsedResult = JSON.parse(m[0]);
          } catch { /* ignore */ }

          const raw_output: Record<string, unknown> = parsedResult
            ? { ...parsedResult, _stream_text: fullContent, metadata }
            : { content: fullContent, metadata };

          // If two-doc split succeeded, store both documents separately
          if (clientKp) {
            raw_output.client_kp = clientKp;
            raw_output.internal_report = internalReport || '';
          }

          const humanReadable = (parsedResult?.human_readable as Record<string, unknown>) || {
            title: 'Результат агента',
            summary: clientKp || fullContent.slice(0, 1200),
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

          // ── Quality check agent (if configured) ──
          if (templateStep?.quality_check_agent_id) {
            try {
              const { data: qcRole } = await supabase
                .from('chat_roles')
                .select('id')
                .eq('id', templateStep.quality_check_agent_id)
                .single();

              if (qcRole) {
                const taskDesc = templateStep.prompt_override || templateStep.description || templateStep.name || 'Этап workflow';
                const qcMessage = [
                  'Проверь качество результата этапа и при необходимости перепиши его в корректную структуру для КП.',
                  'Проверь релевантность задаче, полноту, логику, деловой стиль и структуру.',
                  '',
                  'Верни СТРОГО JSON следующего вида:',
                  '{',
                  '  "verdict": "PASS" | "REWRITE" | "FAIL",',
                  '  "feedback": "краткое объяснение",',
                  '  "corrected_output": "исправленный markdown/текст или пусто",',
                  '  "structure_notes": ["заметка 1", "заметка 2"]',
                  '}',
                  '',
                  'Используй "REWRITE", если можешь исправить сам и дать готовый текст.',
                  'Используй "FAIL", только если без дополнительных данных от пользователя исправить нельзя.',
                  '',
                  `## Задание этапа\n${taskDesc}`,
                  `\n## Результат агента\n${fullContent.slice(0, 12000)}`,
                ].join('\n');
                
                const qcBody: Record<string, unknown> = {
                  message: qcMessage,
                  role_id: qcRole.id,
                  project_id: projectId,
                };
                
                const qcResp = await fetch(`${supabaseUrl}/functions/v1/chat-stream`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                  body: JSON.stringify(qcBody),
                  signal: AbortSignal.timeout(WORKFLOW_CHAT_TIMEOUT),
                });

                if (qcResp.ok) {
                  const qcReader = qcResp.body?.getReader();
                  let qcContent = '';
                  if (qcReader) {
                    const qcDecoder = new TextDecoder();
                    let qcBuf = '';
                    while (true) {
                      const { done: qcDone, value: qcVal } = await qcReader.read();
                      if (qcDone) break;
                      qcBuf += qcDecoder.decode(qcVal, { stream: true });
                      const qcLines = qcBuf.split('\n');
                      qcBuf = qcLines.pop() || '';
                      for (const ql of qcLines) {
                        if (ql.startsWith('data: ')) {
                          const qd = ql.slice(6).trim();
                          if (qd === '[DONE]' || !qd) continue;
                          try { const qp = JSON.parse(qd); if (qp.type === 'content' && qp.content) qcContent += qp.content; } catch {}
                        }
                      }
                    }
                  }

                  // Parse QC verdict + optional corrected output
                  let qcVerdict = 'PASS';
                  let qcFeedback = '';
                  let correctedOutput = '';
                  try {
                    const qcJson = JSON.parse(qcContent.match(/\{[\s\S]*\}/)?.[0] || '{}');
                    qcVerdict = String(qcJson.verdict || 'PASS').toUpperCase();
                    qcFeedback = typeof qcJson.feedback === 'string' ? qcJson.feedback : '';
                    correctedOutput = typeof qcJson.corrected_output === 'string' ? qcJson.corrected_output.trim() : '';
                  } catch {}

                  const qcHasRewrite = qcVerdict === 'REWRITE' && !!correctedOutput;

                  // Save QC result as a step message
                  // Build structured markdown instead of dumping raw JSON
                  let structureNotesMd = '';
                  try {
                    const qcJson = JSON.parse(qcContent.match(/\{[\s\S]*\}/)?.[0] || '{}');
                    const notes = Array.isArray(qcJson.structure_notes) ? qcJson.structure_notes : [];
                    if (notes.length > 0) {
                      structureNotesMd = '\n\n**Замечания по структуре:**\n' + notes.map((n: string) => `- ${n}`).join('\n');
                    }
                  } catch {}

                  await supabase.from('project_step_messages').insert({
                    step_id, user_id: user.id, message_role: 'assistant',
                    content: [
                      `🔍 **Проверка качества**: ${qcVerdict}`,
                      qcFeedback ? `\n\n${qcFeedback}` : '',
                      qcHasRewrite ? '\n\n✅ Материал автоматически переписан под структуру КП.' : '',
                      structureNotesMd,
                    ].join(''),
                    metadata: { type: 'quality_check' },
                  });

                  if (qcHasRewrite) {
                    const rewrittenRawOutput = {
                      ...raw_output,
                      content: correctedOutput,
                      _stream_text: correctedOutput,
                      quality_check: 'REWRITE',
                      quality_feedback: qcFeedback,
                    } as Record<string, unknown>;

                    await supabase.from('project_workflow_steps').update({
                      output_data: rewrittenRawOutput,
                      raw_output: rewrittenRawOutput,
                      human_readable_output: {
                        ...humanReadable,
                        summary: correctedOutput.slice(0, 1200),
                        quality_check: 'REWRITE',
                        quality_feedback: qcFeedback || qcContent.slice(0, 2000),
                      },
                    }).eq('id', step_id);
                  } else if (qcVerdict === 'FAIL') {
                    // If FAIL and no auto-fix, request user intervention
                    await supabase.from('project_workflow_steps').update({
                      status: 'waiting_for_user',
                      human_readable_output: {
                        ...humanReadable,
                        quality_check: 'FAIL',
                        quality_feedback: (qcFeedback || qcContent).slice(0, 2000),
                      },
                    }).eq('id', step_id);
                  }
                }
              }
            } catch (qcErr) {
              console.error('Quality check error:', qcErr);
              // Non-fatal: step stays completed even if QC fails
            }
          }

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
