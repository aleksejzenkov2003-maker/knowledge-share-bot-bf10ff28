import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WorkflowResultEditorProps {
  content: string;
  isEditable: boolean;
  isStreaming: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  hasUnsavedChanges: boolean;
}

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
      <Card className="p-4 mt-3">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Генерация ответа...
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
              td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </Card>
    );
  }

  if (!content) return null;

  if (isEditing && isEditable) {
    return (
      <Card className="p-4 mt-3">
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

  return (
    <Card className="p-4 mt-3">
      {isEditable && (
        <div className="flex justify-end mb-2">
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Редактировать
          </Button>
        </div>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="my-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
            td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </Card>
  );
};
