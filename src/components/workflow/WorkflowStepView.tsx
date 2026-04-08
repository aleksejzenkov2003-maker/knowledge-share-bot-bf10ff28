import React, { useState, useMemo } from 'react';
import { ProjectWorkflowStep, ProjectStepMessage, WorkflowArtifact } from '@/types/workflow';
import { WorkflowResultEditor } from './WorkflowResultEditor';
import { WorkflowStepChat } from './WorkflowStepChat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpRenderEditorDialog } from './KpRenderEditorDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  MessageSquare,
  Bot,
  GitCompareArrows,
  Braces,
  FileSignature,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
interface WorkflowStepViewProps {
  step: ProjectWorkflowStep;
  stepMessages: ProjectStepMessage[];
  artifacts: WorkflowArtifact[];
  projectId: string;
  isExecuting: boolean;
  streamingContent: string;
  onExecute: (stepId: string, message?: string) => void;
  onStop: () => void;
  onSaveEdits: (stepId: string, edits: Record<string, unknown>) => void;
  onConfirm: (stepId: string) => void;
  onSetInputData: (stepId: string, data: Record<string, unknown>) => void;
  onRetryStep: (stepId: string) => void;
  onRetryFromStep: (stepId: string) => void;
  isFirstStep: boolean;
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Ожидание', variant: 'outline' },
  running: { label: 'Выполняется', variant: 'default' },
  completed: { label: 'Завершён', variant: 'secondary' },
  error: { label: 'Ошибка', variant: 'destructive' },
  skipped: { label: 'Пропущен', variant: 'outline' },
  waiting_for_user: { label: 'Ожидает подтверждения', variant: 'outline' },
};

