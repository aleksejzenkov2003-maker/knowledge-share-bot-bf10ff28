import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/integrations/supabase/types';
import type { EdgeCondition, EdgeMapping } from '@/types/workflow-editor';
import {
  buildInputPayloadFromEdges,
  type ProjectStepRow,
  type TemplateEdgeRow,
} from '@/lib/workflowGraphRuntime';
import {
  evaluateEdgeConditions,
  edgeMatchesBranchHandle,
  edgeMatchesQualityHandle,
} from '@/lib/workflowOrchestration';

export type TemplateEdgeFull = TemplateEdgeRow & {
  id?: string;
  conditions?: EdgeCondition[];
  source_handle?: string | null;
};

export function filterActiveOutgoingEdges(args: {
  edges: TemplateEdgeFull[];
  sourceTemplateStepId: string;
  sourceNodeType: string;
  payload: Record<string, unknown>;
}): TemplateEdgeFull[] {
  const { edges, sourceTemplateStepId, sourceNodeType, payload } = args;
  const outgoing = edges.filter((e) => e.source_node_id === sourceTemplateStepId);

  return outgoing.filter((e) => {
    if (sourceNodeType === 'condition') {
      const branch = payload._branch === true || payload._branch === 'true' ? 'true' : 'false';
      if (!edgeMatchesBranchHandle(e.source_handle, branch)) return false;
    }
    if (sourceNodeType === 'quality_check') {
      const passed = payload.quality_passed === true;
      if (!edgeMatchesQualityHandle(e.source_handle, passed)) return false;
    }
    return evaluateEdgeConditions(e.conditions, payload);
  });
}

/**
 * Подтверждение шага: approved_output, маппинг по рёбрам, пропуск несработавших веток, событие.
 */
export async function confirmProjectWorkflowStep(
  supabase: SupabaseClient,
  params: {
    workflowId: string;
    stepId: string;
    /** После подтверждения этим payload фильтруются рёбра */
    approvedPayload: Record<string, unknown>;
    /** Ручное подтверждение QC означает «пропустить дальше», даже если авто-QC вернул fail. */
    forceQualityPass?: boolean;
  }
): Promise<{ targetTemplateIds: string[] } | { error: string }> {
  const { workflowId, stepId, forceQualityPass = false } = params;

  const { data: stepRow, error: stepErr } = await supabase
    .from('project_workflow_steps')
    .select(
      'id, template_step_id, step_order, user_edits, user_edited_output, approved_output, output_data, raw_output, workflow_id'
    )
    .eq('id', stepId)
    .single();

  if (stepErr || !stepRow || stepRow.workflow_id !== workflowId) {
    return { error: 'step_not_found' };
  }

  const templateStepId = stepRow.template_step_id as string | null;
  if (!templateStepId) {
    return { error: 'no_template_step' };
  }

  const { data: wfRow, error: wfErr } = await supabase
    .from('project_workflows')
    .select('id, project_id, template_id')
    .eq('id', workflowId)
    .single();

  if (wfErr || !wfRow) {
    return { error: 'workflow_not_found' };
  }

  const { data: tmplStep } = await supabase
    .from('workflow_template_steps')
    .select('node_type')
    .eq('id', templateStepId)
    .maybeSingle();

  const sourceNodeType = (tmplStep?.node_type as string) || 'agent';
  const approvedPayload =
    forceQualityPass && sourceNodeType === 'quality_check'
      ? { ...params.approvedPayload, quality_passed: true, quality_errors: [] }
      : params.approvedPayload;

  const { data: allProjSteps, error: psErr } = await supabase
    .from('project_workflow_steps')
    .select(
      'id, template_step_id, step_order, output_data, user_edits, user_edited_output, approved_output'
    )
    .eq('workflow_id', workflowId);

  if (psErr || !allProjSteps) {
    return { error: 'steps_load_failed' };
  }

  const { data: edgeRows, error: edgeErr } = await supabase
    .from('workflow_template_edges')
    .select('*')
    .eq('template_id', wfRow.template_id as string);

  const templateEdges: TemplateEdgeFull[] =
    !edgeErr && edgeRows
      ? edgeRows.map((e) => ({
          source_node_id: e.source_node_id as string,
          target_node_id: e.target_node_id as string,
          mapping: (e.mapping as EdgeMapping[]) || [],
          conditions: (e.conditions as EdgeCondition[]) || [],
          source_handle: e.source_handle as string | null,
          id: e.id as string,
        }))
      : [];

  await supabase
    .from('project_workflow_steps')
    .update({
      approved_output: approvedPayload as unknown as Json,
      raw_output: (stepRow.raw_output ?? stepRow.output_data) as unknown as Json,
    } as never)
    .eq('id', stepId);

  const stepsMap = new Map<string, ProjectStepRow>();
  for (const s of allProjSteps) {
    const tid = s.template_step_id as string | null;
    if (tid) {
      stepsMap.set(tid, {
        template_step_id: tid,
        output_data: s.output_data as Record<string, unknown> | null,
        user_edits: s.user_edits as Record<string, unknown> | null,
        user_edited_output: s.user_edited_output as Record<string, unknown> | null,
        approved_output: s.approved_output as Record<string, unknown> | null,
      });
    }
  }
  const cur = stepsMap.get(templateStepId);
  if (cur) {
    stepsMap.set(templateStepId, {
      ...cur,
      approved_output: approvedPayload,
    });
  }

  const activeEdges = filterActiveOutgoingEdges({
    edges: templateEdges,
    sourceTemplateStepId: templateStepId,
    sourceNodeType,
    payload: approvedPayload,
  });

  const outgoing = templateEdges.filter((e) => e.source_node_id === templateStepId);
  const activeTargets = new Set(activeEdges.map((e) => e.target_node_id));

  for (const tplTargetId of activeTargets) {
    const targetProj = allProjSteps.find((s) => s.template_step_id === tplTargetId);
    if (!targetProj) continue;
    const payload = buildInputPayloadFromEdges(templateEdges, stepsMap, tplTargetId);
    await supabase
      .from('project_workflow_steps')
      .update({ input_data: payload as unknown as Json } as never)
      .eq('id', targetProj.id as string);
  }

  for (const e of outgoing) {
    if (activeTargets.has(e.target_node_id)) continue;
    if (
      (sourceNodeType === 'condition' || sourceNodeType === 'quality_check') &&
      e.source_handle
    ) {
      const targetProj = allProjSteps.find((s) => s.template_step_id === e.target_node_id);
      if (!targetProj) continue;
      await supabase
        .from('project_workflow_steps')
        .update({ status: 'skipped' as never, error_message: 'Ветка не выбрана' } as never)
        .eq('id', targetProj.id as string);
    }
  }

  let resultTargets = [...activeTargets];

  if (outgoing.length === 0) {
    const curOrder = stepRow.step_order as number;
    const next = allProjSteps.find((s) => (s.step_order as number) === curOrder + 1);
    if (next?.template_step_id) {
      await supabase
        .from('project_workflow_steps')
        .update({ input_data: approvedPayload as unknown as Json } as never)
        .eq('id', next.id as string);
      resultTargets = [next.template_step_id as string];
    }
  }

  try {
    await supabase.from('workflow_event_logs').insert({
      project_id: wfRow.project_id,
      workflow_run_id: workflowId,
      project_workflow_step_id: stepId,
      event_type: 'step_confirmed',
      payload: { step_id: stepId } as unknown as Json,
    } as never);
  } catch {
    /* optional table */
  }

  return { targetTemplateIds: resultTargets };
}
