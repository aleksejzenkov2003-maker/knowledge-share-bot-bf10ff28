import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  WorkflowTemplate,
  WorkflowTemplateStep,
  ProjectWorkflow,
  ProjectWorkflowStep,
  ProjectStepMessage,
  WorkflowStatus,
  WorkflowStepStatus,
} from '@/types/workflow';
import type { Json } from '@/integrations/supabase/types';
import {
  buildInputPayloadFromEdges,
  type ProjectStepRow,
  type TemplateEdgeRow,
} from '@/lib/workflowGraphRuntime';

const STREAM_UPDATE_INTERVAL = 50;

// Query keys
export const workflowQueryKeys = {
  templates: ['workflow-templates'] as const,
  templateSteps: (templateId: string) => ['workflow-template-steps', templateId] as const,
  projectWorkflows: (projectId: string) => ['project-workflows', projectId] as const,
  workflowSteps: (workflowId: string) => ['workflow-steps', workflowId] as const,
  stepMessages: (stepId: string) => ['step-messages', stepId] as const,
};

// ========================
// Queries
// ========================

export function useWorkflowTemplatesQuery() {
  return useQuery({
    queryKey: workflowQueryKeys.templates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('is_active', true)
        .or('template_status.eq.published,template_status.is.null')
        .order('created_at');
      if (error) {
        const { data: fallback, error: err2 } = await supabase
          .from('workflow_templates')
          .select('*')
          .eq('is_active', true)
          .order('created_at');
        if (err2) throw error;
        return fallback as unknown as WorkflowTemplate[];
      }
      return data as unknown as WorkflowTemplate[];
    },
  });
}

export function useTemplateStepsQuery(templateId: string | null) {
  return useQuery({
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
}

export function useProjectWorkflowsQuery(projectId: string | null) {
  return useQuery({
    queryKey: workflowQueryKeys.projectWorkflows(projectId || ''),
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('project_workflows')
        .select('*, workflow_templates:template_id(*)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((w: any) => ({
        ...w,
        template: w.workflow_templates || undefined,
        workflow_templates: undefined,
      })) as ProjectWorkflow[];
    },
    enabled: !!projectId,
  });
}

export function useWorkflowStepsQuery(workflowId: string | null) {
  return useQuery({
    queryKey: workflowQueryKeys.workflowSteps(workflowId || ''),
    queryFn: async () => {
      if (!workflowId) return [];
      const { data, error } = await supabase
        .from('project_workflow_steps')
        .select('*, workflow_template_steps:template_step_id(id, name, description, step_order, is_user_editable, auto_run, require_approval, node_type, node_key, script_config), chat_roles:agent_id(id, name, slug, mention_trigger, description)')
        .eq('workflow_id', workflowId)
        .order('step_order');
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        template_step: s.workflow_template_steps || undefined,
        agent: s.chat_roles || undefined,
        workflow_template_steps: undefined,
        chat_roles: undefined,
      })) as ProjectWorkflowStep[];
    },
    enabled: !!workflowId,
  });
}

export function useStepMessagesQuery(stepId: string | null) {
  return useQuery({
    queryKey: workflowQueryKeys.stepMessages(stepId || ''),
    queryFn: async () => {
      if (!stepId) return [];
      const { data, error } = await supabase
        .from('project_step_messages')
        .select('*')
        .eq('step_id', stepId)
        .order('created_at');
      if (error) throw error;
      return data as unknown as ProjectStepMessage[];
    },
    enabled: !!stepId,
  });
}

// ========================
// Main hook
// ========================

