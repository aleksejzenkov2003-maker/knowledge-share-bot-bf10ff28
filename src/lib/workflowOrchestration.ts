import type { EdgeCondition, EdgeConditionOperator } from '@/types/workflow-editor';

export type OrchestrationRule = {
  field: string;
  operator: EdgeConditionOperator;
  value?: unknown;
};

/** Хранится в workflow_template_steps.script_config.orchestration (ветвление) */
export type IfElseOrchestration = {
  kind: 'if_else';
  /** all = каждое правило должно выполняться; any = достаточно одного */
  combine: 'all' | 'any';
  rules: OrchestrationRule[];
};

export type QualityCheckOrchestration = {
  kind: 'quality_check';
  combine: 'all' | 'any';
  rules: OrchestrationRule[];
};

export function getAtPath(obj: unknown, path: string): unknown {
  if (!path?.trim()) return obj;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
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

export function evaluateRule(rule: OrchestrationRule, payload: Record<string, unknown>): boolean {
  const v = getAtPath(payload, rule.field);
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

export function evaluateIfElse(orch: IfElseOrchestration | null | undefined, payload: Record<string, unknown>): boolean {
  if (!orch || orch.kind !== 'if_else' || !Array.isArray(orch.rules) || orch.rules.length === 0) {
    return false;
  }
  const combine = orch.combine || 'all';
  const results = orch.rules.map((r) => evaluateRule(r, payload));
  return combine === 'any' ? results.some(Boolean) : results.every(Boolean);
}

export function evaluateQualityCheck(
  orch: QualityCheckOrchestration | null | undefined,
  payload: Record<string, unknown>
): { passed: boolean; errors: string[] } {
  if (!orch || orch.kind !== 'quality_check' || !Array.isArray(orch.rules)) {
    return { passed: true, errors: [] };
  }
  const combine = orch.combine || 'all';
  const errors: string[] = [];
  const results = orch.rules.map((r, i) => {
    const ok = evaluateRule(r, payload);
    if (!ok) {
      errors.push(`Правило ${i + 1} (${r.field}, ${r.operator}): не выполнено`);
    }
    return ok;
  });
  const passed = combine === 'any' ? results.some(Boolean) : results.every(Boolean);
  return { passed, errors };
}

export function evaluateEdgeConditions(
  conditions: EdgeCondition[] | null | undefined,
  payload: Record<string, unknown>
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    const rule: OrchestrationRule = {
      field: c.field,
      operator: c.operator,
      value: c.value,
    };
    return evaluateRule(rule, payload);
  });
}

/** Ветка с узлов condition: branch_true | branch_false */
export function edgeMatchesBranchHandle(
  sourceHandle: string | null | undefined,
  branch: 'true' | 'false'
): boolean {
  if (!sourceHandle) return true;
  if (sourceHandle === 'branch_true') return branch === 'true';
  if (sourceHandle === 'branch_false') return branch === 'false';
  return true;
}

/** Ветка с узлов quality_check: branch_pass | branch_fail */
export function edgeMatchesQualityHandle(
  sourceHandle: string | null | undefined,
  passed: boolean
): boolean {
  if (!sourceHandle) return true;
  if (sourceHandle === 'branch_pass') return passed;
  if (sourceHandle === 'branch_fail') return !passed;
  return true;
}

export function parseOrchestration(scriptConfig: Record<string, unknown> | null | undefined):
  | IfElseOrchestration
  | QualityCheckOrchestration
  | null {
  const o = scriptConfig?.orchestration;
  if (!o || typeof o !== 'object') return null;
  const kind = (o as { kind?: string }).kind;
  if (kind === 'if_else') return o as IfElseOrchestration;
  if (kind === 'quality_check') return o as QualityCheckOrchestration;
  return null;
}
