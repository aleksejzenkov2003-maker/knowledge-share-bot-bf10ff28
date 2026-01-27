import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Clock, FileText, Loader2, BookOpen, Globe, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BitrixMessageActions } from "./BitrixMessageActions";
import { SourcesPanel } from "./SourcesPanel";
import { Citation, Attachment } from "@/types/chat";

interface ChatRole {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface BitrixMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  responseTime?: number;
  ragContext?: string[];
  citations?: Citation[];
  smartSearch?: boolean;
  isStreaming?: boolean;
  attachments?: Attachment[];
  webSearchCitations?: string[];
  webSearchUsed?: boolean;
  roleId?: string;
}

interface BitrixChatMessageProps {
  message: BitrixMessage;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onStopGeneration?: () => void;
  availableRoles?: ChatRole[];
  currentRoleId?: string;
  // Bitrix context for document access
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
}

function BitrixChatMessageComponent({ 
  message, 
  onEditMessage, 
  onRegenerateResponse,
  onDeleteMessage,
  onStopGeneration,
  availableRoles, 
  currentRoleId,
  bitrixApiBaseUrl,
  bitrixToken,
}: BitrixChatMessageProps) {
  // Determine if we're in Bitrix context (have both URL and token)
  const isBitrixContext = Boolean(bitrixApiBaseUrl && bitrixToken);
  return (
    <div
      className={cn(
        "flex gap-3 group",
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
                    p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="mb-1 leading-relaxed">{children}</li>,
                    code: ({ className, children }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      ) : (
                        <pre className="bg-background/50 p-3 rounded overflow-x-auto my-3">
                          <code className="text-xs font-mono">{children}</code>
                        </pre>
                      );
                    },
                    h1: ({ children }) => <h1 className="text-xl font-bold mt-5 mb-3">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-2">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1">{children}</h4>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-3 border-primary pl-4 my-3 italic text-muted-foreground">
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
                    strong: ({ children }) => (
                      <strong className="font-semibold">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic">{children}</em>
                    ),
                    hr: () => <hr className="my-4 border-border" />,
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4 rounded border border-border">
                        <table className="min-w-full border-collapse text-sm">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-muted/50">{children}</thead>
                    ),
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => (
                      <tr className="border-b border-border last:border-b-0 even:bg-muted/20">{children}</tr>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left font-semibold bg-muted/30 border-b border-border whitespace-nowrap">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 border-b border-border/50">{children}</td>
                    ),
                  }}
                >
                  {message.content}
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
            
            {/* Sources/Citations badges */}
            {((message.ragContext && message.ragContext.length > 0) || 
              (message.citations && message.citations.length > 0) ||
              (message.webSearchCitations && message.webSearchCitations.length > 0)) && (
              <Sheet>
                <SheetTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {message.ragContext?.length || 0} источников
                    {message.smartSearch && " (Claude)"}
                  </Badge>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Источники ответа</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <SourcesPanel 
                      ragContext={message.ragContext}
                      citations={message.citations}
                      webSearchCitations={message.webSearchCitations}
                      webSearchUsed={message.webSearchUsed}
                      isBitrixContext={isBitrixContext}
                      bitrixApiBaseUrl={bitrixApiBaseUrl}
                      bitrixToken={bitrixToken}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            
            {message.citations && message.citations.length > 0 && (
              <Sheet>
                <SheetTrigger asChild>
                  <Badge 
                    variant="secondary" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <BookOpen className="h-3 w-3 mr-1" />
                    {message.citations.length} цитат
                  </Badge>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Цитаты из документов</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <SourcesPanel 
                      ragContext={message.ragContext}
                      citations={message.citations}
                      webSearchCitations={message.webSearchCitations}
                      webSearchUsed={message.webSearchUsed}
                      isBitrixContext={isBitrixContext}
                      bitrixApiBaseUrl={bitrixApiBaseUrl}
                      bitrixToken={bitrixToken}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            
            {message.webSearchCitations && message.webSearchCitations.length > 0 && (
              <Sheet>
                <SheetTrigger asChild>
                  <Badge 
                    variant="secondary" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Globe className="h-3 w-3 mr-1" />
                    {message.webSearchCitations.length} веб
                  </Badge>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Веб-источники</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <SourcesPanel 
                      ragContext={message.ragContext}
                      citations={message.citations}
                      webSearchCitations={message.webSearchCitations}
                      webSearchUsed={message.webSearchUsed}
                      isBitrixContext={isBitrixContext}
                      bitrixApiBaseUrl={bitrixApiBaseUrl}
                      bitrixToken={bitrixToken}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        )}
        
        {/* Action buttons */}
        <BitrixMessageActions
          messageId={message.id}
          role={message.role}
          content={message.content}
          isStreaming={message.isStreaming}
          onEditMessage={onEditMessage}
          onRegenerateResponse={onRegenerateResponse}
          onDeleteMessage={onDeleteMessage}
          onStopGeneration={onStopGeneration}
          availableRoles={availableRoles}
          currentRoleId={currentRoleId}
          ragContext={message.ragContext}
          citations={message.citations}
          webSearchCitations={message.webSearchCitations}
        />
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
export const BitrixChatMessage = React.memo(BitrixChatMessageComponent, (prevProps, nextProps) => {
  const prev = prevProps.message;
  const next = nextProps.message;
  
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.responseTime === next.responseTime &&
    prev.ragContext?.length === next.ragContext?.length &&
    prev.citations?.length === next.citations?.length &&
    prevProps.onEditMessage === nextProps.onEditMessage &&
    prevProps.onRegenerateResponse === nextProps.onRegenerateResponse &&
    prevProps.onDeleteMessage === nextProps.onDeleteMessage &&
    prevProps.availableRoles?.length === nextProps.availableRoles?.length &&
    prevProps.currentRoleId === nextProps.currentRoleId &&
    prevProps.bitrixApiBaseUrl === nextProps.bitrixApiBaseUrl &&
    prevProps.bitrixToken === nextProps.bitrixToken
  );
});
