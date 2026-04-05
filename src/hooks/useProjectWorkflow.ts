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
        .order('created_at');
      if (error) throw error;
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
        .select('*, workflow_template_steps:template_step_id(id, name, description, step_order, is_user_editable, auto_run), chat_roles:agent_id(id, name, slug, mention_trigger, description)')
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
      // Create workflow
      const { data: workflow, error: wfError } = await supabase
        .from('project_workflows')
        .insert({
          project_id: projectId,
          template_id: templateId,
          created_by: userId,
          status: 'draft' as any,
        })
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
        .update({ user_edits: edits as unknown as Json })
        .eq('id', stepId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
      toast.success('Изменения сохранены');
    } catch (error) {
      console.error('Error saving edits:', error);
      toast.error('Ошибка сохранения');
    }
  }, [activeWorkflowId, queryClient]);

  // Confirm step and pass data to next
  const confirmStep = useCallback(async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    const nextStep = steps.find(s => s.step_order === step.step_order + 1);
    if (nextStep) {
      const outputToPass = step.user_edits || step.output_data;
      await supabase
        .from('project_workflow_steps')
        .update({ input_data: outputToPass as unknown as Json })
        .eq('id', nextStep.id);
    }

    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(activeWorkflowId || '') });
    toast.success('Этап подтверждён');
  }, [steps, activeWorkflowId, queryClient]);

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

    // Step messages
    stepMessages,
  };
}
