import type { WorkflowTemplateStep, WorkflowGraphEdge } from '@/types/workflow';
import type { EditorValidationIssue } from '@/types/workflow-editor';
import { parseOrchestration } from '@/lib/workflowOrchestration';

function hasCycle(
  nodeIds: string[],
  adj: Map<string, string[]>
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (n: string): boolean => {
    if (visited.has(n)) return false;
    if (visiting.has(n)) return true;
    visiting.add(n);
    for (const w of adj.get(n) || []) {
      if (dfs(w)) return true;
    }
    visiting.delete(n);
    visited.add(n);
    return false;
  };

  for (const id of nodeIds) {
    if (dfs(id)) return true;
  }
  return false;
}

/** Топологическая сортировка; возвращает null если цикл */
function topoSort(nodeIds: string[], adj: Map<string, string[]>): string[] | null {
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) inDeg.set(id, 0);
  for (const id of nodeIds) {
    for (const t of adj.get(id) || []) {
      inDeg.set(t, (inDeg.get(t) || 0) + 1);
    }
  }
  const q: string[] = nodeIds.filter((id) => (inDeg.get(id) || 0) === 0);
  const out: string[] = [];
  while (q.length) {
    const u = q.shift()!;
    out.push(u);
    for (const v of adj.get(u) || []) {
      const d = (inDeg.get(v) || 0) - 1;
      inDeg.set(v, d);
      if (d === 0) q.push(v);
    }
  }
  return out.length === nodeIds.length ? out : null;
}

function stepById(steps: WorkflowTemplateStep[], id: string) {
  return steps.find((s) => s.id === id);
}

export function validateWorkflowGraph(
  steps: WorkflowTemplateStep[],
  edges: WorkflowGraphEdge[]
): EditorValidationIssue[] {
  const issues: EditorValidationIssue[] = [];

  if (steps.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no_steps',
      message: 'Добавьте хотя бы один шаг',
    });
    return issues;
  }

  const nodeIds = new Set(steps.map((s) => s.id));
  for (const e of edges) {
    if (!nodeIds.has(e.source_node_id) || !nodeIds.has(e.target_node_id)) {
      issues.push({
        severity: 'error',
        code: 'edge_dangling',
        message: 'Связь ссылается на несуществующий узел',
        edgeId: e.id,
      });
    }
  }

  const incoming = new Map<string, number>();
  for (const s of steps) incoming.set(s.id, 0);
  const adj = new Map<string, string[]>();
  for (const s of steps) adj.set(s.id, []);
  for (const e of edges) {
    if (!adj.has(e.source_node_id)) continue;
    adj.get(e.source_node_id)!.push(e.target_node_id);
    incoming.set(e.target_node_id, (incoming.get(e.target_node_id) || 0) + 1);
  }

  const inputNodes = steps.filter((s) => s.node_type === 'input');
  const entryCandidates = inputNodes.filter((s) => (incoming.get(s.id) || 0) === 0);
  if (entryCandidates.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no_entry',
      message: 'Нужен узел «Ввод данных» без входящих связей',
    });
  }

  const outputNodes = steps.filter((s) => s.node_type === 'output');
  for (const o of outputNodes) {
    if ((incoming.get(o.id) || 0) === 0) {
      issues.push({
        severity: 'error',
        code: 'orphan_output',
        message: `Итоговый узел «${o.name}» без входов`,
        nodeId: o.id,
      });
    }
  }

  if (hasCycle(steps.map((s) => s.id), adj)) {
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: 'В графе есть цикл — разрешены только DAG',
    });
  }

  for (const s of steps) {
    if (s.node_type === 'agent' && !s.agent_id && !(s.prompt_override || '').trim()) {
      issues.push({
        severity: 'warning',
        code: 'agent_no_role',
        message: `Агент «${s.name}»: не выбрана роль и пустой системный промпт`,
        nodeId: s.id,
      });
    }
    if (s.node_type === 'script') {
      const cfg = s.script_config || {};
      const key = (cfg as { scriptKey?: string; function_name?: string }).scriptKey
        || (cfg as { function_name?: string }).function_name;
      if (!key) {
        issues.push({
          severity: 'error',
          code: 'script_no_key',
          message: `Скрипт «${s.name}»: укажите scriptKey или function_name`,
          nodeId: s.id,
        });
      }
    }

    if (s.node_type === 'condition') {
      const orch = parseOrchestration(s.script_config);
      if (!orch || orch.kind !== 'if_else' || !orch.rules?.length) {
        issues.push({
          severity: 'error',
          code: 'condition_no_rules',
          message: `Условие «${s.name}»: добавьте хотя бы одно правило`,
          nodeId: s.id,
        });
      } else {
        for (const r of orch.rules) {
          if (!(r.field || '').trim()) {
            issues.push({
              severity: 'warning',
              code: 'condition_empty_field',
              message: `Условие «${s.name}»: в правиле не указано поле данных`,
              nodeId: s.id,
            });
          }
        }
      }
      const out = edges.filter((e) => e.source_node_id === s.id);
      const hasTrue = out.some((e) => e.source_handle === 'branch_true');
      const hasFalse = out.some((e) => e.source_handle === 'branch_false');
      if (!hasTrue || !hasFalse) {
        issues.push({
          severity: 'warning',
          code: 'condition_branches',
          message: `Условие «${s.name}»: создайте две связи от зелёной (Да) и серой (Нет) точек`,
          nodeId: s.id,
        });
      }
    }

    if (s.node_type === 'quality_check') {
      const orch = parseOrchestration(s.script_config);
      if (!orch || orch.kind !== 'quality_check' || !orch.rules?.length) {
        issues.push({
          severity: 'error',
          code: 'quality_no_rules',
          message: `Проверка «${s.name}»: добавьте требования к полям`,
          nodeId: s.id,
        });
      } else {
        for (const r of orch.rules) {
          if (!(r.field || '').trim()) {
            issues.push({
              severity: 'warning',
              code: 'quality_empty_field',
              message: `Проверка «${s.name}»: укажите поле в каждом требовании`,
              nodeId: s.id,
            });
          }
        }
      }
      const out = edges.filter((e) => e.source_node_id === s.id);
      const hasPass = out.some((e) => e.source_handle === 'branch_pass');
      const hasFail = out.some((e) => e.source_handle === 'branch_fail');
      if (!hasPass || !hasFail) {
        issues.push({
          severity: 'warning',
          code: 'quality_branches',
          message: `Проверка «${s.name}»: добавьте связи «Ок» и «Не ок»`,
          nodeId: s.id,
        });
      }
    }
  }

  for (const e of edges) {
    const src = stepById(steps, e.source_node_id);
    const tgt = stepById(steps, e.target_node_id);
    if (!src || !tgt) continue;
    if (e.mapping.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'edge_no_mapping',
        message: `Связь ${src.name} → ${tgt.name}: нет маппинга полей`,
        edgeId: e.id,
      });
    }
  }

  return issues;
}

export function getTopologicalOrder(
  steps: WorkflowTemplateStep[],
  edges: WorkflowGraphEdge[]
): WorkflowTemplateStep[] | null {
  const adj = new Map<string, string[]>();
  for (const s of steps) adj.set(s.id, []);
  for (const e of edges) {
    if (!adj.has(e.source_node_id)) continue;
    adj.get(e.source_node_id)!.push(e.target_node_id);
  }
  const order = topoSort(
    steps.map((s) => s.id),
    adj
  );
  if (!order) return null;
  const map = new Map(steps.map((s) => [s.id, s] as const));
  return order.map((id) => map.get(id)!).filter(Boolean);
}
