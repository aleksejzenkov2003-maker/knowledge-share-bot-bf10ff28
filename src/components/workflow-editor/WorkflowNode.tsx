import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Bot, FileInput, FileOutput, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/hooks/useWorkflowEditor';

type WorkflowNodeType = Node<WorkflowNodeData, 'workflowNode'>;

const nodeIcons: Record<string, React.ElementType> = {
  input: FileInput,
  agent: Bot,
  script: Code,
  output: FileOutput,
};

const nodeColors: Record<string, string> = {
  input: 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30',
  agent: 'border-primary/50 bg-primary/5',
  script: 'border-violet-500/50 bg-violet-50 dark:bg-violet-950/30',
  output: 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30',
};

const iconColors: Record<string, string> = {
  input: 'text-emerald-600',
  agent: 'text-primary',
  script: 'text-violet-600',
  output: 'text-amber-600',
};

export const WorkflowNode = memo(({ data, selected }: NodeProps<WorkflowNodeType>) => {
  const Icon = nodeIcons[data.nodeType] || Bot;
  const colorClass = nodeColors[data.nodeType] || nodeColors.agent;
  const iconColor = iconColors[data.nodeType] || iconColors.agent;

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-xl border-2 shadow-sm min-w-[180px] max-w-[220px] transition-all',
        colorClass,
        selected && 'ring-2 ring-primary ring-offset-2 shadow-md'
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background" />
      
      <div className="flex items-start gap-2">
        <div className={cn('mt-0.5 flex-shrink-0', iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate">{data.label}</div>
          {data.agentName && (
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">
              @{data.agentName}
            </div>
          )}
          {data.description && (
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">
              {data.description}
            </div>
          )}
        </div>
      </div>

      {data.nodeKey && (
        <div className="text-[9px] font-mono text-muted-foreground mt-1 truncate" title={String(data.nodeKey)}>
          #{String(data.nodeKey)}
        </div>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        {data.autoRun && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">auto</span>
        )}
        {data.isUserEditable && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-400">edit</span>
        )}
        {data.requireApproval !== false && (data.nodeType === 'agent' || data.nodeType === 'output') && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/40 dark:text-blue-200">
            approve
          </span>
        )}
      </div>
      
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background" />
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';
