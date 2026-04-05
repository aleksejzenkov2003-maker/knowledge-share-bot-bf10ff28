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
  type OnConnect,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowNode } from './WorkflowNode';
import { WorkflowMappingEdge } from './WorkflowMappingEdge';
import type { WorkflowNodeData } from '@/hooks/useWorkflowEditor';

interface WorkflowCanvasProps {
  initialNodes: Node<WorkflowNodeData>[];
  initialEdges: Edge[];
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onNodeDragStop: (nodes: Node<WorkflowNodeData>[]) => void;
  onPaneClick: () => void;
  onConnect: (connection: Connection) => void;
}

const nodeTypes = {
  workflowNode: WorkflowNode,
};

const edgeTypes = {
  workflowEdge: WorkflowMappingEdge,
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  initialNodes,
  initialEdges,
  onNodeClick,
  onEdgeClick,
  onNodeDragStop,
  onPaneClick,
  onConnect: onConnectProp,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleNodeClick: NodeMouseHandler<Node<WorkflowNodeData>> = useCallback(
    (_event, node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      onEdgeClick(edge.id);
    },
    [onEdgeClick]
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node<WorkflowNodeData>, allNodes: Node<WorkflowNodeData>[]) => {
      onNodeDragStop(allNodes);
    },
    [onNodeDragStop]
  );

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      onConnectProp(connection);
    },
    [onConnectProp]
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (connection.source === connection.target) return false;
    return true;
  }, []);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'workflowEdge',
      animated: true,
    }),
    []
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
        deleteKeyCode={['Backspace', 'Delete']}
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