function stringifyPayload(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null && 'content' in data) {
    return String((data as Record<string, unknown>).content);
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export const WorkflowStepView: React.FC<WorkflowStepViewProps> = ({
  step,
  stepMessages,
  artifacts,
  projectId,
  isExecuting,
  streamingContent,
  onExecute,
  onStop,
  onSaveEdits,
  onConfirm,
  onSetInputData,
  onRetryStep,
  onRetryFromStep,
  isFirstStep,
}) => {
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [compareRaw, setCompareRaw] = useState(false);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);

  // Filter screenshot artifacts for this step
  const screenshotArtifacts = useMemo(() => {
    return artifacts.filter(
      (a) =>
        a.project_workflow_step_id === step.id &&
        a.artifact_type === 'screenshot' &&
        a.bucket === 'node-artifacts',
    );
  }, [artifacts, step.id]);

  const getScreenshotUrl = (artifact: WorkflowArtifact) => {
    const { data } = supabase.storage
      .from(artifact.bucket)
      .getPublicUrl(artifact.path);
    // For private buckets, use createSignedUrl instead
    return data.publicUrl;
  };

  const name = step.template_step?.name || `Этап ${step.step_order}`;
  const description = step.template_step?.description || '';
  const agentName = step.agent?.name || 'Агент';
  const nodeType = step.template_step?.node_type || '';

  const hr = step.human_readable_output as { title?: string; summary?: string; sections?: unknown[] } | null;
  const rawOut = step.raw_output ?? step.output_data;
  const userEdited = step.user_edited_output ?? step.user_edits;

  const outputContent = stringifyPayload(rawOut);
  const userEditsContent = userEdited ? stringifyPayload(userEdited) : null;

  const displayContent =
    isExecuting && streamingContent
      ? streamingContent
      : editedContent !== null
        ? editedContent
        : compareRaw
          ? outputContent
          : userEditsContent || hr?.summary || outputContent;

  const statusInfo = statusLabels[step.status] || statusLabels.pending;
  const isEditable = step.template_step?.is_user_editable !== false;
  const isKpFinal =
    (step.template_step?.name || '').toLowerCase().includes('кп') ||
    step.template_step?.node_type === 'output';

  const handleSaveEdits = () => {
    if (editedContent !== null) {
      try {
        const parsed = JSON.parse(editedContent);
        onSaveEdits(step.id, parsed as Record<string, unknown>);
      } catch {
        onSaveEdits(step.id, { content: editedContent });
      }
      setEditedContent(null);
    }
  };

  const handleConfirm = () => {
    onConfirm(step.id);
  };

  const handleSetInput = () => {
    if (inputText.trim()) {
      onSetInputData(step.id, { content: inputText });
      setInputText('');
    }
  };

  if (isFirstStep && step.status === 'pending') {
    return (
      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{name}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <Card className="p-4">
          <label className="text-sm font-medium mb-2 block">Входные данные</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Введите данные для начала workflow..."
            className="w-full min-h-[200px] p-3 border rounded-md bg-background text-sm resize-y"
          />
          <Button onClick={handleSetInput} disabled={!inputText.trim()} className="mt-3">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Сохранить и продолжить
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">{name}</h2>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {step.agent && (
            <Badge variant="secondary" className="text-xs">
              <Bot className="h-3 w-3 mr-1" />
              {agentName}
            </Badge>
          )}

          {nodeType === 'condition' &&
            step.status === 'completed' &&
            rawOut &&
            typeof rawOut === 'object' && (
              <Badge variant="outline" className="text-xs">
                {(rawOut as Record<string, unknown>)._branch === true ||
                (rawOut as Record<string, unknown>)._branch === 'true'
                  ? 'Итог условия: Да'
                  : 'Итог условия: Нет'}
              </Badge>
            )}

          {nodeType === 'quality_check' &&
            step.status === 'completed' &&
            rawOut &&
            typeof rawOut === 'object' && (
              <Badge
                variant={(rawOut as Record<string, unknown>).quality_passed === true ? 'secondary' : 'destructive'}
                className="text-xs"
              >
                {(rawOut as Record<string, unknown>).quality_passed === true
                  ? 'Проверка пройдена'
                  : 'Проверка не пройдена'}
              </Badge>
            )}

          {step.status === 'pending' && !isFirstStep && (
            <Button size="sm" onClick={() => onExecute(step.id)}>
              <Play className="h-4 w-4 mr-1" />
              Запустить
            </Button>
          )}

          {step.status === 'running' || isExecuting ? (
            <Button size="sm" variant="outline" onClick={onStop}>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Остановить
            </Button>
          ) : null}

          {step.status === 'completed' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onExecute(step.id)}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Перезапустить
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRetryStep(step.id)}>
                Сбросить шаг
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRetryFromStep(step.id)}>
                Сбросить отсюда
              </Button>
              <Button size="sm" onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Подтвердить
              </Button>
            </>
          )}

          {step.status === 'completed' && isKpFinal && (
            <KpRenderEditorDialog
              projectId={projectId}
              workflowId={step.workflow_id}
              stepId={step.id}
              initialMarkdown={stringifyPayload(userEdited ?? rawOut)}
              artifacts={artifacts}
              trigger={
                <Button size="sm" variant="outline">
                  <FileSignature className="h-4 w-4 mr-1" />
                  Редактор КП
                </Button>
              }
            />
          )}

          {step.status === 'error' && (
            <Button size="sm" onClick={() => onExecute(step.id)}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Повторить
            </Button>
          )}
        </div>
      </div>

      {hr?.title && step.status === 'completed' && (
        <div className="mx-4 mt-3 p-3 rounded-md bg-primary/5 border border-primary/20 text-sm">
          <div className="font-semibold text-primary">{hr.title}</div>
          {hr.summary && <p className="text-muted-foreground mt-1 text-xs">{hr.summary}</p>}
        </div>
      )}

      {step.error_message && (
        <div className="mx-4 mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {step.error_message}
        </div>
      )}

      {displayContent || isExecuting ? (
        <Tabs defaultValue="result" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 w-fit flex-wrap h-auto gap-1">
            <TabsTrigger value="result">
              <FileText className="h-4 w-4 mr-1" />
              Результат
            </TabsTrigger>
            <TabsTrigger value="structured">
              <Braces className="h-4 w-4 mr-1" />
              JSON
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-1" />
              Чат с агентом
            </TabsTrigger>
          </TabsList>

          <TabsContent value="result" className="flex-1 overflow-auto px-4 pb-4">
            {userEdited && rawOut && (
              <div className="flex justify-end mb-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setCompareRaw((v) => !v)}
                >
                  <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                  {compareRaw ? 'Показать правки' : 'Сравнить с сырым'}
                </Button>
              </div>
            )}
            <WorkflowResultEditor
              content={displayContent}
              isEditable={isEditable && step.status === 'completed'}
              isStreaming={isExecuting}
              onChange={setEditedContent}
              onSave={handleSaveEdits}
              hasUnsavedChanges={editedContent !== null}
            />
          </TabsContent>

          <TabsContent value="structured" className="flex-1 overflow-auto px-4 pb-4">
            <Card className="p-3 mt-3">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {stringifyPayload(compareRaw ? rawOut : userEdited ?? rawOut)}
              </pre>
            </Card>
          </TabsContent>

          <TabsContent value="chat" className="flex-1 overflow-hidden px-4 pb-4">
            <WorkflowStepChat
              stepId={step.id}
              messages={stepMessages}
              onSendMessage={(msg) => onExecute(step.id, msg)}
              isExecuting={isExecuting}
              streamingContent={streamingContent}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Нажмите «Запустить» для выполнения этапа</p>
          </div>
        </div>
      )}
    </div>
  );
};
