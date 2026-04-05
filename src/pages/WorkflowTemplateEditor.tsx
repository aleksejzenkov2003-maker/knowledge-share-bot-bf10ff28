import React from 'react';
import { useWorkflowEditor, type WorkflowNodeData } from '@/hooks/useWorkflowEditor';
import { WorkflowCanvas } from '@/components/workflow-editor/WorkflowCanvas';
import { WorkflowNodeConfigPanel } from '@/components/workflow-editor/WorkflowNodeConfigPanel';
import { AddNodeMenu } from '@/components/workflow-editor/AddNodeMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
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
    selectedStep,
    isLoading,
    updateTemplate,
    addStep,
    updateStep,
    deleteStep,
    saveNodePositions,
  } = useWorkflowEditor(templateId);

  const [templateName, setTemplateName] = React.useState('');

  React.useEffect(() => {
    if (template) setTemplateName(template.name);
  }, [template]);

  const handleAddNode = async (nodeType: string) => {
    // Place new node offset from last node
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
          <Input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onBlur={handleSaveTemplateName}
            className="h-8 w-64 text-sm font-semibold"
          />
        </div>
        <div className="flex items-center gap-2">
          <AddNodeMenu onAdd={handleAddNode} />
          <span className="text-xs text-muted-foreground">{steps.length} шагов</span>
        </div>
      </div>

      {/* Canvas + config panel */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1">
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onNodeClick={setSelectedNodeId}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={() => setSelectedNodeId(null)}
          />
        </div>
        {selectedStep && (
          <WorkflowNodeConfigPanel
            step={selectedStep}
            agents={agents}
            onUpdate={updateStep}
            onDelete={deleteStep}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
};

export default WorkflowTemplateEditor;
