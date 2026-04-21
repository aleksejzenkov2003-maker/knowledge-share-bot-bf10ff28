import React, { useCallback, useState, useRef } from 'react';
import { ProjectStepMessage } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Send, Bot, User, Paperclip, FileText, ChevronDown, Brain, X, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PiiIndicator, hasPiiTokens, countPiiTokens } from '@/components/chat/PiiIndicator';
import { useAddProjectMemory } from '@/hooks/queries/useProjectQueries';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronRight } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;

interface InheritedAttachment {
  file_path: string;
  file_name: string;
  file_size?: number;
}

interface PendingAttachment {
  id: string;
  file: File;
  file_path?: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: 'uploading' | 'uploaded' | 'error';
  containsPii: boolean;
}

interface WorkflowStepChatProps {
  stepId: string;
  projectId?: string;
  messages: ProjectStepMessage[];
  onSendMessage: (
    message: string,
    attachments?: { file_path: string; file_name: string; file_type: string; file_size: number; contains_pii?: boolean }[]
  ) => void;
  isExecuting: boolean;
  streamingContent: string;
  inheritedAttachments?: InheritedAttachment[];
}

const chatMarkdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border px-2 py-1 align-top">{children}</td>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto max-w-full whitespace-pre-wrap break-words text-xs my-2 p-2 rounded bg-background/50">{children}</pre>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return <code className="text-xs font-mono">{children}</code>;
    }
    return <code className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sanitizeForStorage(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
  const safeBase = base
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'file';
  const safeExt = ext.replace(/[^\w.]+/g, '');
  return `${safeBase}${safeExt}`;
}

/**
 * Делит контент сообщения агента на «человеческий» текст и сырой JSON.
 * Поддерживает три формата:
 *  1. Чистый JSON-объект — извлекаем текстовые поля (summary/_stream_text/content/...).
 *  2. Markdown + блок ```json``` — показываем markdown без блока, JSON сворачиваем.
 *  3. Обычный markdown/текст — отдаём как есть.
 */
function splitAgentMessage(raw: string): { display: string; json?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { display: raw };

  // Markdown с ```json ... ```
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const before = trimmed.slice(0, fenceMatch.index ?? 0).trim();
    const after = trimmed.slice((fenceMatch.index ?? 0) + fenceMatch[0].length).trim();
    const display = [before, after].filter(Boolean).join('\n\n');
    let pretty = fenceMatch[1].trim();
    try {
      pretty = JSON.stringify(JSON.parse(pretty), null, 2);
    } catch { /* keep as is */ }
    return { display: display || '_(см. структурированный ответ ниже)_', json: pretty };
  }

  // Чистый JSON (объект или массив)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const textCandidates = [
        parsed?.human_readable?.summary,
        parsed?.summary,
        parsed?._stream_text,
        parsed?.content,
        parsed?.text,
        parsed?.message,
      ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      const display = textCandidates[0] || '_(структурированный ответ агента)_';
      return { display, json: JSON.stringify(parsed, null, 2) };
    } catch { /* not valid JSON, fall through */ }
  }

  return { display: raw };
}

