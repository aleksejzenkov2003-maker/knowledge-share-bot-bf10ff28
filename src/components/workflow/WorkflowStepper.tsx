import React from 'react';
import { cn } from '@/lib/utils';
import { ProjectWorkflowStep, WorkflowStepStatus } from '@/types/workflow';
import { Check, Loader2, AlertCircle, Clock, SkipForward } from 'lucide-react';

interface WorkflowStepperProps {
  steps: ProjectWorkflowStep[];
  activeStepId: string | null;
  onSelectStep: (stepId: string) => void;
}

const stepStatusConfig: Record<WorkflowStepStatus, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  pending: { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted', borderColor: 'border-muted' },
  running: { icon: Loader2, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary' },
  completed: { icon: Check, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30', borderColor: 'border-green-500' },
  error: { icon: AlertCircle, color: 'text-destructive', bgColor: 'bg-destructive/10', borderColor: 'border-destructive' },
  skipped: { icon: SkipForward, color: 'text-muted-foreground', bgColor: 'bg-muted/50', borderColor: 'border-muted' },
};

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  activeStepId,
  onSelectStep,
}) => {
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-3 border-b bg-muted/30">
      {steps.map((step, index) => {
        const config = stepStatusConfig[step.status as WorkflowStepStatus] || stepStatusConfig.pending;
        const Icon = config.icon;
        const isActive = step.id === activeStepId;
        const name = step.template_step?.name || `Этап ${step.step_order}`;

        return (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <div className={cn(
                "h-px w-6 flex-shrink-0",
                step.status === 'completed' || step.status === 'skipped'
                  ? 'bg-green-400'
                  : 'bg-border'
              )} />
            )}
            <button
              onClick={() => onSelectStep(step.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-all flex-shrink-0",
                "border",
                isActive
                  ? `${config.bgColor} ${config.borderColor} font-medium`
                  : 'border-transparent hover:bg-muted',
                config.color
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-5 h-5 rounded-full text-xs",
                config.bgColor
              )}>
                <Icon className={cn("h-3 w-3", step.status === 'running' && 'animate-spin')} />
              </div>
              <span className={cn(
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {name}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
