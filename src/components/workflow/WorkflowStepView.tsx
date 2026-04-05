import React, { useState } from 'react';
import { ProjectWorkflowStep, ProjectStepMessage } from '@/types/workflow';
import { WorkflowResultEditor } from './WorkflowResultEditor';
import { WorkflowStepChat } from './WorkflowStepChat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  FileText,
  MessageSquare,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowStepViewProps {
  step: ProjectWorkflowStep;
  stepMessages: ProjectStepMessage[];
  isExecuting: boolean;
  streamingContent: string;
  onExecute: (stepId: string, message?: string) => void;
  onStop: () => void;
  onSaveEdits: (stepId: string, edits: Record<string, unknown>) => void;
  onConfirm: (stepId: string) => void;
  onSetInputData: (stepId: string, data: Record<string, unknown>) => void;
  isFirstStep: boolean;
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Ожидание', variant: 'outline' },
  running: { label: 'Выполняется', variant: 'default' },
  completed: { label: 'Завершён', variant: 'secondary' },
  error: { label: 'Ошибка', variant: 'destructive' },
  skipped: { label: 'Пропущен', variant: 'outline' },
};

export const WorkflowStepView: React.FC<WorkflowStepViewProps> = ({
  step,
  stepMessages,
  isExecuting,
  streamingContent,
  onExecute,
  onStop,
  onSaveEdits,
  onConfirm,
  onSetInputData,
  isFirstStep,
}) => {
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');

  const name = step.template_step?.name || `Этап ${step.step_order}`;
  const description = step.template_step?.description || '';
  const agentName = step.agent?.name || 'Агент';
  const outputContent = step.output_data && 'content' in step.output_data
    ? String(step.output_data.content)
    : '';
  const userEditsContent = step.user_edits && 'content' in step.user_edits
    ? String(step.user_edits.content)
    : null;
  const displayContent = isExecuting && streamingContent
    ? streamingContent
    : userEditsContent || outputContent;
  const statusInfo = statusLabels[step.status] || statusLabels.pending;
  const isEditable = step.template_step?.is_user_editable !== false;

  const handleSaveEdits = () => {
    if (editedContent !== null) {
      onSaveEdits(step.id, { content: editedContent });
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

  // First step: input form
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
            onChange={e => setInputText(e.target.value)}
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
      {/* Step header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{name}</h2>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {step.agent && (
            <Badge variant="secondary" className="text-xs">
              <Bot className="h-3 w-3 mr-1" />
              {agentName}
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
              <Button size="sm" onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Подтвердить
              </Button>
            </>
          )}

          {step.status === 'error' && (
            <Button size="sm" onClick={() => onExecute(step.id)}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Повторить
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {step.error_message && (
        <div className="mx-4 mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {step.error_message}
        </div>
      )}

      {/* Content */}
      {displayContent || isExecuting ? (
        <Tabs defaultValue="result" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 w-fit">
            <TabsTrigger value="result">
              <FileText className="h-4 w-4 mr-1" />
              Результат
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-1" />
              Чат с агентом
            </TabsTrigger>
          </TabsList>

          <TabsContent value="result" className="flex-1 overflow-auto px-4 pb-4">
            <WorkflowResultEditor
              content={editedContent !== null ? editedContent : displayContent}
              isEditable={isEditable && step.status === 'completed'}
              isStreaming={isExecuting}
              onChange={setEditedContent}
              onSave={handleSaveEdits}
              hasUnsavedChanges={editedContent !== null}
            />
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
