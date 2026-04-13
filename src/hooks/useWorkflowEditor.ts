import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WorkflowTemplate, WorkflowTemplateStep, WorkflowGraphEdge } from '@/types/workflow';
import type { EdgeMapping, EdgeCondition, WorkflowTemplateSchemaMeta } from '@/types/workflow-editor';
import { workflowQueryKeys } from './useProjectWorkflow';
import { validateWorkflowGraph } from './useWorkflowValidation';
import type { Node, Edge, Connection } from '@xyflow/react';
import type { Json } from '@/integrations/supabase/types';

export const workflowEdgeQueryKey = (templateId: string) =>
  ['workflow-template-edges', templateId] as const;

export interface WorkflowNodeData {
  label: string;
  description: string | null;
  nodeType: string;
  agentId: string | null;
  agentName: string | null;
  promptOverride: string | null;
  isUserEditable: boolean;
  autoRun: boolean;
  requireApproval: boolean;
  model: string | null;
  temperature: number | null;
  tools: unknown[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  scriptConfig: Record<string, unknown>;
  formConfig: Record<string, unknown>;
  outputMode: string;
  nodeKey: string | null;
  resultAssemblyMode: string | null;
  resultTemplateId: string | null;
  qualityCheckAgentId: string | null;
  stageGroup: string | null;
  stageOrder: number;
  stepOrder: number;
  stepId: string;
  [key: string]: unknown;
}

function normalizeTemplate(row: Record<string, unknown>): WorkflowTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    is_active: Boolean(row.is_active),
    version: typeof row.version === 'number' ? row.version : 1,
    template_status: (row.template_status as WorkflowTemplate['template_status']) || 'published',
    schema: (row.schema as WorkflowTemplate['schema']) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function normalizeStep(row: Record<string, unknown>): WorkflowTemplateStep {
  const chatRoles = row.chat_roles as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    step_order: row.step_order as number,
    name: row.name as string,
    description: (row.description as string) ?? null,
    agent_id: (row.agent_id as string) ?? null,
    input_schema: (row.input_schema as Record<string, unknown>) || {},
    output_schema: (row.output_schema as Record<string, unknown>) || {},
    is_user_editable: Boolean(row.is_user_editable),
    auto_run: Boolean(row.auto_run),
    created_at: row.created_at as string,
    prompt_override: (row.prompt_override as string) ?? null,
    node_type: (row.node_type as string) || 'agent',
    position_x: Number(row.position_x) || 0,
    position_y: Number(row.position_y) || 0,
    script_config: (row.script_config as Record<string, unknown>) || {},
    require_approval: row.require_approval !== false,
    model: (row.model as string) ?? null,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    tools: Array.isArray(row.tools) ? row.tools : [],
    form_config: (row.form_config as Record<string, unknown>) || {},
    output_mode: (row.output_mode as string) || 'structured_json',
    node_key: (row.node_key as string) ?? null,
    result_assembly_mode: (row.result_assembly_mode as string) ?? null,
    result_template_id: (row.result_template_id as string) ?? null,
    quality_check_agent_id: (row.quality_check_agent_id as string) ?? null,
    stage_group: (row.stage_group as string) ?? null,
    stage_order: typeof row.stage_order === 'number' ? row.stage_order : 0,
    agent: chatRoles
      ? {
          id: chatRoles.id as string,
          name: chatRoles.name as string,
          slug: chatRoles.slug as string,
          mention_trigger: (chatRoles.mention_trigger as string) ?? null,
          description: (chatRoles.description as string) ?? null,
        }
      : undefined,
  };
}

function rowToGraphEdge(row: Record<string, unknown>): WorkflowGraphEdge {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    source_node_id: row.source_node_id as string,
    target_node_id: row.target_node_id as string,
    source_handle: row.source_handle as string | null,
    target_handle: row.target_handle as string | null,
    mapping: Array.isArray(row.mapping) ? (row.mapping as EdgeMapping[]) : [],
    conditions: Array.isArray(row.conditions) ? (row.conditions as EdgeCondition[]) : [],
    created_at: row.created_at as string,
  };
}

