// ============================================================
// workflow-ai-architect
//
// Generate a workflow template graph from a natural-language
// description using Anthropic Claude (Opus 4 by default).
//
// Admin-only. Returns the new template_id (draft) with steps+edges
// already inserted, ready to open in the visual editor.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_NODE_TYPES = new Set([
  "input",
  "agent",
  "quality_check",
  "condition",
  "script",
  "output",
]);

const DEFAULT_MODEL = Deno.env.get("WORKFLOW_AI_ARCHITECT_MODEL") ??
  "claude-opus-4-6";

const SYSTEM_PROMPT = `Ты — архитектор воркфлоу для бизнес-процессов юридической/патентной компании.
Пользователь описывает задачу на русском языке, а ты строишь граф процесса: узлы (nodes) и связи (edges).

ВЕРНИ СТРОГО JSON (без markdown, без текста вокруг) по схеме:
{
  "name": "короткое название 3-7 слов",
  "description": "1-2 предложения о том, что делает процесс",
  "nodes": [
    {
      "node_key": "snake_case_unique_key",
      "name": "Человеческое название шага",
      "description": "Зачем этот шаг нужен",
      "node_type": "input" | "agent" | "quality_check" | "condition" | "script" | "output",
      "suggested_prompt": "для agent/quality_check — черновик системного промпта на русском (200-600 символов)",
      "form_fields": [
        { "key": "snake_case", "label": "Метка поля", "type": "textarea" | "text" | "number", "required": true }
      ]
    }
  ],
  "edges": [
    { "source": "node_key_откуда", "target": "node_key_куда" }
  ],
  "explanation": "1-3 предложения: почему такая архитектура и как это работает"
}

ПРАВИЛА:
1. node_type строго один из: input, agent, quality_check, condition, script, output.
2. Ровно ОДИН node типа "input" (точка входа) с непустым form_fields.
3. Минимум один node типа "output" (итог процесса).
4. Все node_key уникальны и в snake_case (латиница + цифры + _).
5. Для узлов типа "agent" и "quality_check" обязательно заполни suggested_prompt с конкретными инструкциями.
6. Для "input" обязательно заполни form_fields (1-5 полей). Для других типов form_fields не нужен.
7. Все source/target в edges должны ссылаться на существующие node_key.
8. Без циклов (кроме явного retry: quality_check → назад к agent, но это используй редко).
9. Используй quality_check после agent, если результат нужно проверить на соответствие правилам.
10. Держи граф компактным: 3-8 узлов оптимально.

ПРИМЕР для "Хочу автоматически готовить коммерческое предложение по товарному знаку":
{
  "name": "КП по товарному знаку",
  "description": "Собираем информацию, проверяем риски и формируем коммерческое предложение клиенту.",
  "nodes": [
    { "node_key": "start", "name": "Ввод данных клиента", "node_type": "input",
      "description": "Собираем название ТЗ и класс МКТУ",
      "form_fields": [
        { "key": "trademark", "label": "Товарный знак", "type": "text", "required": true },
        { "key": "mktu_class", "label": "Класс МКТУ", "type": "text", "required": true }
      ] },
    { "node_key": "research", "name": "Ресёрч рынка", "node_type": "agent",
      "description": "Проверяем конкурентов и риски отказа",
      "suggested_prompt": "Ты — аналитик патентной практики. Найди похожие зарегистрированные знаки и оцени риск отказа в регистрации. Верни краткий отчёт." },
    { "node_key": "proposal", "name": "Генерация КП", "node_type": "agent",
      "description": "Пишем коммерческое предложение",
      "suggested_prompt": "Ты — менеджер по продажам юр.услуг. На основе ресёрча подготовь КП на регистрацию ТЗ: услуги, сроки, стоимость." },
    { "node_key": "quality", "name": "Проверка КП", "node_type": "quality_check",
      "description": "Проверяем корректность структуры и цен",
      "suggested_prompt": "Проверь что КП содержит разделы: услуги, сроки, стоимость, контакты. Цены указаны в рублях." },
    { "node_key": "done", "name": "Готовое КП", "node_type": "output",
      "description": "Финальный документ для клиента" }
  ],
  "edges": [
    { "source": "start", "target": "research" },
    { "source": "research", "target": "proposal" },
    { "source": "proposal", "target": "quality" },
    { "source": "quality", "target": "done" }
  ],
  "explanation": "Сначала собираем вводные, потом отдельный агент делает ресёрч, второй — пишет КП, quality_check проверяет структуру, в финале получаем готовый документ."
}

Возвращай ТОЛЬКО JSON, без \`\`\`json обёрток.`;

