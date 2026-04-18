import React from 'react';
import { useWorkflowEditor, type WorkflowNodeData } from '@/hooks/useWorkflowEditor';
import { useWorkflowTemplateTestRun } from '@/hooks/useWorkflowTemplateTestRun';
import { WorkflowCanvas } from '@/components/workflow-editor/WorkflowCanvas';
import { WorkflowNodeConfigPanel } from '@/components/workflow-editor/WorkflowNodeConfigPanel';
import { EdgeConfigPanel } from '@/components/workflow-editor/EdgeConfigPanel';
import { AddNodeMenu } from '@/components/workflow-editor/AddNodeMenu';
import { ValidationPanel } from '@/components/workflow-editor/ValidationPanel';
import { WorkflowEditorEmptyHint } from '@/components/workflow-editor/WorkflowEditorEmptyHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, ArrowLeft, Rocket, HelpCircle } from 'lucide-react';
import { useTour } from '@/components/tour/TourProvider';
import { workflowEditorTourSteps } from '@/components/tour/tourSteps';
import type { Node } from '@xyflow/react';

interface WorkflowTemplateEditorProps {
  templateId: string;
  onBack: () => void;
  /** Optional: navigate to presets gallery instead of going back to list. */
  onOpenGallery?: () => void;
  /** Optional: open the AI-architect dialog. */
  onOpenAIArchitect?: () => void;
}

const WorkflowTemplateEditor: React.FC<WorkflowTemplateEditorProps> = ({
  templateId,
  onBack,
  onOpenGallery,
  onOpenAIArchitect,
}) => {
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
  const { startTour } = useTour();

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

  const statusLabel = template?.template_status === 'published'
    ? 'Опубликован'
    : template?.template_status === 'archived'
      ? 'Архив'
      : 'Черновик';

  const statusHint = template?.template_status === 'published'
    ? 'Шаблон виден пользователям и может запускаться в проектах.'
    : template?.template_status === 'archived'
      ? 'Шаблон скрыт. Запуск новых процессов отключён.'
      : 'Черновик: видно только вам. Опубликуйте, когда всё настроено.';

  const isEmpty = steps.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-background"
        data-tour="workflow-editor-toolbar"
      >
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
            data-tour="workflow-editor-name"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] cursor-help">
                v{template?.version ?? 1}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Версия шаблона. Увеличивается при значимых изменениях.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={template?.template_status === 'published' ? 'default' : 'secondary'}
                className="text-[10px] cursor-help"
                data-tour="workflow-editor-status"
              >
                {statusLabel}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{statusHint}</TooltipContent>
          </Tooltip>
          <div data-tour="workflow-editor-add-step">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <AddNodeMenu onAdd={handleAddNode} />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Добавить шаг процесса: ввод данных, AI-агент, условие, проверка, скрипт или итог.
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">{steps.length} узлов</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="default"
                className="gap-1"
                onClick={() => void publishTemplate()}
                data-tour="workflow-editor-publish"
              >
                <Rocket className="h-3.5 w-3.5" />
                Опубликовать
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Сделать шаблон доступным для запуска в проектах. Черновик остаётся у вас до публикации.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => startTour(workflowEditorTourSteps)}
                aria-label="Показать инструкцию"
                data-tour="workflow-editor-help"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Краткий тур по редактору</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        className="px-4 py-2 border-b bg-muted/20"
        data-tour="workflow-editor-validation"
      >
        <ValidationPanel issues={validationIssues} />
      </div>

      <div className="flex flex-1 min-h-0">
        <div
          className="flex-1 min-w-0 relative"
          data-tour="workflow-editor-canvas"
        >
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={handlePaneClick}
            onConnect={onConnect}
          />
          {isEmpty && (
            <WorkflowEditorEmptyHint
              onAddFirstStep={() => void handleAddNode('input')}
              onStartTour={() => startTour(workflowEditorTourSteps)}
              onOpenGallery={onOpenGallery}
              onOpenAIArchitect={onOpenAIArchitect}
            />
          )}
        </div>
        {selectedEdge && (
          <div data-tour="workflow-editor-edge-panel">
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
          </div>
        )}
        {selectedStep && !selectedEdge && (
          <div data-tour="workflow-editor-node-panel">
            <WorkflowNodeConfigPanel
              step={selectedStep}
              agents={agents}
              availableStageGroups={availableStageGroups}
              onUpdate={updateStep}
              onDelete={deleteStep}
              onClose={() => setSelectedNodeId(null)}
              templateTestRun={templateTestRun}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowTemplateEditor;
