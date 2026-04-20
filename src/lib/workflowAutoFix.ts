// ============================================================
// Workflow editor — deterministic auto-fix helpers
//
// No AI here: we only apply safe, predictable fixes the user
// could do manually in one click.
// ============================================================

import type { EdgeMapping } from '@/types/workflow-editor';
import type { WorkflowGraphEdge, WorkflowTemplateStep } from '@/types/workflow';

/** Generic passthrough: source.$ → target.$ (copy whole output as input). */
export const DEFAULT_PASSTHROUGH_MAPPING: EdgeMapping[] = [
  { sourcePath: '$', targetPath: '$' },
];

/**
 * "Simple mode" edge: empty mapping, or single $→$ row, or single empty row
 * (legacy seed). For these edges the engine implicitly passes whole approved
 * output of the source as input of the target — no manual mapping needed.
 */
export function isPassthroughEdge(mapping: EdgeMapping[] | null | undefined): boolean {
  if (!mapping || mapping.length === 0) return true;
  if (mapping.length !== 1) return false;
  const m = mapping[0];
  const sp = (m.sourcePath || '').trim();
  const tp = (m.targetPath || '').trim();
  return (sp === '' || sp === '$') && (tp === '' || tp === '$');
}

/**
 * Build a suggested mapping for an edge based on source.output_schema and
 * target.input_schema / form_config. Falls back to passthrough when there
 * is nothing specific to match.
 *
 * Heuristics (in priority order):
 *   1. Match by exact key.
 *   2. Match by case-insensitive key.
 *   3. If target has a single required field and source has a single output
 *      key, wire them together.
 *   4. Fall back to passthrough $ → $.
 */
export function suggestMappingForEdge(
  source: WorkflowTemplateStep | undefined,
  target: WorkflowTemplateStep | undefined,
): EdgeMapping[] {
  if (!source || !target) return DEFAULT_PASSTHROUGH_MAPPING;

  const sourceKeys = extractSchemaKeys(source.output_schema);
  const targetKeys = extractTargetKeys(target);

  if (sourceKeys.length === 0 || targetKeys.length === 0) {
    return DEFAULT_PASSTHROUGH_MAPPING;
  }

  const mapping: EdgeMapping[] = [];
  const targetByLower = new Map(targetKeys.map((k) => [k.toLowerCase(), k]));

  for (const sk of sourceKeys) {
    const direct = targetByLower.get(sk.toLowerCase());
    if (direct) {
      mapping.push({ sourcePath: `$.${sk}`, targetPath: `$.${direct}` });
    }
  }

  if (mapping.length === 0 && sourceKeys.length === 1 && targetKeys.length === 1) {
    mapping.push({
      sourcePath: `$.${sourceKeys[0]}`,
      targetPath: `$.${targetKeys[0]}`,
    });
  }

  return mapping.length > 0 ? mapping : DEFAULT_PASSTHROUGH_MAPPING;
}

function extractSchemaKeys(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const s = schema as { properties?: Record<string, unknown>; fields?: unknown[] };
  if (s.properties && typeof s.properties === 'object') {
    return Object.keys(s.properties);
  }
  if (Array.isArray(s.fields)) {
    return s.fields
      .map((f) =>
        typeof f === 'object' && f !== null && typeof (f as { key?: string }).key === 'string'
          ? (f as { key: string }).key
          : null,
      )
      .filter((k): k is string => !!k);
  }
  const plain = schema as Record<string, unknown>;
  const propLike = Object.keys(plain).filter((k) => !k.startsWith('$'));
  return propLike;
}

function extractTargetKeys(step: WorkflowTemplateStep): string[] {
  const fromInput = extractSchemaKeys(step.input_schema);
  if (fromInput.length > 0) return fromInput;

  const form = step.form_config as { fields?: Array<{ key?: string }> } | undefined;
  if (form && Array.isArray(form.fields)) {
    return form.fields
      .map((f) => (typeof f.key === 'string' ? f.key : null))
      .filter((k): k is string => !!k);
  }
  return [];
}

/**
 * Return list of edges that currently have no mapping and would benefit
 * from auto-fix. Used for the bulk action in ValidationPanel.
 */
export function edgesNeedingMapping(
  edges: WorkflowGraphEdge[],
): WorkflowGraphEdge[] {
  return edges.filter((e) => !e.mapping || e.mapping.length === 0);
}
