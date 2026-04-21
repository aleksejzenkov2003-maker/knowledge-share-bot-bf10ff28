import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Loader2, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { splitAgentMessage } from '@/lib/agentMessageFormat';

interface WorkflowResultEditorProps {
  content: string;
  isEditable: boolean;
  isStreaming: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  hasUnsavedChanges: boolean;
}

const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto min-w-0">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border px-2 py-1 align-top">{children}</td>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto min-w-0 max-w-full">{children}</pre>
  ),
};

export const WorkflowResultEditor: React.FC<WorkflowResultEditorProps> = ({
  content,
  isEditable,
  isStreaming,
  onChange,
  onSave,
  hasUnsavedChanges,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);

  if (isStreaming) {
    return (
      <Card className="p-4 mt-3 min-w-0">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Генерация ответа...
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 break-words [overflow-wrap:anywhere]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      </Card>
    );
  }

  if (!content) return null;

  if (isEditing && isEditable) {
    return (
      <Card className="p-4 mt-3 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Редактирование результата</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); onChange(content); }}>
              Отмена
            </Button>
            <Button size="sm" onClick={() => { onSave(); setIsEditing(false); }} disabled={!hasUnsavedChanges}>
              <Save className="h-4 w-4 mr-1" />
              Сохранить
            </Button>
          </div>
        </div>
        <textarea
          value={content}
          onChange={e => onChange(e.target.value)}
          className="w-full min-h-[400px] p-3 border rounded-md bg-background text-sm font-mono resize-y"
        />
      </Card>
    );
  }

  const { display, json } = React.useMemo(() => splitAgentMessage(content), [content]);
  const [showJson, setShowJson] = React.useState(false);

  return (
    <Card className="mt-3 flex min-h-full min-w-0 flex-col p-4">
      {isEditable && (
        <div className="flex justify-end mb-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Редактировать
          </Button>
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 break-words [overflow-wrap:anywhere]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {display}
          </ReactMarkdown>
        </div>
        {json && (
          <div className="not-prose mt-3">
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition"
            >
              <ChevronRight className={cn('h-3 w-3 transition-transform', showJson && 'rotate-90')} />
              {showJson ? 'Скрыть JSON' : 'Показать JSON'}
            </button>
            {showJson && (
              <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono leading-snug whitespace-pre-wrap break-words">
                {json}
              </pre>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
