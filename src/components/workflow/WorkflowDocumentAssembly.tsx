import React from 'react';
import { ProjectWorkflowStep } from '@/types/workflow';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleDashed, Loader2, FileText } from 'lucide-react';

interface WorkflowDocumentAssemblyProps {
  steps: ProjectWorkflowStep[];
}

function pickStepSnippet(step: ProjectWorkflowStep): string {
  const raw = (step.approved_output || step.user_edited_output || step.output_data) as Record<string, unknown> | null;
  if (!raw) return 'Ожидаем результат этапа...';
  if (typeof raw.content === 'string' && raw.content.trim()) return raw.content.slice(0, 180);
  if (typeof raw.client_kp === 'string' && raw.client_kp.trim()) return raw.client_kp.slice(0, 180);
  const hr = step.human_readable_output as Record<string, unknown> | null;
  if (hr && typeof hr.summary === 'string' && hr.summary.trim()) return hr.summary.slice(0, 180);
  try {
    return JSON.stringify(raw).slice(0, 180);
  } catch {
    return 'Результат получен';
  }
}

export const WorkflowDocumentAssembly: React.FC<WorkflowDocumentAssemblyProps> = ({ steps }) => {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);

  return (
    <Card className="mx-4 mt-3 p-3 border-dashed bg-muted/10">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">Сборка документа по этапам</div>
      </div>
      <div className="space-y-2">
        {sorted.map((step) => {
          const name = step.template_step?.name || `Этап ${step.step_order}`;
          const isDone = step.status === 'completed' || step.status === 'skipped';
          const isRun = step.status === 'running';
          return (
            <div key={step.id} className="flex items-start gap-2 rounded border bg-background p-2">
              <div className="mt-0.5">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : isRun ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{name}</span>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {step.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {pickStepSnippet(step)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

