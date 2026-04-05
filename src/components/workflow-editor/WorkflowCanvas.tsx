import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowNode } from './WorkflowNode';
import type { WorkflowNodeData } from '@/hooks/useWorkflowEditor';

interface WorkflowCanvasProps {
  initialNodes: Node<WorkflowNodeData>[];
  initialEdges: Edge[];
  onNodeClick: (nodeId: string) => void;
  onNodeDragStop: (nodes: Node<WorkflowNodeData>[]) => void;
  onPaneClick: () => void;
}

const nodeTypes = {
  workflowNode: WorkflowNode,
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  initialNodes,
  initialEdges,
  onNodeClick,
  onNodeDragStop,
  onPaneClick,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync external changes
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleNodeClick: NodeMouseHandler<Node<WorkflowNodeData>> = useCallback((_event, node) => {
    onNodeClick(node.id);
  }, [onNodeClick]);

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, _node: Node<WorkflowNodeData>, allNodes: Node<WorkflowNodeData>[]) => {
    onNodeDragStop(allNodes);
  }, [onNodeDragStop]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor={(node) => {
            const data = node.data as WorkflowNodeData;
            if (data.nodeType === 'input') return 'hsl(var(--chart-2))';
            if (data.nodeType === 'output') return 'hsl(var(--chart-4))';
            return 'hsl(var(--primary))';
          }}
          maskColor="hsl(var(--background) / 0.7)"
        />
      </ReactFlow>
    </div>
  );
};
