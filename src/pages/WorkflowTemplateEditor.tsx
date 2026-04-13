import React from 'react';
import { useWorkflowEditor, type WorkflowNodeData } from '@/hooks/useWorkflowEditor';
import { useWorkflowTemplateTestRun } from '@/hooks/useWorkflowTemplateTestRun';
import { WorkflowCanvas } from '@/components/workflow-editor/WorkflowCanvas';
import { WorkflowNodeConfigPanel } from '@/components/workflow-editor/WorkflowNodeConfigPanel';
import { EdgeConfigPanel } from '@/components/workflow-editor/EdgeConfigPanel';
import { AddNodeMenu } from '@/components/workflow-editor/AddNodeMenu';
import { ValidationPanel } from '@/components/workflow-editor/ValidationPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Rocket } from 'lucide-react';
import type { Node } from '@xyflow/react';

interface WorkflowTemplateEditorProps {
  templateId: string;
  onBack: () => void;
}

const WorkflowTemplateEditor: React.FC<WorkflowTemplateEditorProps> = ({ templateId, onBack }) => {
  const {
    template,
    steps,
    agents,
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedStep,
    selectedEdge,
    isLoading,
    updateTemplate,
    publishTemplate,
    addStep,
    updateStep,
    deleteStep,
    saveNodePositions,
    onConnect,
    deleteEdge,
    updateEdge,
    validationIssues,
    graphEdges,
  } = useWorkflowEditor(templateId);

  const templateTestRun = useWorkflowTemplateTestRun(steps, graphEdges);

  const [templateName, setTemplateName] = React.useState('');
  const availableStageGroups = React.useMemo(
    () =>
      Array.from(
        new Set(
          steps
            .map((s) => s.stage_group?.trim())
            .filter((v): v is string => Boolean(v))
        )
      ),
    [steps]
  );

  React.useEffect(() => {
    if (template) setTemplateName(template.name);
  }, [template]);

  const handleAddNode = async (nodeType: string) => {
    const lastNode = nodes[nodes.length - 1];
    const x = lastNode ? lastNode.position.x + 300 : 100;
    const y = lastNode ? lastNode.position.y : 100;
    await addStep(nodeType, { x, y });
  };

  const handleNodeDragStop = (updatedNodes: Node<WorkflowNodeData>[]) => {
    saveNodePositions(updatedNodes);
  };

  const handleSaveTemplateName = () => {
    if (templateName.trim() && templateName !== template?.name) {
      updateTemplate({ name: templateName.trim() });
    }
  };

  const handleNodeClick = (id: string) => {
    setSelectedEdgeId(null);
    setSelectedNodeId(id);
  };

  const handleEdgeClick = (id: string) => {
    setSelectedNodeId(null);
    setSelectedEdgeId(id);
  };

  const handlePaneClick = () => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const sourceForEdge = selectedEdge
    ? steps.find((s) => s.id === selectedEdge.source_node_id) || null
    : null;
  const targetForEdge = selectedEdge
    ? steps.find((s) => s.id === selectedEdge.target_node_id) || null
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onBlur={handleSaveTemplateName}
            className="h-8 w-64 text-sm font-semibold"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">
            v{template?.version ?? 1}
          </Badge>
          <Badge variant={template?.template_status === 'published' ? 'default' : 'secondary'} className="text-[10px]">
            {template?.template_status === 'published'
              ? 'Опубликован'
              : template?.template_status === 'archived'
                ? 'Архив'
                : 'Черновик'}
          </Badge>
          <AddNodeMenu onAdd={handleAddNode} />
          <span className="text-xs text-muted-foreground">{steps.length} узлов</span>
          <Button size="sm" variant="default" className="gap-1" onClick={() => void publishTemplate()}>
            <Rocket className="h-3.5 w-3.5" />
            Опубликовать
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 border-b bg-muted/20">
        <ValidationPanel issues={validationIssues} />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={handlePaneClick}
            onConnect={onConnect}
          />
        </div>
        {selectedEdge && (
          <EdgeConfigPanel
            edge={selectedEdge}
            sourceStep={sourceForEdge}
            targetStep={targetForEdge}
            onUpdate={(edgeId, patch) => {
              void updateEdge(edgeId, patch);
            }}
            onDelete={(edgeId) => {
              void deleteEdge(edgeId);
            }}
            onClose={() => setSelectedEdgeId(null)}
          />
        )}
        {selectedStep && !selectedEdge && (
          <WorkflowNodeConfigPanel
            step={selectedStep}
            agents={agents}
            availableStageGroups={availableStageGroups}
            onUpdate={updateStep}
            onDelete={deleteStep}
            onClose={() => setSelectedNodeId(null)}
            templateTestRun={templateTestRun}
          />
        )}
      </div>
    </div>
  );
};

export default WorkflowTemplateEditor;
