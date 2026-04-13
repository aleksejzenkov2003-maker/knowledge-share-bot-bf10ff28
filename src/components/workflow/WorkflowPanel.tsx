import React from 'react';
import { useProjectWorkflow } from '@/hooks/useProjectWorkflow';
import { WorkflowStepper } from './WorkflowStepper';
import { WorkflowStepView } from './WorkflowStepView';
import { WorkflowProgress } from './WorkflowProgress';

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
    artifacts,
  } = useProjectWorkflow(projectId, userId);

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

  // Show active workflow
  if (!activeWorkflow) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Progress bar */}
      <WorkflowProgress workflow={activeWorkflow} steps={steps} />

      {/* Stepper */}
      <WorkflowStepper
        steps={steps}
        activeStepId={activeStepId}
        onSelectStep={setActiveStepId}
      />
      

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