export function useProjectWorkflow(projectId: string | null, userId: string | undefined) {
  const queryClient = useQueryClient();
  
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const streamingContentRef = useRef('');
  const updateIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: templates = [] } = useWorkflowTemplatesQuery();
  const { data: workflows = [], isLoading: isLoadingWorkflows } = useProjectWorkflowsQuery(projectId);
  const { data: steps = [], isLoading: isLoadingSteps } = useWorkflowStepsQuery(activeWorkflowId);
  const { data: stepMessages = [] } = useStepMessagesQuery(activeStepId);

  // Auto-select first workflow
  useEffect(() => {
    if (!activeWorkflowId && workflows.length > 0) {
      setActiveWorkflowId(workflows[0].id);
    }
  }, [workflows, activeWorkflowId]);

  // Auto-select first step
  useEffect(() => {
    if (!activeStepId && steps.length > 0) {
      setActiveStepId(steps[0].id);
    }
  }, [steps, activeStepId]);

  const activeWorkflow = workflows.find(w => w.id === activeWorkflowId) || null;
  const activeStep = steps.find(s => s.id === activeStepId) || null;

  // Create workflow from template
  const createWorkflow = useCallback(async (templateId: string) => {
    if (!projectId || !userId) return null;

    try {
      const { data: tmplRow } = await supabase
        .from('workflow_templates')
        .select('version')
        .eq('id', templateId)
        .maybeSingle();

      const { data: workflow, error: wfError } = await supabase
        .from('project_workflows')
        .insert({
          project_id: projectId,
          template_id: templateId,
          created_by: userId,
          status: 'draft' as WorkflowStatus,
          template_version_snapshot: (tmplRow as { version?: number } | null)?.version ?? 1,
        } as never)
        .select()
        .single();

      if (wfError) throw wfError;

      // Load template steps
      const { data: templateSteps, error: tsError } = await supabase
        .from('workflow_template_steps')
        .select('*')
        .eq('template_id', templateId)
        .order('step_order');

      if (tsError) throw tsError;

      // Create workflow steps from template
      if (templateSteps && templateSteps.length > 0) {
        const stepsToInsert = templateSteps.map(ts => ({
          workflow_id: workflow.id,
          template_step_id: ts.id,
          step_order: ts.step_order,
          agent_id: ts.agent_id,
          status: 'pending' as any,
          input_data: {} as Json,
          output_data: {} as Json,
        }));

        const { error: stepsError } = await supabase
          .from('project_workflow_steps')
          .insert(stepsToInsert);

        if (stepsError) throw stepsError;
      }

      setActiveWorkflowId(workflow.id);
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.projectWorkflows(projectId) });
      toast.success('Workflow создан');
      return workflow;
    } catch (error) {
      console.error('Error creating workflow:', error);
      toast.error('Ошибка создания workflow');
      return null;
    }
  }, [projectId, userId, queryClient]);

  // Execute a step
  const executeStep = useCallback(async (stepId: string, message?: string) => {
    if (!userId) return;

    setIsExecuting(true);
    streamingContentRef.current = '';
    setStreamingContent('');

    try {
      abortControllerRef.current = new AbortController();
      const { data: { session } } = await supabase.auth.getSession();

      // Save user message to step chat if provided
      if (message) {
        await supabase
          .from('project_step_messages')
          .insert({
            step_id: stepId,
            user_id: userId,
            message_role: 'user',
            content: message,
          });
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-step-execute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ step_id: stepId, message }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      updateIntervalRef.current = window.setInterval(() => {
        setStreamingContent(streamingContentRef.current);
      }, STREAM_UPDATE_INTERVAL);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]' || !data) continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content' && parsed.content) {
                streamingContentRef.current += parsed.content;
              }
            } catch {
              // skip
            }
          }
        }
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.stepMessages(stepId) });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: workflowQueryKeys.projectWorkflows(projectId) });
      }
      
      toast.success('Этап выполнен');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error executing step:', error);
        toast.error('Ошибка выполнения этапа');
      }
    } finally {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      setIsExecuting(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  }, [userId, activeWorkflowId, projectId, queryClient]);

  // Stop execution
  const stopExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Save user edits on a step
  const saveUserEdits = useCallback(async (stepId: string, edits: Record<string, unknown>) => {
    try {
      const { error } = await supabase
        .from('project_workflow_steps')
        .update({
          user_edits: edits as unknown as Json,
          user_edited_output: edits as unknown as Json,
        } as never)
        .eq('id', stepId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
      toast.success('Изменения сохранены');
    } catch (error) {
      console.error('Error saving edits:', error);
      toast.error('Ошибка сохранения');
    }
  }, [activeWorkflowId, queryClient]);

  // Confirm step and pass data to next (через рёбра и маппинг или линейно)
  const confirmStep = useCallback(async (stepId: string) => {
    const step = steps.find((s) => s.id === stepId);
    if (!step || !activeWorkflowId) return;

    const wf = workflows.find((w) => w.id === activeWorkflowId);
    if (!wf) return;

    const approved =
      step.user_edited_output ||
      step.user_edits ||
      step.approved_output ||
      step.output_data;

    await supabase
      .from('project_workflow_steps')
      .update({
        approved_output: approved as unknown as Json,
        raw_output: (step.raw_output ?? step.output_data) as unknown as Json,
      } as never)
      .eq('id', stepId);

    const { data: edgeRows, error: edgeErr } = await supabase
      .from('workflow_template_edges')
      .select('*')
      .eq('template_id', wf.template_id);

    const templateEdges: TemplateEdgeRow[] =
      !edgeErr && edgeRows
        ? edgeRows.map((e) => ({
            source_node_id: e.source_node_id as string,
            target_node_id: e.target_node_id as string,
            mapping: (e.mapping as TemplateEdgeRow['mapping']) || [],
          }))
        : [];

    const stepsMap = new Map<string, ProjectStepRow>();
    for (const s of steps) {
      if (s.template_step_id) {
        stepsMap.set(s.template_step_id, {
          template_step_id: s.template_step_id,
          output_data: s.output_data,
          user_edits: s.user_edits,
          user_edited_output: s.user_edited_output,
          approved_output: s.approved_output,
        });
      }
    }
    if (step.template_step_id) {
      const cur = stepsMap.get(step.template_step_id);
      if (cur) {
        stepsMap.set(step.template_step_id, {
          ...cur,
          approved_output: approved as Record<string, unknown>,
          user_edited_output: (step.user_edited_output ?? step.user_edits) as Record<string, unknown> | null,
        });
      }
    }

    const targets = new Set<string>();
    if (templateEdges.length > 0 && step.template_step_id) {
      for (const e of templateEdges) {
        if (e.source_node_id === step.template_step_id) {
          targets.add(e.target_node_id);
        }
      }
    }

    if (targets.size > 0) {
      for (const tid of targets) {
        const targetStep = steps.find((s) => s.template_step_id === tid);
        if (!targetStep) continue;
        const payload = buildInputPayloadFromEdges(templateEdges, stepsMap, tid);
        await supabase
          .from('project_workflow_steps')
          .update({ input_data: payload as unknown as Json })
          .eq('id', targetStep.id);
      }
    } else {
      const nextStep = steps.find((s) => s.step_order === step.step_order + 1);
      if (nextStep) {
        await supabase
          .from('project_workflow_steps')
          .update({ input_data: approved as unknown as Json })
          .eq('id', nextStep.id);
      }
    }

    try {
      await supabase.from('workflow_event_logs').insert({
        project_id: wf.project_id,
        workflow_run_id: activeWorkflowId,
        project_workflow_step_id: stepId,
        event_type: 'step_confirmed',
        payload: { step_id: stepId } as unknown as Json,
      } as never);
    } catch {
      /* RLS / таблица */
    }

    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
    toast.success('Этап подтверждён');

    let autoCandidates: typeof steps = [];
    if (targets.size > 0) {
      autoCandidates = steps.filter((s) => s.template_step_id && targets.has(s.template_step_id));
    } else {
      const linear = steps.find((s) => s.step_order === step.step_order + 1);
      if (linear) autoCandidates = [linear];
    }
    const nextForAuto = autoCandidates.find((s) => s.template_step?.auto_run);

    if (nextForAuto) {
      setTimeout(() => {
        executeStep(nextForAuto.id);
      }, 500);
    }
  }, [steps, workflows, activeWorkflowId, queryClient, executeStep]);

  const retryStep = useCallback(
    async (stepId: string) => {
      const step = steps.find((s) => s.id === stepId);
      if (!step) return;
      try {
        const { error } = await supabase
          .from('project_workflow_steps')
          .update({
            status: 'pending' as WorkflowStepStatus,
            output_data: {} as Json,
            raw_output: null,
            user_edited_output: null,
            approved_output: null,
            human_readable_output: null,
            error_message: null,
            attempt: (step.attempt ?? 1) + 1,
          } as never)
          .eq('id', stepId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
        toast.success('Шаг сброшен для повторного запуска');
      } catch (e) {
        console.error(e);
        toast.error('Не удалось сбросить шаг');
      }
    },
    [steps, activeWorkflowId, queryClient]
  );

  const retryFromStep = useCallback(
    async (stepId: string) => {
      const step = steps.find((s) => s.id === stepId);
      if (!step) return;
      const toReset = steps.filter((s) => s.step_order >= step.step_order);
      try {
        for (const s of toReset) {
          await supabase
            .from('project_workflow_steps')
            .update({
              status: 'pending' as WorkflowStepStatus,
              output_data: {} as Json,
              raw_output: null,
              user_edited_output: null,
              approved_output: null,
              human_readable_output: null,
              error_message: null,
              attempt: (s.attempt ?? 1) + 1,
            } as never)
            .eq('id', s.id);
        }
        queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
        toast.success('Этот и downstream-шаги сброшены');
      } catch (e) {
        console.error(e);
        toast.error('Ошибка');
      }
    },
    [steps, activeWorkflowId, queryClient]
  );

  // Set input data for a step (e.g., first step user input)
  const setStepInputData = useCallback(async (stepId: string, inputData: Record<string, unknown>) => {
    try {
      const { error } = await supabase
        .from('project_workflow_steps')
        .update({
          input_data: inputData as unknown as Json,
          status: 'completed' as any,
          completed_at: new Date().toISOString(),
          output_data: inputData as unknown as Json,
        })
        .eq('id', stepId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
    } catch (error) {
      console.error('Error setting input data:', error);
      toast.error('Ошибка сохранения данных');
    }
  }, [activeWorkflowId, queryClient]);

  return {
    // Templates
    templates,

    // Workflows
    workflows,
    activeWorkflow,
    activeWorkflowId,
    setActiveWorkflowId,
    createWorkflow,
    isLoadingWorkflows,

    // Steps
    steps,
    activeStep,
    activeStepId,
    setActiveStepId,
    isLoadingSteps,

    // Execution
    isExecuting,
    streamingContent,
    executeStep,
    stopExecution,

    // Editing
    saveUserEdits,
    confirmStep,
    setStepInputData,

    retryStep,
    retryFromStep,

    // Step messages
    stepMessages,
  };
}
