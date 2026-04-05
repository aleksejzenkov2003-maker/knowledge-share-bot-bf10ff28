import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

type EdgeData = { mappingCount?: number; hasConditions?: boolean };

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
  const n = d.mappingCount ?? 0;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'nodrag nopan pointer-events-none rounded border bg-card px-1.5 py-0.5 text-[10px] font-medium shadow-sm',
            d.hasConditions && 'ring-1 ring-amber-400/50'
          )}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {n > 0 ? `${n} полей` : 'маппинг'}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

WorkflowMappingEdge.displayName = 'WorkflowMappingEdge';
