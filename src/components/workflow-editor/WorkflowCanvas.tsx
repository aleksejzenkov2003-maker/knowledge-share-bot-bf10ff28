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
  const decoratedNodes = useMemo(() => {
    const stageMap = new Map<string, Node<WorkflowNodeData>[]>();
    for (const node of initialNodes) {
      const stageGroup = String(node.data?.stageGroup || '').trim();
      if (!stageGroup) continue;
      const list = stageMap.get(stageGroup) || [];
      list.push(node);
      stageMap.set(stageGroup, list);
    }

    const stageNodes: Node<WorkflowNodeData>[] = [];
    const groupedNodeIds = new Set<string>();
    const groupedChildren: Node<WorkflowNodeData>[] = [];

    const PAD_X = 30;
    const PAD_TOP = 42;
    const PAD_BOTTOM = 24;
    const NODE_EST_W = 220;
    const NODE_EST_H = 120;

    let index = 0;
    for (const [groupName, members] of stageMap.entries()) {
      if (members.length === 0) continue;
      const xs = members.map((n) => n.position.x);
      const ys = members.map((n) => n.position.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs) + NODE_EST_W;
      const maxY = Math.max(...ys) + NODE_EST_H;

      const groupId = `stage-group-${index}-${groupName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
      index += 1;

      const groupX = minX - PAD_X;
      const groupY = minY - PAD_TOP;
      const groupW = Math.max(260, maxX - minX + PAD_X * 2);
      const groupH = Math.max(180, maxY - minY + PAD_TOP + PAD_BOTTOM);

      stageNodes.push({
        id: groupId,
        type: 'group',
        position: { x: groupX, y: groupY },
        draggable: false,
        selectable: false,
        data: { label: groupName } as WorkflowNodeData,
        style: {
          width: groupW,
          height: groupH,
          border: '1px dashed hsl(var(--border))',
          borderRadius: 12,
          background: 'hsl(var(--muted) / 0.2)',
          color: 'hsl(var(--muted-foreground))',
          fontSize: 11,
          fontWeight: 600,
          paddingTop: 18,
          paddingLeft: 10,
        },
      });

      for (const member of members) {
        groupedNodeIds.add(member.id);
        groupedChildren.push({
          ...member,
          parentId: groupId,
          extent: 'parent',
          position: {
            x: member.position.x - groupX,
            y: member.position.y - groupY,
          },
        });
      }
    }

    const freeNodes = initialNodes.filter((n) => !groupedNodeIds.has(n.id));
    return [...stageNodes, ...groupedChildren, ...freeNodes];
  }, [initialNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(decoratedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(decoratedNodes);
  }, [decoratedNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleNodeClick: NodeMouseHandler<Node<WorkflowNodeData>> = useCallback(
    (_event, node) => {
      if (node.type === 'group') return;
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
      const groupPositions = new Map<string, { x: number; y: number }>();
      for (const n of allNodes) {
        if (n.type === 'group') {
          groupPositions.set(n.id, { x: n.position.x, y: n.position.y });
        }
      }

      const normalized = allNodes
        .filter((n) => n.type !== 'group')
        .map((n) => {
          if (!n.parentId) return n;
          const parentPos = groupPositions.get(n.parentId);
          if (!parentPos) return n;
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            position: {
              x: parentPos.x + n.position.x,
              y: parentPos.y + n.position.y,
            },
          };
        });
      onNodeDragStop(normalized);
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
            if (node.type === 'group') return 'hsl(var(--muted-foreground) / 0.45)';
            const data = node.data as WorkflowNodeData;
            if (data.nodeType === 'input') return 'hsl(var(--chart-2))';
            if (data.nodeType === 'output') return 'hsl(var(--chart-4))';
            if (data.nodeType === 'condition') return 'hsl(200 80% 45%)';
            if (data.nodeType === 'quality_check') return 'hsl(350 70% 45%)';
            return 'hsl(var(--primary))';
          }}
          maskColor="hsl(var(--background) / 0.7)"
        />
      </ReactFlow>
    </div>
  );
};
