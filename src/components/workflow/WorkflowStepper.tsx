import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ProjectWorkflowStep, WorkflowStepStatus } from '@/types/workflow';
import { Check, Loader2, AlertCircle, Clock, SkipForward, ChevronDown } from 'lucide-react';

interface WorkflowStepperProps {
  steps: ProjectWorkflowStep[];
  activeStepId: string | null;
  onSelectStep: (stepId: string) => void;
  /** Currently selected stage key (for highlighting) */
  activeStageKey?: string | null;
  onSelectStage?: (stageKey: string) => void;
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
  waiting_for_user: { icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30', borderColor: 'border-amber-500' },
};

export interface StageGroup {
  key: string;
  label: string;
  stageOrder: number;
  steps: ProjectWorkflowStep[];
  status: WorkflowStepStatus;
}

export function deriveStageStatus(steps: ProjectWorkflowStep[]): WorkflowStepStatus {
  const statuses = steps.map(s => s.status as WorkflowStepStatus);
  if (statuses.some(s => s === 'error')) return 'error';
  if (statuses.some(s => s === 'running')) return 'running';
  if (statuses.some(s => s === 'waiting_for_user')) return 'waiting_for_user';
  if (statuses.every(s => s === 'completed' || s === 'skipped')) return 'completed';
  return 'pending';
}

export function groupStepsByStage(steps: ProjectWorkflowStep[]): StageGroup[] {
  const stageMap = new Map<string, StageGroup>();
  const soloStages: StageGroup[] = [];

  for (const step of steps) {
    const sg = step.template_step?.stage_group;
    const so = step.template_step?.stage_order ?? step.step_order;

    if (sg) {
      let group = stageMap.get(sg);
      if (!group) {
        group = { key: sg, label: sg, stageOrder: so, steps: [], status: 'pending' };
        stageMap.set(sg, group);
      }
      group.steps.push(step);
    } else {
      const name = step.template_step?.name || `Этап ${step.step_order}`;
      soloStages.push({
        key: `solo_${step.id}`,
        label: name,
        stageOrder: so,
        steps: [step],
        status: step.status as WorkflowStepStatus,
      });
    }
  }

  // Derive status for multi-step stages
  for (const group of stageMap.values()) {
    group.status = deriveStageStatus(group.steps);
  }

  const all = [...stageMap.values(), ...soloStages];
  all.sort((a, b) => a.stageOrder - b.stageOrder);
  return all;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  activeStepId,
  onSelectStep,
  activeStageKey,
  onSelectStage,
}) => {
  const stages = useMemo(() => groupStepsByStage(steps), [steps]);

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-1.5 border-b bg-muted/30 shrink-0">
      {stages.map((stage, index) => {
        const config = stepStatusConfig[stage.status] || stepStatusConfig.pending;
        const Icon = config.icon;
        const isMulti = stage.steps.length > 1;
        const isActive = activeStageKey
          ? stage.key === activeStageKey
          : stage.steps.some(s => s.id === activeStepId);

        const handleClick = () => {
          if (onSelectStage) {
            onSelectStage(stage.key);
          }
          // Select first step of stage
          onSelectStep(stage.steps[0].id);
        };

        return (
          <React.Fragment key={stage.key}>
            {index > 0 && (
              <div className={cn(
                "h-px w-6 flex-shrink-0",
                stage.status === 'completed' || stage.status === 'skipped'
                  ? 'bg-green-400'
                  : 'bg-border'
              )} />
            )}
            <button
              onClick={handleClick}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-all flex-shrink-0",
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
                <Icon className={cn("h-3 w-3", stage.status === 'running' && 'animate-spin')} />
              </div>
              <span className={cn(
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {stage.label}
              </span>
              {isMulti && (
                <span className="text-[10px] text-muted-foreground ml-0.5">
                  ({stage.steps.length})
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
