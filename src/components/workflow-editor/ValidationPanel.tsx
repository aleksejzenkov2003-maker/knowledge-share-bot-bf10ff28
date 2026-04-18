import React, { useState } from 'react';
import type { EditorValidationIssue } from '@/types/workflow-editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Wand2,
  Target,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationPanelProps {
  issues: EditorValidationIssue[];
  /** How many edges could be auto-fixed with passthrough mapping */
  autofixableMappingCount?: number;
  /** Select a node on the canvas and open its config panel */
  onSelectNode?: (nodeId: string) => void;
  /** Select an edge on the canvas and open the edge config panel */
  onSelectEdge?: (edgeId: string) => void;
  /** Apply passthrough mapping to one edge */
  onFixEdgeMapping?: (edgeId: string) => void | Promise<void>;
  /** Apply smart mapping to all edges that currently have no mapping */
  onFixAllMappings?: () => void | Promise<void>;
  className?: string;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  issues,
  autofixableMappingCount = 0,
  onSelectNode,
  onSelectEdge,
  onFixEdgeMapping,
  onFixAllMappings,
  className,
}) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  if (issues.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 px-2.5 py-1.5 text-xs',
          className,
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Валидация: ошибок нет — шаблон готов к публикации
      </div>
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const handleFixAll = async () => {
    if (!onFixAllMappings) return;
    setBusy(true);
    try {
      await onFixAllMappings();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('rounded-md border bg-muted/20', className)}>
      <div className="px-2.5 py-1.5 border-b text-xs font-medium flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          {errors.length > 0 && (
            <span className="text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {errors.length} ошиб.
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warnings.length} предупр.
            </span>
          )}
        </div>
        {autofixableMappingCount > 0 && onFixAllMappings && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleFixAll}
            disabled={busy}
            className="h-6 gap-1 text-[11px]"
          >
            <Wand2 className="h-3 w-3" />
            Починить {autofixableMappingCount}{' '}
            {autofixableMappingCount === 1 ? 'маппинг' : 'маппинга'}
          </Button>
        )}
      </div>

      <ScrollArea className="max-h-56">
        <ul className="p-1.5 space-y-1 text-xs">
          {issues.map((issue, idx) => {
            const isOpen = expanded[idx] === true;
            const hasDetails =
              Boolean(issue.suggestion) ||
              Boolean(issue.nodeId) ||
              Boolean(issue.edgeId);

            return (
              <li
                key={`${issue.code}-${idx}`}
                className={cn(
                  'rounded border',
                  issue.severity === 'error'
                    ? 'bg-destructive/5 border-destructive/30'
                    : 'bg-amber-500/5 border-amber-500/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [idx]: !s[idx] }))}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left"
                  disabled={!hasDetails}
                >
                  {hasDetails ? (
                    isOpen ? (
                      <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
                    ) : (
                      <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
                    )
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span
                    className={cn(
                      'font-mono text-[10px] opacity-70 shrink-0 mt-0.5',
                      issue.severity === 'error'
                        ? 'text-destructive'
                        : 'text-amber-700 dark:text-amber-300',
                    )}
                  >
                    {issue.code}
                  </span>
                  <span
                    className={cn(
                      'flex-1 leading-snug',
                      issue.severity === 'error'
                        ? 'text-destructive'
                        : 'text-amber-800 dark:text-amber-200',
                    )}
                  >
                    {issue.message}
                  </span>
                </button>

                {isOpen && hasDetails && (
                  <div className="px-2 pb-2 pl-7 space-y-1.5">
                    {issue.suggestion && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {issue.suggestion}
                      </p>
                    )}
                    <div className="flex gap-1.5 flex-wrap">
                      {issue.nodeId && onSelectNode && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 text-[10px]"
                          onClick={() => onSelectNode(issue.nodeId!)}
                        >
                          <Target className="h-3 w-3" />
                          Показать шаг
                        </Button>
                      )}
                      {issue.edgeId && onSelectEdge && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 text-[10px]"
                          onClick={() => onSelectEdge(issue.edgeId!)}
                        >
                          <Target className="h-3 w-3" />
                          Показать связь
                        </Button>
                      )}
                      {issue.fixType === 'auto_passthrough_mapping' &&
                        issue.edgeId &&
                        onFixEdgeMapping && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => onFixEdgeMapping(issue.edgeId!)}
                          >
                            <Wrench className="h-3 w-3" />
                            Починить
                          </Button>
                        )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
};
