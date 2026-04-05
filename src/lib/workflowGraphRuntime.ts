import type { EdgeMapping } from '@/types/workflow-editor';

export type TemplateEdgeRow = {
  source_node_id: string;
  target_node_id: string;
  mapping: EdgeMapping[];
};

export type ProjectStepRow = {
  template_step_id: string | null;
  output_data: Record<string, unknown> | null;
  user_edits: Record<string, unknown> | null;
  user_edited_output: Record<string, unknown> | null;
  approved_output: Record<string, unknown> | null;
};

export function getApprovedPayload(step: ProjectStepRow): Record<string, unknown> {
  const a = step.approved_output;
  if (a && typeof a === 'object') return a as Record<string, unknown>;
  const u = step.user_edited_output ?? step.user_edits;
  if (u && typeof u === 'object') return u as Record<string, unknown>;
  const o = step.output_data;
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

/**
 * Собирает input для узла targetTemplateStepId из завершённых шагов по рёбрам и маппингу.
 */
export function buildInputPayloadFromEdges(
  edges: TemplateEdgeRow[],
  stepsByTemplateStepId: Map<string, ProjectStepRow>,
  targetTemplateStepId: string
): Record<string, unknown> {
  const incoming = edges.filter((e) => e.target_node_id === targetTemplateStepId);
  const result: Record<string, unknown> = {};

  for (const edge of incoming) {
    const srcStep = stepsByTemplateStepId.get(edge.source_node_id);
    if (!srcStep) continue;
    const approved = getApprovedPayload(srcStep);
    const mapping = Array.isArray(edge.mapping) ? edge.mapping : [];

    for (const m of mapping) {
      let val: unknown = m.sourcePath ? getAtPath(approved, m.sourcePath) : approved;
      if (m.transform === 'json_stringify' && val !== undefined) {
        val = JSON.stringify(val);
      }
      if (m.targetPath) {
        setAtPath(result, m.targetPath, val);
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(result, val as Record<string, unknown>);
      } else if (val !== undefined) {
        result.merged = result.merged ?? [];
        (result.merged as unknown[]).push(val);
      }
    }
  }

  return result;
}
