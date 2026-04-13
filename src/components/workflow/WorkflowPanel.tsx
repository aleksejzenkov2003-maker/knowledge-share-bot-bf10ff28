import React, { useMemo } from 'react';
import { useProjectWorkflow } from '@/hooks/useProjectWorkflow';
import { WorkflowStepper, groupStepsByStage } from './WorkflowStepper';
import { WorkflowStepView } from './WorkflowStepView';
import { WorkflowProgress } from './WorkflowProgress';
import { cn } from '@/lib/utils';
import { WorkflowTemplate } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Loader2, GitBranch, Plus } from 'lucide-react';

interface WorkflowPanelProps {
  projectId: string;
  userId: string | undefined;
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({ projectId, userId }) => {
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>('');
  const [activeStageKey, setActiveStageKey] = React.useState<string | null>(null);

  const {
    templates,
    workflows,
    activeWorkflow,
    activeWorkflowId,
    setActiveWorkflowId,
    createWorkflow,
    isLoadingWorkflows,
    steps,
    activeStep,
    activeStepId,
    setActiveStepId,
    isLoadingSteps,
    isExecuting,
    streamingContent,
    executeStep,
    stopExecution,
    saveUserEdits,
    confirmStep,
    setStepInputData,
    stepMessages,
    retryStep,
    retryFromStep,
    skipStep,
    artifacts,
  } = useProjectWorkflow(projectId, userId);

  const stages = useMemo(() => groupStepsByStage(steps), [steps]);

  const currentStage = useMemo(() => {
    if (activeStageKey) return stages.find(s => s.key === activeStageKey);
    return stages.find(s => s.steps.some(st => st.id === activeStepId));
  }, [stages, activeStepId, activeStageKey]);

  const handleCreateWorkflow = async () => {
    if (!selectedTemplateId) return;
    await createWorkflow(selectedTemplateId);
    setSelectedTemplateId('');
  };

  if (isLoadingWorkflows) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No workflows yet — show template picker
  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <GitBranch className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Workflow не запущен</h2>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Выберите шаблон workflow для запуска пошаговой обработки проекта.
        </p>

        {templates.length > 0 ? (
          <div className="flex items-center gap-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Выберите шаблон" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreateWorkflow} disabled={!selectedTemplateId}>
              <Plus className="h-4 w-4 mr-1" />
              Создать
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Нет доступных шаблонов. Обратитесь к администратору.
          </p>
        )}
      </div>
    );
  }
  if (!activeWorkflow) return null;

  const handleSelectStage = (key: string) => {
    setActiveStageKey(key);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-x-hidden">
      {/* Progress bar */}
      <WorkflowProgress workflow={activeWorkflow} steps={steps} />

      {/* Stepper */}
      <WorkflowStepper
        steps={steps}
        activeStepId={activeStepId}
        onSelectStep={setActiveStepId}
        activeStageKey={activeStageKey}
        onSelectStage={handleSelectStage}
      />

      {/* Sub-tabs for multi-step stages */}
      {currentStage && currentStage.steps.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-1 border-b bg-background shrink-0 overflow-x-auto">
          {currentStage.steps.map((s) => {
            const stepName = s.template_step?.name || `Шаг ${s.step_order}`;
            const isActive = s.id === activeStepId;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStepId(s.id)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium border border-primary/30"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {stepName}
              </button>
            );
          })}
        </div>
      )}

      {/* Active step content */}
      {isLoadingSteps ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : activeStep ? (
        <WorkflowStepView
          step={activeStep}
          stepMessages={stepMessages}
          artifacts={artifacts}
          projectId={projectId}
          isExecuting={isExecuting}
          streamingContent={streamingContent}
          onExecute={executeStep}
          onStop={stopExecution}
          onSaveEdits={saveUserEdits}
          onConfirm={confirmStep}
          onSetInputData={setStepInputData}
          onRetryStep={retryStep}
          onRetryFromStep={retryFromStep}
          onSkipStep={skipStep}
          isFirstStep={activeStep.step_order === (steps[0]?.step_order ?? 0)}
        />
      ) : null}
    </div>
  );
};
