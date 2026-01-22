import React from 'react';
import { DepartmentChatMessage as MessageType } from '@/types/departmentChat';
import { Bot, User, FileText, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';

interface DepartmentChatMessageProps {
  message: MessageType;
  currentUserId?: string;
}

export const DepartmentChatMessage: React.FC<DepartmentChatMessageProps> = ({
  message,
  currentUserId
}) => {
  const isAssistant = message.message_role === 'assistant';
  const isOwnMessage = message.user_id === currentUserId;
  const userName = message.metadata?.user_name || 'Пользователь';
  const agentName = message.metadata?.agent_name;

  return (
    <div className={cn(
      "flex gap-3 p-4 rounded-lg",
      isAssistant 
        ? "bg-muted/50" 
        : isOwnMessage 
          ? "bg-primary/5" 
          : "bg-secondary/30"
    )}>
      {/* Avatar */}
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        isAssistant 
          ? "bg-primary text-primary-foreground" 
          : "bg-secondary text-secondary-foreground"
      )}>
        {isAssistant ? (
          <Bot className="h-5 w-5" />
        ) : (
          <User className="h-5 w-5" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">
            {isAssistant ? (
              <span className="flex items-center gap-1">
                <span className="text-primary">🤖</span>
                {agentName || 'Ассистент'}
              </span>
            ) : (
              userName
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>

        {/* Message content */}
        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
          {isAssistant ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm">{children}</code>
                  ) : (
                    <code className="block p-3 rounded bg-muted font-mono text-sm overflow-x-auto">{children}</code>
                  );
                },
                pre: ({ children }) => <pre className="mb-2 overflow-x-auto">{children}</pre>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary pl-4 italic my-2">{children}</blockquote>
                ),
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80 font-medium">
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-primary">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic">{children}</em>
                ),
              }}
            >
              {message.content || '...'}
            </ReactMarkdown>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {/* Attachments */}
        {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.metadata.attachments.map((att, idx) => {
              const isImage = att.file_type.startsWith('image/');
              const { data } = supabase.storage.from('chat-attachments').getPublicUrl(att.file_path);
              
              return (
                <a
                  key={idx}
                  href={data.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md border bg-background",
                    "hover:bg-muted transition-colors text-sm"
                  )}
                >
                  {isImage ? (
                    <Image className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="truncate max-w-[120px]">{att.file_name}</span>
                </a>
              );
            })}
          </div>
        )}

        {/* RAG Citations if available */}
        {message.metadata?.citations && message.metadata.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Документы:</div>
            <div className="flex flex-wrap gap-1">
              {message.metadata.citations.map((citation, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
                >
                  [{citation.index}] {citation.document}
                  {citation.article && `, ст. ${citation.article}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Perplexity Web Citations */}
        {message.metadata?.perplexity_citations && message.metadata.perplexity_citations.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Веб-источники:</div>
            <ul className="space-y-1">
              {message.metadata.perplexity_citations.map((url, idx) => {
                let hostname = url;
                try {
                  hostname = new URL(url).hostname.replace('www.', '');
                } catch {}
                return (
                  <li key={idx}>
                    <a 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <span className="font-medium">[{idx + 1}]</span>
                      <span className="truncate max-w-[300px]">{hostname}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Truncation warning */}
        {message.metadata?.stop_reason === 'max_tokens' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <span>⚠️</span>
            <span>Ответ был обрезан из-за ограничения длины</span>
          </div>
        )}
      </div>
    </div>
  );
};
