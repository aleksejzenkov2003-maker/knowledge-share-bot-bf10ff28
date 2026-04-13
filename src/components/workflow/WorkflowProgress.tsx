import React from 'react';
import { ProjectWorkflow, ProjectWorkflowStep } from '@/types/workflow';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface WorkflowProgressProps {
  workflow: ProjectWorkflow;
  steps: ProjectWorkflowStep[];
}

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  running: 'Выполняется',
  paused: 'Пауза',
  completed: 'Завершён',
};

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({ workflow, steps }) => {
  const completedCount = steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;
  const runningStep = steps.find((s) => s.status === 'running');
  const runningName = runningStep?.template_step?.name || (runningStep ? `Этап ${runningStep.step_order}` : '');

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b bg-muted/20 shrink-0">
      <Badge variant="outline" className="text-xs">
        {statusLabels[workflow.status] || workflow.status}
      </Badge>
      <div className="flex-1 max-w-xs">
        <Progress value={progress} className="h-2" />
      </div>
      <span className="text-xs text-muted-foreground">
        {completedCount} / {steps.length} этапов
      </span>
      {runningStep && (
        <span className="ml-auto text-xs text-primary flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Выполняется: {runningName}
        </span>
      )}
    </div>
  );
};