interface AIGraph {
  name: string;
  description?: string;
  nodes: Array<{
    node_key: string;
    name: string;
    description?: string;
    node_type: string;
    suggested_prompt?: string;
    form_fields?: Array<Record<string, unknown>>;
  }>;
  edges: Array<{ source: string; target: string }>;
  explanation?: string;
}

function validate(g: unknown): { graph: AIGraph | null; errors: string[] } {
  const errs: string[] = [];
  if (!g || typeof g !== "object") return { graph: null, errors: ["not an object"] };
  const graph = g as AIGraph;

  if (!graph.name || typeof graph.name !== "string") errs.push("name required");
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    errs.push("nodes required");
  }
  if (!Array.isArray(graph.edges)) errs.push("edges must be an array");

  const keys = new Set<string>();
  const keyRe = /^[a-z][a-z0-9_]*$/;

  (graph.nodes || []).forEach((n, i) => {
    if (!n.node_key || typeof n.node_key !== "string") {
      errs.push(`nodes[${i}].node_key required`);
    } else if (!keyRe.test(n.node_key)) {
      errs.push(`nodes[${i}].node_key must be snake_case ("${n.node_key}")`);
    } else if (keys.has(n.node_key)) {
      errs.push(`nodes[${i}].node_key duplicate: "${n.node_key}"`);
    } else {
      keys.add(n.node_key);
    }
    if (!n.name) errs.push(`nodes[${i}].name required`);
    if (!VALID_NODE_TYPES.has(n.node_type)) {
      errs.push(`nodes[${i}].node_type invalid: "${n.node_type}"`);
    }
  });

  const inputs = (graph.nodes || []).filter((n) => n.node_type === "input");
  const outputs = (graph.nodes || []).filter((n) => n.node_type === "output");
  if (inputs.length === 0) errs.push("must have at least one input node");
  if (inputs.length > 1) errs.push("must have exactly one input node");
  if (outputs.length === 0) errs.push("must have at least one output node");

  (graph.edges || []).forEach((e, i) => {
    if (!keys.has(e.source)) errs.push(`edges[${i}].source unknown: "${e.source}"`);
    if (!keys.has(e.target)) errs.push(`edges[${i}].target unknown: "${e.target}"`);
    if (e.source === e.target) errs.push(`edges[${i}] is a self-loop on "${e.source}"`);
  });

  return { graph: errs.length === 0 ? graph : null, errors: errs };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // try to find the first { ... } block
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Failed to parse JSON from AI response");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const description = typeof body.description === "string"
      ? body.description.trim()
      : "";
    const model = typeof body.model === "string" && body.model.length > 0
      ? body.model
      : DEFAULT_MODEL;

    if (description.length < 10) {
      return new Response(
        JSON.stringify({ error: "description must be at least 10 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── call Claude ──
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Описание процесса:\n\n${description}\n\nПострой граф воркфлоу и верни JSON.`,
          },
        ],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("Claude API error", claudeResp.status, errText);
      return new Response(
        JSON.stringify({
          error: "Claude API failed",
          status: claudeResp.status,
          details: errText.slice(0, 500),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const claudeJson = await claudeResp.json();
    const rawText: string = claudeJson?.content?.[0]?.text ?? "";

    let parsed: unknown;
    try {
      parsed = extractJson(rawText);
    } catch (err) {
      console.error("Failed to parse Claude output", err);
      return new Response(
        JSON.stringify({
          error: "AI returned non-JSON",
          raw: rawText.slice(0, 800),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { graph, errors } = validate(parsed);
    if (!graph) {
      return new Response(
        JSON.stringify({
          error: "AI graph failed validation",
          validation: errors,
          raw: parsed,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── insert via service role ──
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tpl, error: tplErr } = await adminClient
      .from("workflow_templates")
      .insert({
        name: graph.name,
        description: graph.description ?? null,
        created_by: userId,
        template_status: "draft",
        is_active: true,
        version: 1,
        schema: {},
      })
      .select("id")
      .single();

    if (tplErr || !tpl) {
      console.error("Template insert failed", tplErr);
      return new Response(
        JSON.stringify({ error: "Failed to create template", details: tplErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const templateId = tpl.id as string;

    // Auto-layout: simple horizontal line. Good enough for v1; users can rearrange.
    const keyToId = new Map<string, string>();
    const stepRows = graph.nodes.map((n, idx) => {
      const id = crypto.randomUUID();
      keyToId.set(n.node_key, id);
      const isInput = n.node_type === "input";
      const isOutput = n.node_type === "output";
      const requireApproval =
        n.node_type === "agent" || n.node_type === "quality_check";

      return {
        id,
        template_id: templateId,
        step_order: idx + 1,
        name: n.name,
        description: n.description ?? null,
        node_type: n.node_type,
        node_key: n.node_key,
        position_x: 80 + idx * 280,
        position_y: 140,
        agent_id: null,
        prompt_override: n.suggested_prompt ?? null,
        is_user_editable: true,
        auto_run: false,
        require_approval: requireApproval,
        input_schema: {},
        output_schema: {},
        tools: [],
        form_config: isInput && Array.isArray(n.form_fields)
          ? { fields: n.form_fields }
          : {},
        output_mode: isOutput ? "replace" : "structured_json",
        stage_order: 0,
      };
    });

    const { error: stepsErr } = await adminClient
      .from("workflow_template_steps")
      .insert(stepRows);

    if (stepsErr) {
      console.error("Steps insert failed", stepsErr);
      await adminClient
        .from("workflow_templates")
        .delete()
        .eq("id", templateId);
      return new Response(
        JSON.stringify({ error: "Failed to insert steps", details: stepsErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const edgeRows = graph.edges.map((e) => ({
      template_id: templateId,
      source_node_id: keyToId.get(e.source)!,
      target_node_id: keyToId.get(e.target)!,
      mapping: [],
      conditions: [],
    }));

    if (edgeRows.length > 0) {
      const { error: edgesErr } = await adminClient
        .from("workflow_template_edges")
        .insert(edgeRows);
      if (edgesErr) {
        console.error("Edges insert failed", edgesErr);
        await adminClient
          .from("workflow_templates")
          .delete()
          .eq("id", templateId);
        return new Response(
          JSON.stringify({ error: "Failed to insert edges", details: edgesErr }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // entryNodeIds = ids of input nodes
    const entryNodeIds = graph.nodes
      .filter((n) => n.node_type === "input")
      .map((n) => keyToId.get(n.node_key)!)
      .filter(Boolean);

    await adminClient
      .from("workflow_templates")
      .update({ schema: { entryNodeIds } })
      .eq("id", templateId);

    return new Response(
      JSON.stringify({
        template_id: templateId,
        name: graph.name,
        description: graph.description ?? null,
        explanation: graph.explanation ?? null,
        node_count: graph.nodes.length,
        edge_count: graph.edges.length,
        model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("workflow-ai-architect failed", err);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        message: (err as Error).message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