export function useWorkflowEditor(templateId: string | null) {
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const sequentialSeedAttempted = useRef(false);

  useEffect(() => {
    sequentialSeedAttempted.current = false;
  }, [templateId]);

  const { data: template, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['workflow-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      if (error) throw error;
      return normalizeTemplate(data as Record<string, unknown>);
    },
    enabled: !!templateId,
  });

  const { data: steps = [], isLoading: isLoadingSteps } = useQuery({
    queryKey: workflowQueryKeys.templateSteps(templateId || ''),
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('workflow_template_steps')
        .select('*, chat_roles:agent_id(id, name, slug, mention_trigger, description)')
        .eq('template_id', templateId)
        .order('step_order');
      if (error) throw error;
      return (data || []).map((s) => {
        const { chat_roles, ...rest } = s as Record<string, unknown>;
        return normalizeStep({ ...rest, chat_roles });
      });
    },
    enabled: !!templateId,
  });

  const { data: graphEdges = [], isLoading: isLoadingEdges } = useQuery({
    queryKey: workflowEdgeQueryKey(templateId || ''),
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('workflow_template_edges')
        .select('*')
        .eq('template_id', templateId);
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return [];
        }
        throw error;
      }
      return (data || []).map((r) => rowToGraphEdge(r as Record<string, unknown>));
    },
    enabled: !!templateId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['chat-roles-for-workflow'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_roles')
        .select('id, name, slug, mention_trigger, description, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!templateId || isLoadingSteps || isLoadingEdges || sequentialSeedAttempted.current) return;
    if (steps.length < 2 || graphEdges.length > 0) return;
    sequentialSeedAttempted.current = true;
    let cancelled = false;
    (async () => {
      const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const src = sorted[i];
        const tgt = sorted[i + 1];
        const mapping: EdgeMapping[] = [
          { sourcePath: '', targetPath: '', transform: 'passthrough' },
        ];
        rows.push({
          template_id: templateId,
          source_node_id: src.id,
          target_node_id: tgt.id,
          mapping: mapping as unknown as Json,
          conditions: [] as unknown as Json,
        });
      }
      if (rows.length === 0) return;
      const { error } = await supabase.from('workflow_template_edges').insert(rows as never);
      if (error) {
        sequentialSeedAttempted.current = false;
        return;
      }
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: workflowEdgeQueryKey(templateId) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, steps, graphEdges.length, isLoadingSteps, isLoadingEdges, queryClient]);

  const stepsToNodes = useCallback((s: WorkflowTemplateStep[]): Node<WorkflowNodeData>[] => {
    return s.map((step) => ({
      id: step.id,
      type: 'workflowNode',
      position: { x: step.position_x || 0, y: step.position_y || 0 },
      data: {
        label: step.name,
        description: step.description,
        nodeType: step.node_type || 'agent',
        agentId: step.agent_id,
        agentName: step.agent?.name || null,
        promptOverride: step.prompt_override || null,
        isUserEditable: step.is_user_editable,
        autoRun: step.auto_run,
        requireApproval: step.require_approval,
        model: step.model,
        temperature: step.temperature,
        tools: step.tools,
        inputSchema: step.input_schema,
        outputSchema: step.output_schema,
        stepOrder: step.step_order,
        stepId: step.id,
        scriptConfig: step.script_config || {},
        formConfig: step.form_config || {},
        outputMode: step.output_mode,
        nodeKey: step.node_key,
        resultAssemblyMode: step.result_assembly_mode,
        resultTemplateId: step.result_template_id,
        qualityCheckAgentId: step.quality_check_agent_id,
        stageGroup: step.stage_group,
        stageOrder: step.stage_order,
      },
    }));
  }, []);

  const graphEdgesToFlowEdges = useCallback(
    (ge: WorkflowGraphEdge[]): Edge[] =>
      ge.map((e) => {
        const sh = e.source_handle || '';
        let branchLabel: string | undefined;
        if (sh === 'branch_true') branchLabel = 'Да';
        else if (sh === 'branch_false') branchLabel = 'Нет';
        else if (sh === 'branch_pass') branchLabel = 'Ок';
        else if (sh === 'branch_fail') branchLabel = 'Не ок';
        return {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle: e.source_handle || undefined,
          targetHandle: e.target_handle || undefined,
          type: 'workflowEdge',
          animated: true,
          style: { strokeWidth: 2 },
          data: {
            mappingCount: e.mapping?.length ?? 0,
            hasConditions: (e.conditions?.length ?? 0) > 0,
            branchLabel,
          },
        };
      }),
    []
  );

  const nodes = stepsToNodes(steps);
  const edges = useMemo(
    () => graphEdgesToFlowEdges(graphEdges),
    [graphEdges, graphEdgesToFlowEdges]
  );

  const validationIssues = useMemo(
    () => validateWorkflowGraph(steps, graphEdges),
    [steps, graphEdges]
  );

  const selectedStep = steps.find((s) => s.id === selectedNodeId) || null;
  const selectedEdge = graphEdges.find((e) => e.id === selectedEdgeId) || null;

  const updateTemplate = useCallback(
    async (updates: Partial<WorkflowTemplate>) => {
      if (!templateId) return;
      const { error } = await supabase
        .from('workflow_templates')
        .update(updates as Record<string, unknown>)
        .eq('id', templateId);
      if (error) {
        toast.error('Ошибка обновления');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['workflow-template', templateId] });
    },
    [templateId, queryClient]
  );

  const publishTemplate = useCallback(async () => {
    if (!templateId || !template) return;
    const errs = validationIssues.filter((i) => i.severity === 'error');
    if (errs.length > 0) {
      toast.error('Исправьте ошибки валидации перед публикацией');
      return;
    }
    const inputIds = steps
      .filter((s) => s.node_type === 'input')
      .filter((s) => !graphEdges.some((e) => e.target_node_id === s.id))
      .map((s) => s.id);
    const meta: WorkflowTemplateSchemaMeta = {
      entryNodeIds: inputIds,
      global: {},
    };
    const nextVersion =
      template.template_status === 'published'
        ? (template.version || 1) + 1
        : template.version || 1;

    const { error } = await supabase
      .from('workflow_templates')
      .update({
        template_status: 'published',
        version: nextVersion,
        schema: { ...meta, ...(template.schema || {}) } as unknown as Json,
      })
      .eq('id', templateId);
    if (error) {
      toast.error('Ошибка публикации');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['workflow-template', templateId] });
    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templates });
    toast.success('Шаблон опубликован');
  }, [templateId, template, validationIssues, steps, graphEdges, queryClient]);

  const addStep = useCallback(
    async (nodeType: string, position: { x: number; y: number }) => {
      if (!templateId) return;
      const maxOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) : 0;
      const name =
        nodeType === 'input'
          ? 'Ввод данных'
          : nodeType === 'output'
            ? 'Итог'
            : nodeType === 'condition'
              ? 'Условие (IF)'
              : nodeType === 'quality_check'
                ? 'Проверка результата'
                : `Шаг ${maxOrder + 1}`;

      const orchestrationDefaults =
        nodeType === 'condition'
          ? ({
              orchestration: {
                kind: 'if_else',
                combine: 'all',
                rules: [{ field: 'content', operator: 'not_empty' as const, value: undefined }],
              },
            } as Record<string, unknown>)
          : nodeType === 'quality_check'
            ? ({
                orchestration: {
                  kind: 'quality_check',
                  combine: 'all',
                  rules: [{ field: 'content', operator: 'not_empty' as const, value: undefined }],
                },
              } as Record<string, unknown>)
            : {};

      const { data, error } = await supabase
        .from('workflow_template_steps')
        .insert({
          template_id: templateId,
          step_order: maxOrder + 1,
          name,
          node_type: nodeType,
          position_x: position.x,
          position_y: position.y,
          input_schema: {} as Json,
          output_schema: {} as Json,
          form_config: {} as Json,
          script_config: { ...orchestrationDefaults } as Json,
          tools: [] as unknown as Json,
          require_approval: nodeType === 'condition' || nodeType === 'quality_check' ? false : true,
          auto_run: nodeType === 'condition' || nodeType === 'quality_check',
          output_mode: 'structured_json',
        } as never)
        .select()
        .single();

      if (error) {
        toast.error('Ошибка добавления шага');
        return;
      }
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templateSteps(templateId) });
      toast.success('Шаг добавлен');
      return data;
    },
    [templateId, steps, queryClient]
  );

  const updateStep = useCallback(
    async (stepId: string, updates: Record<string, unknown>) => {
      if (!templateId) return;
      const { error } = await supabase
        .from('workflow_template_steps')
        .update(updates as never)
        .eq('id', stepId);
      if (error) {
        toast.error('Ошибка обновления шага');
        return;
      }
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templateSteps(templateId) });
    },
    [templateId, queryClient]
  );

  const deleteStep = useCallback(
    async (stepId: string) => {
      if (!templateId) return;
      await supabase.from('workflow_template_edges').delete().or(`source_node_id.eq.${stepId},target_node_id.eq.${stepId}`);
      const { error } = await supabase.from('workflow_template_steps').delete().eq('id', stepId);
      if (error) {
        toast.error('Ошибка удаления шага');
        return;
      }
      if (selectedNodeId === stepId) setSelectedNodeId(null);
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templateSteps(templateId) });
      queryClient.invalidateQueries({ queryKey: workflowEdgeQueryKey(templateId) });
      toast.success('Шаг удалён');
    },
    [templateId, selectedNodeId, queryClient]
  );

  const saveNodePositions = useCallback(
    async (updatedNodes: Node<WorkflowNodeData>[]) => {
      if (!templateId) return;
      const updates = updatedNodes.map((n) =>
        supabase
          .from('workflow_template_steps')
          .update({ position_x: n.position.x, position_y: n.position.y } as never)
          .eq('id', n.id)
      );
      await Promise.all(updates);
    },
    [templateId]
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!templateId || !connection.source || !connection.target) return;
      const exists = graphEdges.some(
        (e) =>
          e.source_node_id === connection.source &&
          e.target_node_id === connection.target &&
          (e.source_handle || null) === (connection.sourceHandle || null) &&
          (e.target_handle || null) === (connection.targetHandle || null)
      );
      if (exists) {
        toast.message('Такая связь уже есть');
        return;
      }
      const { error } = await supabase.from('workflow_template_edges').insert({
        template_id: templateId,
        source_node_id: connection.source,
        target_node_id: connection.target,
        source_handle: connection.sourceHandle,
        target_handle: connection.targetHandle,
        mapping: [{ sourcePath: '', targetPath: '', transform: 'passthrough' }] as unknown as Json,
        conditions: [] as unknown as Json,
      } as never);
      if (error) {
        toast.error('Не удалось создать связь');
        return;
      }
      queryClient.invalidateQueries({ queryKey: workflowEdgeQueryKey(templateId) });
      toast.success('Связь добавлена');
    },
    [templateId, graphEdges, queryClient]
  );

  const deleteEdge = useCallback(
    async (edgeId: string) => {
      if (!templateId) return;
      const { error } = await supabase.from('workflow_template_edges').delete().eq('id', edgeId);
      if (error) {
        toast.error('Ошибка удаления связи');
        return;
      }
      setSelectedEdgeId(null);
      queryClient.invalidateQueries({ queryKey: workflowEdgeQueryKey(templateId) });
      toast.success('Связь удалена');
    },
    [templateId, queryClient]
  );

  const updateEdge = useCallback(
    async (
      edgeId: string,
      patch: { mapping?: EdgeMapping[]; conditions?: EdgeCondition[] }
    ) => {
      if (!templateId) return;
      const row: Record<string, unknown> = {};
      if (patch.mapping) row.mapping = patch.mapping as unknown as Json;
      if (patch.conditions) row.conditions = patch.conditions as unknown as Json;
      const { error } = await supabase
        .from('workflow_template_edges')
        .update(row as never)
        .eq('id', edgeId);
      if (error) {
        toast.error('Ошибка сохранения связи');
        return;
      }
      queryClient.invalidateQueries({ queryKey: workflowEdgeQueryKey(templateId) });
    },
    [templateId, queryClient]
  );

  return {
    template,
    steps,
    graphEdges,
    agents,
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedStep,
    selectedEdge,
    isLoading: isLoadingTemplate || isLoadingSteps || isLoadingEdges,
    updateTemplate,
    publishTemplate,
    addStep,
    updateStep,
    deleteStep,
    saveNodePositions,
    onConnect,
    deleteEdge,
    updateEdge,
    validationIssues,
  };
}