const AssistantMessageBody: React.FC<{ content: string }> = ({ content }) => {
  const [expanded, setExpanded] = useState(false);
  const { display, json } = React.useMemo(() => splitAgentMessage(content), [content]);
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words min-w-0 [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
        {display}
      </ReactMarkdown>
      {json && (
        <div className="not-prose mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition"
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
            {expanded ? 'Скрыть JSON' : 'Показать JSON'}
          </button>
          {expanded && (
            <pre className="mt-1.5 max-h-80 overflow-auto rounded-md border bg-background/60 p-2 text-[11px] font-mono leading-snug whitespace-pre-wrap break-words">
              {json}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export const WorkflowStepChat: React.FC<WorkflowStepChatProps> = ({
  stepId,
  projectId,
  messages,
  onSendMessage,
  isExecuting,
  streamingContent,
  inheritedAttachments = [],
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showInherited, setShowInherited] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserNearBottomRef = useRef(true);

  const addMemoryMutation = useAddProjectMemory(projectId || '');

  // Track whether user is near bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80;
    isUserNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll only when user is near bottom or during streaming
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (isUserNearBottomRef.current || isExecuting) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent, isExecuting]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    const remainingSlots = MAX_FILES - attachments.length;
    if (remainingSlots <= 0) {
      toast.error(`Максимум ${MAX_FILES} файлов`);
      return;
    }
    const accepted = fileArr.slice(0, remainingSlots);
    const oversized = accepted.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast.error(`Файлы больше 10МБ: ${oversized.map((f) => f.name).join(', ')}`);
    }
    const valid = accepted.filter((f) => f.size <= MAX_FILE_SIZE);
    if (valid.length === 0) return;

    const newPending: PendingAttachment[] = valid.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      file_name: f.name,
      file_type: f.type || 'application/octet-stream',
      file_size: f.size,
      status: 'uploading',
      containsPii: false,
    }));
    setAttachments((prev) => [...prev, ...newPending]);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Не авторизован');
      setAttachments((prev) => prev.filter((a) => !newPending.some((np) => np.id === a.id)));
      return;
    }

    for (const att of newPending) {
      try {
        const safeName = sanitizeForStorage(att.file_name);
        const path = `${user.id}/workflow/${stepId}/${Date.now()}_${safeName}`;
        const { error } = await supabase.storage
          .from('chat-attachments')
          .upload(path, att.file, { contentType: att.file_type });
        if (error) throw error;
        setAttachments((prev) =>
          prev.map((a) => (a.id === att.id ? { ...a, status: 'uploaded', file_path: path } : a))
        );
      } catch (e) {
        console.error('Upload error:', e);
        toast.error(`Ошибка загрузки ${att.file_name}`);
        setAttachments((prev) =>
          prev.map((a) => (a.id === att.id ? { ...a, status: 'error' } : a))
        );
      }
    }
  }, [attachments.length, stepId]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const togglePii = useCallback((id: string, value: boolean) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, containsPii: value } : a)));
  }, []);

  const isUploading = attachments.some((a) => a.status === 'uploading');
  const canSend = (inputValue.trim() || attachments.some((a) => a.status === 'uploaded')) && !isExecuting && !isUploading;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const ready = attachments
      .filter((a) => a.status === 'uploaded' && a.file_path)
      .map((a) => ({
        file_path: a.file_path!,
        file_name: a.file_name,
        file_type: a.file_type,
        file_size: a.file_size,
        contains_pii: a.containsPii,
      }));
    onSendMessage(inputValue.trim(), ready.length > 0 ? ready : undefined);
    setInputValue('');
    setAttachments([]);
    isUserNearBottomRef.current = true;
  }, [attachments, canSend, inputValue, onSendMessage]);

  const handleSaveToMemory = useCallback((msg: ProjectStepMessage) => {
    if (!projectId) {
      toast.error('Память доступна только в проекте');
      return;
    }
    const content = msg.content.slice(0, 2000);
    addMemoryMutation.mutate({
      memoryType: 'fact',
      content,
      sourceMessageId: undefined,
    });
  }, [projectId, addMemoryMutation]);

  return (
    <div className="flex min-h-0 h-full min-w-0 flex-col overflow-hidden rounded-md border">
      {inheritedAttachments.length > 0 && (
        <div className="shrink-0 border-b bg-muted/30 px-3 py-2 text-xs">
          <button
            type="button"
            onClick={() => setShowInherited((v) => !v)}
            className="flex w-full items-center gap-1.5 text-muted-foreground hover:text-foreground transition"
          >
            <Paperclip className="h-3 w-3" />
            <span>К шагу подключено документов: {inheritedAttachments.length}</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform ml-auto', showInherited && 'rotate-180')} />
          </button>
          {showInherited && (
            <div className="mt-2 space-y-1">
              {inheritedAttachments.map((a) => (
                <div key={a.file_path} className="flex items-center gap-1.5 text-[11px] text-foreground/80">
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.file_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0 overscroll-contain"
      >
        <div className="space-y-3 min-w-0 max-w-full">
          {messages.map((msg) => {
            const piiCount = msg.message_role === 'assistant' && hasPiiTokens(msg.content)
              ? countPiiTokens(msg.content)
              : 0;
            return (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2',
                  msg.message_role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.message_role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className={cn('flex flex-col gap-1 max-w-[80%] min-w-0', msg.message_role === 'user' ? 'items-end' : 'items-start')}>
                  <Card className={cn(
                    'p-3 text-sm min-w-0 w-full',
                    msg.message_role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}>
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words min-w-0 [overflow-wrap:anywhere]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={chatMarkdownComponents}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </Card>
                  {msg.message_role === 'assistant' && (
                    <div className="flex items-center gap-1.5 px-1">
                      {piiCount > 0 && (
                        <PiiIndicator text={msg.content} className="text-[10px]" />
                      )}
                      {projectId && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleSaveToMemory(msg)}
                                disabled={addMemoryMutation.isPending}
                              >
                                <Brain className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>В память проекта</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  )}
                </div>
                {msg.message_role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
          })}

          {isExecuting && streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <Card className="p-3 max-w-[80%] text-sm bg-muted min-w-0">
                <div className="prose prose-sm dark:prose-invert max-w-none break-words min-w-0 [overflow-wrap:anywhere]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={chatMarkdownComponents}
                  >
                    {streamingContent}
                  </ReactMarkdown>
                </div>
              </Card>
            </div>
          )}

          {isExecuting && !streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <Card className="p-3 bg-muted">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Агент работает...
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Pending attachments preview */}
      {attachments.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1.5 shrink-0 bg-muted/20">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
            >
              {a.status === 'uploading' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : a.status === 'error' ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{a.file_name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatFileSize(a.file_size)}
              </span>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer shrink-0">
                <Checkbox
                  checked={a.containsPii}
                  onCheckedChange={(v) => togglePii(a.id, !!v)}
                  className="h-3 w-3"
                />
                Скрыть ПДн
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0"
                onClick={() => removeAttachment(a.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="p-2 border-t flex items-end gap-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={isExecuting || attachments.length >= MAX_FILES}
          title="Прикрепить файл"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Уточнение для агента или отправьте файлы..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isExecuting}
          rows={1}
          className="min-h-[36px] max-h-32 resize-none text-sm py-2"
        />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!canSend}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
