import React from 'react';
import { DepartmentChatMessage as MessageType } from '@/types/departmentChat';
import { Bot, User, FileText, Image, Clock, BookOpen, Globe, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SourcesPanel } from './SourcesPanel';

interface DepartmentChatMessageProps {
  message: MessageType;
  currentUserId?: string;
}

function DepartmentChatMessageComponent({
  message,
  currentUserId
}: DepartmentChatMessageProps) {
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
              remarkPlugins={[remarkGfm]}
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
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3">
                    <table className="min-w-full border-collapse border border-border text-sm">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-muted/50">{children}</thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-border">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="border border-border px-3 py-2 text-left font-semibold bg-muted/30">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-border px-3 py-2">{children}</td>
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

        {/* Metadata for assistant messages */}
        {isAssistant && message.content && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
            {message.metadata?.response_time_ms && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {message.metadata.response_time_ms}ms
              </span>
            )}
            
            {/* Interactive Sources Panel */}
            {((message.metadata?.rag_context && message.metadata.rag_context.length > 0) || 
              (message.metadata?.citations && message.metadata.citations.length > 0) ||
              (message.metadata?.perplexity_citations && message.metadata.perplexity_citations.length > 0) ||
              (message.metadata?.web_search_citations && message.metadata.web_search_citations.length > 0)) && (
              <Sheet>
                <SheetTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {message.metadata?.rag_context?.length || 0} источников
                    {message.metadata?.smart_search && " (Claude)"}
                  </Badge>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Источники ответа</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <SourcesPanel 
                      ragContext={message.metadata?.rag_context}
                      citations={message.metadata?.citations}
                      webSearchCitations={message.metadata?.perplexity_citations || message.metadata?.web_search_citations}
                      webSearchUsed={message.metadata?.web_search_used}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            
            {message.metadata?.citations && message.metadata.citations.length > 0 && (
              <Sheet>
                <SheetTrigger asChild>
                  <Badge 
                    variant="secondary" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <BookOpen className="h-3 w-3 mr-1" />
                    {message.metadata.citations.length} цитат
                  </Badge>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Цитаты из документов</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <SourcesPanel 
                      ragContext={message.metadata?.rag_context}
                      citations={message.metadata?.citations}
                      webSearchCitations={message.metadata?.perplexity_citations || message.metadata?.web_search_citations}
                      webSearchUsed={message.metadata?.web_search_used}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            
            {/* Web search sources */}
            {(message.metadata?.perplexity_citations?.length > 0 || message.metadata?.web_search_citations?.length > 0) && (
              <Sheet>
                <SheetTrigger asChild>
                  <Badge 
                    variant="secondary" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Globe className="h-3 w-3 mr-1" />
                    {(message.metadata?.perplexity_citations?.length || message.metadata?.web_search_citations?.length || 0)} веб
                  </Badge>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Веб-источники</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <SourcesPanel 
                      ragContext={message.metadata?.rag_context}
                      citations={message.metadata?.citations}
                      webSearchCitations={message.metadata?.perplexity_citations || message.metadata?.web_search_citations}
                      webSearchUsed={message.metadata?.web_search_used}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            
            {/* Warning for truncated messages */}
            {message.metadata?.stop_reason === 'max_tokens' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="text-xs cursor-help">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Обрезано
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Ответ был обрезан из-за ограничения длины
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Memoize with custom comparison to prevent unnecessary re-renders
export const DepartmentChatMessage = React.memo(DepartmentChatMessageComponent, (prevProps, nextProps) => {
  const prev = prevProps.message;
  const next = nextProps.message;
  
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.metadata?.response_time_ms === next.metadata?.response_time_ms &&
    prev.metadata?.rag_context?.length === next.metadata?.rag_context?.length &&
    prev.metadata?.citations?.length === next.metadata?.citations?.length &&
    prevProps.currentUserId === nextProps.currentUserId
  );
});
