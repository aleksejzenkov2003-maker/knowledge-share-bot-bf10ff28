import React from 'react';
import type { EditorValidationIssue } from '@/types/workflow-editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationPanelProps {
  issues: EditorValidationIssue[];
  className?: string;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ issues, className }) => {
  if (issues.length === 0) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        Валидация: ошибок нет
      </p>
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <div className={cn('rounded-md border bg-muted/30', className)}>
      <div className="px-2 py-1.5 border-b text-xs font-medium flex items-center gap-2">
        {errors.length > 0 && (
          <span className="text-destructive flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {errors.length} ошиб.
          </span>
        )}
        {warnings.length > 0 && (
          <span className="text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {warnings.length} предупр.
          </span>
        )}
      </div>
      <ScrollArea className="max-h-40">
        <ul className="p-2 space-y-1 text-xs">
          {issues.map((issue, idx) => (
            <li
              key={`${issue.code}-${idx}`}
              className={cn(
                'flex gap-2 rounded px-1.5 py-1',
                issue.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
              )}
            >
              <span className="font-mono text-[10px] opacity-70 shrink-0">{issue.code}</span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
};
