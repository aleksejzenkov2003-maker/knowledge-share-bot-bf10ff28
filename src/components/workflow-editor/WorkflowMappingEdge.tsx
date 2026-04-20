import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

type EdgeData = {
  mappingCount?: number;
  hasConditions?: boolean;
  branchLabel?: string;
  isPassthrough?: boolean;
};

export const WorkflowMappingEdge = memo((props: EdgeProps) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    selected,
    data,
  } = props;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = (data as EdgeData) || {};
  const isBranch = !!d.branchLabel;
  const isPassthrough = !!d.isPassthrough;
  const hasConditions = !!d.hasConditions;

  // Pick semantic color
  let stroke = 'hsl(var(--muted-foreground) / 0.55)';
  if (selected) stroke = 'hsl(var(--primary))';
  else if (isBranch && (d.branchLabel === 'Да' || d.branchLabel === 'Ок')) {
    stroke = 'hsl(142 70% 40%)';
  } else if (isBranch && (d.branchLabel === 'Нет' || d.branchLabel === 'Не ок')) {
    stroke = 'hsl(var(--destructive))';
  } else if (hasConditions) {
    stroke = 'hsl(35 92% 50%)';
  }

  // Show label only if branch, conditions, or expert mapping is configured.
  const showLabel = isBranch || hasConditions || (!isPassthrough && (d.mappingCount ?? 0) > 0);

  let labelText = '';
  if (isBranch) labelText = d.branchLabel || '';
  else if (hasConditions) labelText = 'по условию';
  else if (!isPassthrough && (d.mappingCount ?? 0) > 0) {
    labelText = `маппинг · ${d.mappingCount}`;
  }

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke,
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'nodrag nopan pointer-events-none rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold shadow-sm',
              isBranch && (d.branchLabel === 'Да' || d.branchLabel === 'Ок') &&
                'border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
              isBranch && (d.branchLabel === 'Нет' || d.branchLabel === 'Не ок') &&
                'border-destructive/50 text-destructive',
              hasConditions && !isBranch && 'border-amber-500/60 text-amber-700 dark:text-amber-400'
            )}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

WorkflowMappingEdge.displayName = 'WorkflowMappingEdge';
