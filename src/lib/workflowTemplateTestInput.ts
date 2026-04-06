import type { WorkflowTemplateStep } from '@/types/workflow';
import type { EdgeMapping } from '@/types/workflow-editor';
import type { TemplateEdgeFull } from '@/lib/projectWorkflowConfirm';
import { filterActiveOutgoingEdges } from '@/lib/projectWorkflowConfirm';
import { buildInputPayloadFromEdges, type ProjectStepRow, type TemplateEdgeRow } from '@/lib/workflowGraphRuntime';

function edgeSame(a: TemplateEdgeFull, b: TemplateEdgeFull): boolean {
  return (
    a.source_node_id === b.source_node_id &&
    a.target_node_id === b.target_node_id &&
    (a.source_handle || null) === (b.source_handle || null)
  );
}

/** Обход вверх по графу по активным (с учётом веток) связям, где есть пин выхода. */
export function collectUpstreamTestContext(
  targetTemplateStepId: string,
  edges: TemplateEdgeFull[],
  steps: WorkflowTemplateStep[],
  pins: Record<string, Record<string, unknown>>
): Array<{ step: WorkflowTemplateStep; output: Record<string, unknown> }> {
  const acc = new Map<string, { step: WorkflowTemplateStep; output: Record<string, unknown> }>();

  function visit(nodeId: string) {
    for (const e of edges) {
      if (e.target_node_id !== nodeId) continue;
      const srcId = e.source_node_id;
      const out = pins[srcId];
      if (!out || typeof out !== 'object') continue;
      const srcStep = steps.find((s) => s.id === srcId);
      if (!srcStep) continue;
      const active = filterActiveOutgoingEdges({
        edges,
        sourceTemplateStepId: srcId,
        sourceNodeType: srcStep.node_type || 'agent',
        payload: out,
      });
      if (!active.some((a) => edgeSame(a, e))) continue;
      if (!acc.has(srcId)) {
        acc.set(srcId, { step: srcStep, output: out });
        visit(srcId);
      }
    }
  }

  visit(targetTemplateStepId);
  return Array.from(acc.values()).sort((a, b) => a.step.step_order - b.step.step_order);
}

export function buildTestInputFromPins(
  targetTemplateStepId: string,
  edges: TemplateEdgeFull[],
  steps: WorkflowTemplateStep[],
  pins: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const incoming = edges.filter((e) => e.target_node_id === targetTemplateStepId);
  const used: TemplateEdgeRow[] = [];

  for (const e of incoming) {
    const out = pins[e.source_node_id];
    if (!out || typeof out !== 'object') continue;
    const srcStep = steps.find((s) => s.id === e.source_node_id);
    if (!srcStep) continue;
    const active = filterActiveOutgoingEdges({
      edges,
      sourceTemplateStepId: e.source_node_id,
      sourceNodeType: srcStep.node_type || 'agent',
      payload: out,
    });
    if (!active.some((a) => edgeSame(a, e))) continue;
    used.push({
      source_node_id: e.source_node_id,
      target_node_id: e.target_node_id,
      mapping: (e.mapping as EdgeMapping[]) || [],
    });
  }

  const map = new Map<string, ProjectStepRow>();
  for (const s of steps) {
    const pin = pins[s.id];
    if (pin && typeof pin === 'object') {
      map.set(s.id, {
        template_step_id: s.id,
        output_data: null,
        user_edits: null,
        user_edited_output: null,
        approved_output: pin,
      });
    }
  }

  return buildInputPayloadFromEdges(used, map, targetTemplateStepId);
}

export function formatUpstreamContextBlock(
  items: Array<{ step: WorkflowTemplateStep; output: Record<string, unknown> }>
): string {
  if (items.length === 0) return '';
  let ctx = '## Результаты предыдущих этапов (тест)\n\n';
  for (const { step, output } of items) {
    const content =
      typeof output === 'object' && output !== null && 'content' in output
        ? String((output as Record<string, unknown>).content)
        : JSON.stringify(output);
    ctx += `### ${step.name} (шаг ${step.step_order})\n${content}\n\n`;
  }
  return ctx;
}
