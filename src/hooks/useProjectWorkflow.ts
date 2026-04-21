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
  WorkflowArtifact,
  WorkflowStatus,
  WorkflowStepStatus,
} from '@/types/workflow';
import type { Json } from '@/integrations/supabase/types';
import { confirmProjectWorkflowStep } from '@/lib/projectWorkflowConfirm';

const STREAM_UPDATE_INTERVAL = 50;

// Query keys
export const workflowQueryKeys = {
  templates: ['workflow-templates'] as const,
  templateSteps: (templateId: string) => ['workflow-template-steps', templateId] as const,
  projectWorkflows: (projectId: string) => ['project-workflows', projectId] as const,
  workflowSteps: (workflowId: string) => ['workflow-steps', workflowId] as const,
  stepMessages: (stepId: string) => ['step-messages', stepId] as const,
  workflowArtifacts: (workflowId: string) => ['workflow-artifacts', workflowId] as const,
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
        .select('*, workflow_template_steps:template_step_id(id, name, description, step_order, is_user_editable, auto_run, require_approval, node_type, node_key, script_config, stage_group, stage_order), chat_roles:agent_id(id, name, slug, mention_trigger, description)')
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

export function useWorkflowArtifactsQuery(workflowId: string | null) {
  return useQuery({
    queryKey: workflowQueryKeys.workflowArtifacts(workflowId || ''),
    queryFn: async () => {
      if (!workflowId) return [];
      const { data, error } = await supabase
        .from('workflow_artifacts')
        .select('*')
        .eq('workflow_run_id', workflowId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return (data || []) as unknown as WorkflowArtifact[];
    },
    enabled: !!workflowId,
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
  const { data: artifacts = [] } = useWorkflowArtifactsQuery(activeWorkflowId);

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

  // Ref to break circular dependency between handlePostStepCompletion and executeStep
  const executeStepRef = useRef<(stepId: string, message?: string, attachments?: { file_path: string; file_name: string; file_type: string; file_size: number; contains_pii?: boolean }[]) => Promise<void>>();

  // Shared helper: after a step completes, auto-confirm condition/quality_check nodes
  // and auto-run ALL downstream targets (parallel fan-out).
  const handlePostStepCompletion = useCallback(async (stepId: string): Promise<boolean> => {
    const { data: stepFresh } = await supabase
      .from('project_workflow_steps')
      .select('workflow_id, template_step_id')
      .eq('id', stepId)
      .single();
    if (!stepFresh?.template_step_id || !stepFresh.workflow_id) return false;

    const { data: tmpl } = await supabase
      .from('workflow_template_steps')
      .select('node_type, require_approval')
      .eq('id', stepFresh.template_step_id)
      .single();
    const nt = tmpl?.node_type as string | undefined;
    const needApprove = tmpl?.require_approval !== false;
    if (!((nt === 'condition' || nt === 'quality_check') && !needApprove)) return false;

    const { data: row } = await supabase
      .from('project_workflow_steps')
      .select('user_edited_output, user_edits, approved_output, output_data')
      .eq('id', stepId)
      .single();
    const approved =
      (row?.approved_output as Record<string, unknown> | null) ||
      (row?.user_edited_output as Record<string, unknown> | null) ||
      (row?.user_edits as Record<string, unknown> | null) ||
      (row?.output_data as Record<string, unknown>) ||
      {};

    const r = await confirmProjectWorkflowStep(supabase, {
      workflowId: stepFresh.workflow_id as string,
      stepId,
      approvedPayload: approved,
    });
    if ('error' in r) return false;

    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(stepFresh.workflow_id as string) });

    // Auto-run ALL downstream targets (supports parallel fan-out)
    const { data: allSteps } = await supabase
      .from('project_workflow_steps')
      .select('id, template_step_id')
      .eq('workflow_id', stepFresh.workflow_id);

    const candidates = (allSteps || []).filter(
      (s: { template_step_id?: string | null }) =>
        s.template_step_id && r.targetTemplateIds.includes(s.template_step_id as string)
    );

    let delay = 300;
    for (const candidate of candidates) {
      if (!candidate.template_step_id) continue;
      const { data: trow } = await supabase
        .from('workflow_template_steps')
        .select('auto_run')
        .eq('id', candidate.template_step_id)
        .maybeSingle();
      if (trow?.auto_run) {
        const capturedId = candidate.id as string;
        const capturedDelay = delay;
        setTimeout(() => executeStepRef.current?.(capturedId), capturedDelay);
        delay += 400;
      }
    }

    toast.success('Этап выполнен, ветка передана дальше');
    return true;
  }, [queryClient]);

  // Execute a step
  const executeStep = useCallback(async (
    stepId: string,
    message?: string,
    attachments?: { file_path: string; file_name: string; file_type: string; file_size: number; contains_pii?: boolean }[],
  ) => {
    if (!userId) return;

    setIsExecuting(true);
    streamingContentRef.current = '';
    setStreamingContent('');

    try {
      abortControllerRef.current = new AbortController();

      let {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        const refreshResult = await supabase.auth.refreshSession();
        session = refreshResult.data.session;
      }

      if (!session?.access_token) {
        throw new Error('Сессия истекла. Войдите в систему снова.');
      }

      // Save user message to step chat if provided
      if (message) {
        await supabase
          .from('project_step_messages')
          .insert({
            step_id: stepId,
            user_id: userId,
            message_role: 'user',
            content: message,
            metadata: attachments && attachments.length > 0
              ? ({ attachments } as unknown as Json)
              : null,
          });
      }

      const requestPayload: Record<string, unknown> = { step_id: stepId, message };
      if (attachments && attachments.length > 0) {
        requestPayload.attachments = attachments;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-step-execute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(requestPayload),
          signal: abortControllerRef.current.signal,
        }
      );

      if (response.status === 401) {
        const refreshResult = await supabase.auth.refreshSession();
        const refreshedToken = refreshResult.data.session?.access_token;

        if (!refreshedToken) {
          throw new Error('Сессия истекла. Войдите в систему снова.');
        }

        const retriedResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-step-execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${refreshedToken}`,
            },
            body: JSON.stringify(requestPayload),
            signal: abortControllerRef.current.signal,
          }
        );

        if (!retriedResponse.ok) {
          throw new Error(`HTTP error! status: ${retriedResponse.status}`);
        }

        const reader = retriedResponse.body?.getReader();
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

        queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
        queryClient.invalidateQueries({ queryKey: workflowQueryKeys.stepMessages(stepId) });
        if (projectId) {
          queryClient.invalidateQueries({ queryKey: workflowQueryKeys.projectWorkflows(projectId) });
        }

        const handled = await handlePostStepCompletion(stepId);
        if (handled) return;

        toast.success('Этап выполнен');
        return;
      }

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

      const handled = await handlePostStepCompletion(stepId);
      if (handled) return;

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
  }, [userId, activeWorkflowId, projectId, queryClient, handlePostStepCompletion]);

  // Keep ref in sync for circular calls from handlePostStepCompletion
  useEffect(() => { executeStepRef.current = executeStep; }, [executeStep]);

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

  const confirmStep = useCallback(async (stepId: string) => {
    const step = steps.find((s) => s.id === stepId);
    if (!step || !activeWorkflowId) return;

    const approved =
      (step.user_edited_output ||
        step.user_edits ||
        step.approved_output ||
        step.output_data) as Record<string, unknown>;

    const r = await confirmProjectWorkflowStep(supabase, {
      workflowId: activeWorkflowId,
      stepId,
      approvedPayload: approved,
      forceQualityPass: step.template_step?.node_type === 'quality_check',
    });

    if ('error' in r) {
      toast.error('Не удалось подтвердить этап');
      return;
    }

    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
    toast.success('Этап подтверждён');

    const autoCandidates = steps.filter(
      (s) => s.template_step_id && r.targetTemplateIds.includes(s.template_step_id)
    );
    const nextForAuto = autoCandidates.find((s) => s.template_step?.auto_run);

    if (nextForAuto) {
      setTimeout(() => {
        executeStep(nextForAuto.id);
      }, 500);
    }
  }, [steps, activeWorkflowId, queryClient, executeStep]);

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

  const skipStep = useCallback(
    async (stepId: string) => {
      try {
        const { error } = await supabase
          .from('project_workflow_steps')
          .update({
            status: 'skipped' as WorkflowStepStatus,
            completed_at: new Date().toISOString(),
          } as never)
          .eq('id', stepId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
        toast.success('Шаг пропущен');
      } catch (e) {
        console.error(e);
        toast.error('Не удалось пропустить шаг');
      }
    },
    [activeWorkflowId, queryClient]
  );

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
    skipStep,

    // Step messages
    stepMessages,

    // Artifacts
    artifacts,
  };
}
