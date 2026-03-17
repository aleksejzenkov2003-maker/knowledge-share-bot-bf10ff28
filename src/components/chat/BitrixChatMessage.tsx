import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Clock, FileText, Loader2, BookOpen, Globe, Image, AlertTriangle, RefreshCw } from "lucide-react";
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
import { MarkdownWithCitations } from "./MarkdownWithCitations";
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
  interrupted?: boolean;
}

interface BitrixChatMessageProps {
  message: BitrixMessage;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onStopGeneration?: () => void;
  availableRoles?: ChatRole[];
  currentRoleId?: string;
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
  userQuestion?: string;
}

// Normalize malformed ASCII tables to valid GFM format
const normalizeMarkdownTables = (content: string): string => {
  // Pattern 1: Tables where separator is on same line as header
  // e.g., "| Cell1 | Cell2 |------|------|"
  let normalized = content.replace(
    /(\|[^\n|]+\|)(-+\|)+\s*\n/g,
    (match, header) => {
      const columns = (header.match(/\|/g) || []).length - 1;
      const separator = '|' + Array(columns).fill('---').join('|') + '|\n';
      return header + '\n' + separator;
    }
  );
  
  // Pattern 2: Missing separator line between header and content
  // Look for table rows and ensure there's a separator after first row
  normalized = normalized.replace(
    /(\|[^\n]+\|\n)(?!\|[\s:-]+\|)(\|[^\n]+\|)/g,
    (match, headerLine, contentLine) => {
      // Count columns from header
      const columns = (headerLine.match(/\|/g) || []).length - 1;
      if (columns > 0) {
        const separator = '|' + Array(columns).fill('---').join('|') + '|\n';
        return headerLine + separator + contentLine;
      }
      return match;
    }
  );
  
  return normalized;
};

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
  userQuestion,
}: BitrixChatMessageProps) {
  // Determine if we're in Bitrix context (have both URL and token)
  const isBitrixContext = Boolean(bitrixApiBaseUrl && bitrixToken);
  
  // Get the role name for the agent
  const roleName = availableRoles?.find(r => r.id === currentRoleId)?.name || 'Ассистент';

  return (
    <div
      className={cn(
        "flex gap-3 group w-full",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.role === "assistant" && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      
      {message.role === "assistant" ? (
        // Assistant message - full width, no background card
        <div className="flex-1 min-w-0">
          {/* Role name header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-foreground">
              {roleName}
            </span>
          </div>
          
          {/* Content */}
          <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Генерирую ответ...</span>
              </div>
            ) : (
              <MarkdownWithCitations 
                content={normalizeMarkdownTables(message.content)}
                citations={message.citations}
                perplexityCitations={message.webSearchCitations}
                isBitrixContext={isBitrixContext}
                bitrixApiBaseUrl={bitrixApiBaseUrl}
                bitrixToken={bitrixToken}
              />
            )}
            {message.isStreaming && message.content && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
            )}
          </div>
          
          {/* Metadata footer */}
          {!message.isStreaming && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
              {/* Interrupted indicator */}
              {message.interrupted && (
                <Badge 
                  variant="destructive" 
                  className="text-xs flex items-center gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Ответ прерван
                </Badge>
              )}
              
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
            userQuestion={userQuestion}
          />
        </div>
      ) : (
        // User message - card style, wider
        <>
          <Card className="max-w-[85%] p-4 bg-primary text-primary-foreground">
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
          </Card>
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
        </>
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
    prevProps.bitrixToken === nextProps.bitrixToken &&
    prevProps.userQuestion === nextProps.userQuestion
  );
});
