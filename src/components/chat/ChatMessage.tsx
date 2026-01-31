import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Clock, FileText, Loader2, BookOpen, Image, Globe, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Message } from "@/types/chat";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MessageActions } from "./MessageActions";
import { SourcesPanel } from "./SourcesPanel";
import { MarkdownWithCitations } from "./MarkdownWithCitations";

import { ChatRole } from "@/types/chat";

interface ChatMessageProps {
  message: Message;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onSaveAsGolden?: (messageId: string) => void;
  availableRoles?: ChatRole[];
  currentRoleId?: string;
}

function ChatMessageComponent({ message, onEditMessage, onRegenerateResponse, onSaveAsGolden, availableRoles, currentRoleId }: ChatMessageProps) {
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
                content={message.content}
                citations={message.citations}
              />
            )}
            {message.isStreaming && message.content && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
            )}
          </div>
          
          {/* Metadata footer */}
          {!message.isStreaming && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
              {message.responseTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {message.responseTime}ms
                </span>
              )}
              
              {/* Interactive Sources/Citations Panel */}
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
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              
              {message.stopReason === 'max_tokens' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="destructive" className="text-xs cursor-help">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Обрезано
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Ответ был обрезан из-за ограничения длины. Попросите продолжить.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          
          {/* Action buttons */}
          <MessageActions
            messageId={message.id}
            role={message.role}
            content={message.content}
            isStreaming={message.isStreaming}
            onEditMessage={onEditMessage}
            onRegenerateResponse={onRegenerateResponse}
            onSaveAsGolden={onSaveAsGolden}
            availableRoles={availableRoles}
            currentRoleId={currentRoleId}
            ragContext={message.ragContext}
            citations={message.citations}
            webSearchCitations={message.webSearchCitations}
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
    prev.citations?.length === next.citations?.length &&
    prev.stopReason === next.stopReason &&
    prevProps.onEditMessage === nextProps.onEditMessage &&
    prevProps.onRegenerateResponse === nextProps.onRegenerateResponse &&
    prevProps.onSaveAsGolden === nextProps.onSaveAsGolden &&
    prevProps.availableRoles?.length === nextProps.availableRoles?.length &&
    prevProps.currentRoleId === nextProps.currentRoleId
  );
});
