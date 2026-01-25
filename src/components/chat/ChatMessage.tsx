import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Clock, FileText, Loader2, BookOpen, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message } from "@/types/chat";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatMessageProps {
  message: Message;
}

function ChatMessageComponent({ message }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex gap-3",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.role === "assistant" && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <Card
        className={cn(
          "max-w-[70%] p-4",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        <div
          className={cn(
            "prose prose-sm max-w-none",
            message.role === "user"
              ? "prose-invert"
              : "prose-neutral dark:prose-invert"
          )}
        >
          {message.role === "assistant" ? (
            <>
              {message.isStreaming && !message.content ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Генерирую ответ...</span>
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    code: ({ className, children }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-background/50 px-1 py-0.5 rounded text-xs">
                          {children}
                        </code>
                      ) : (
                        <pre className="bg-background/50 p-2 rounded overflow-x-auto">
                          <code className="text-xs">{children}</code>
                        </pre>
                      );
                    },
                    h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold mb-2">{children}</h3>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-primary pl-3 italic">
                        {children}
                      </blockquote>
                    ),
                    a: ({ children, href }) => (
                      <a 
                        href={href} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-primary underline hover:opacity-80 font-medium"
                      >
                        {children}
                      </a>
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
                  {message.content.replace(/\[(\d+)\]/g, '**[$1]**')}
                </ReactMarkdown>
              )}
              {message.isStreaming && message.content && (
                <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
              )}
            </>
          ) : (
            <div className="space-y-2">
              {/* Display attachments for user messages */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {message.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 px-2 py-1 rounded bg-primary-foreground/10 text-xs"
                    >
                      {attachment.file_type.startsWith('image/') ? (
                        <Image className="h-3 w-3" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      <span className="truncate max-w-[100px]">{attachment.file_name}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          )}
        </div>
        
        {message.role === "assistant" && !message.isStreaming && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
            {message.responseTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {message.responseTime}ms
              </span>
            )}
            {message.ragContext && message.ragContext.length > 0 && (
              <Badge variant="outline" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                {message.ragContext.length} источников
                {message.smartSearch && " (Claude re-rank)"}
              </Badge>
            )}
            {message.citations && message.citations.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-xs cursor-help">
                    <BookOpen className="h-3 w-3 mr-1" />
                    {message.citations.length} цитат
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm">
                  <div className="text-xs space-y-1">
                    {message.citations.slice(0, 5).map((citation) => (
                      <div key={citation.index} className="flex items-start gap-1">
                        <span className="font-medium">[{citation.index}]</span>
                        <span className="truncate">
                          {citation.document}
                          {citation.article && `, ст. ${citation.article}`}
                        </span>
                      </div>
                    ))}
                    {message.citations.length > 5 && (
                      <div className="text-muted-foreground">
                        ...и ещё {message.citations.length - 5}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </Card>
      {message.role === "user" && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

// Memoize with custom comparison to prevent unnecessary re-renders
export const ChatMessage = React.memo(ChatMessageComponent, (prevProps, nextProps) => {
  const prev = prevProps.message;
  const next = nextProps.message;
  
  // Only re-render if meaningful properties changed
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.responseTime === next.responseTime &&
    prev.ragContext?.length === next.ragContext?.length &&
    prev.citations?.length === next.citations?.length
  );
});
