import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WorkflowTemplate, WorkflowTemplateStep } from '@/types/workflow';
import { workflowQueryKeys } from './useProjectWorkflow';
import type { Node, Edge } from '@xyflow/react';
import type { Json } from '@/integrations/supabase/types';

export interface WorkflowNodeData {
  label: string;
  description: string | null;
  nodeType: string;
  agentId: string | null;
  agentName: string | null;
  promptOverride: string | null;
  isUserEditable: boolean;
  autoRun: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  stepOrder: number;
  stepId: string;
  [key: string]: unknown;
}

export function useWorkflowEditor(templateId: string | null) {
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Load template
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
      return data as unknown as WorkflowTemplate;
    },
    enabled: !!templateId,
  });

  // Load steps
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
      return (data || []).map((s: any) => ({
        ...s,
        agent: s.chat_roles || undefined,
        chat_roles: undefined,
      })) as WorkflowTemplateStep[];
    },
    enabled: !!templateId,
  });

  // Load agents
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

  // Convert steps to React Flow nodes
  const stepsToNodes = useCallback((steps: WorkflowTemplateStep[]): Node<WorkflowNodeData>[] => {
    return steps.map((step) => ({
      id: step.id,
      type: 'workflowNode',
      position: { x: (step as any).position_x || 0, y: (step as any).position_y || 0 },
      data: {
        label: step.name,
        description: step.description,
        nodeType: (step as any).node_type || 'agent',
        agentId: step.agent_id,
        agentName: step.agent?.name || null,
        promptOverride: (step as any).prompt_override || null,
        isUserEditable: step.is_user_editable,
        autoRun: step.auto_run,
        inputSchema: step.input_schema,
        outputSchema: step.output_schema,
        stepOrder: step.step_order,
        stepId: step.id,
      },
    }));
  }, []);

  // Convert steps to edges
  const stepsToEdges = useCallback((steps: WorkflowTemplateStep[]): Edge[] => {
    const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
    const edges: Edge[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      edges.push({
        id: `e-${sorted[i].id}-${sorted[i + 1].id}`,
        source: sorted[i].id,
        target: sorted[i + 1].id,
        type: 'smoothstep',
        animated: true,
        style: { strokeWidth: 2 },
      });
    }
    return edges;
  }, []);

  const nodes = stepsToNodes(steps);
  const edges = stepsToEdges(steps);

  const selectedStep = steps.find(s => s.id === selectedNodeId) || null;

  // Update template
  const updateTemplate = useCallback(async (updates: Partial<WorkflowTemplate>) => {
    if (!templateId) return;
    const { error } = await supabase
      .from('workflow_templates')
      .update(updates as any)
      .eq('id', templateId);
    if (error) { toast.error('Ошибка обновления'); return; }
    queryClient.invalidateQueries({ queryKey: ['workflow-template', templateId] });
  }, [templateId, queryClient]);

  // Add step
  const addStep = useCallback(async (nodeType: string, position: { x: number; y: number }) => {
    if (!templateId) return;
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) : 0;
    const name = nodeType === 'input' ? 'Ввод данных' : nodeType === 'output' ? 'Итог' : `Шаг ${maxOrder + 1}`;

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
      } as any)
      .select()
      .single();

    if (error) { toast.error('Ошибка добавления шага'); return; }
    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templateSteps(templateId) });
    toast.success('Шаг добавлен');
    return data;
  }, [templateId, steps, queryClient]);

  // Update step
  const updateStep = useCallback(async (stepId: string, updates: Record<string, any>) => {
    if (!templateId) return;
    const { error } = await supabase
      .from('workflow_template_steps')
      .update(updates)
      .eq('id', stepId);
    if (error) { toast.error('Ошибка обновления шага'); return; }
    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templateSteps(templateId) });
  }, [templateId, queryClient]);

  // Delete step
  const deleteStep = useCallback(async (stepId: string) => {
    if (!templateId) return;
    const { error } = await supabase
      .from('workflow_template_steps')
      .delete()
      .eq('id', stepId);
    if (error) { toast.error('Ошибка удаления шага'); return; }
    if (selectedNodeId === stepId) setSelectedNodeId(null);
    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.templateSteps(templateId) });
    toast.success('Шаг удалён');
  }, [templateId, selectedNodeId, queryClient]);

  // Save node positions
  const saveNodePositions = useCallback(async (updatedNodes: Node<WorkflowNodeData>[]) => {
    if (!templateId) return;
    const updates = updatedNodes.map(n => 
      supabase
        .from('workflow_template_steps')
        .update({ position_x: n.position.x, position_y: n.position.y } as any)
        .eq('id', n.id)
    );
    await Promise.all(updates);
  }, [templateId]);

  return {
    template,
    steps,
    agents,
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    selectedStep,
    isLoading: isLoadingTemplate || isLoadingSteps,
    updateTemplate,
    addStep,
    updateStep,
    deleteStep,
    saveNodePositions,
  };
}
