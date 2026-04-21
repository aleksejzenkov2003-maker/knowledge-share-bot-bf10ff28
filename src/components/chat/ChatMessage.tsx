import React from "react";
import { useState, useCallback } from "react";
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
import { PiiIndicator } from "./PiiIndicator";
import { PiiUnmaskDialog } from "./PiiUnmaskDialog";
import { ReputationCarousel } from "./ReputationCarousel";
import { ReputationCompanyCard } from "./ReputationCompanyCard";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { ChatRole } from "@/types/chat";
import { RoleProviderInfo } from "@/hooks/useRoleProviderLabels";

interface ChatMessageProps {
  message: Message;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onSaveAsGolden?: (messageId: string) => void;
  onSelectReputationCompany?: (result: import("@/types/chat").ReputationSearchResult) => void;
  availableRoles?: ChatRole[];
  currentRoleId?: string;
  roleProviderLabels?: Map<string, RoleProviderInfo>;
  userQuestion?: string;
}

function ChatMessageComponent({ message, onEditMessage, onRegenerateResponse, onRetryMessage, onSaveAsGolden, onSelectReputationCompany, availableRoles, currentRoleId, roleProviderLabels, userQuestion }: ChatMessageProps) {
  // Get the role name for the agent
  const roleName = availableRoles?.find(r => r.id === currentRoleId)?.name || 'Ассистент';
  const providerInfo = currentRoleId ? roleProviderLabels?.get(currentRoleId) : undefined;
  const { role } = useAuth();
  const [showUnmaskDialog, setShowUnmaskDialog] = useState(false);
  const [unmaskedContent, setUnmaskedContent] = useState<string | null>(null);

  const canUnmask = role === 'admin' || role === 'moderator';

  const handleUnmaskRequest = () => {
    setShowUnmaskDialog(true);
  };

  const handleUnmasked = useCallback((originalText: string) => {
    setUnmaskedContent(originalText);
  }, []);

  return (
    <div
      className={cn(
        "flex gap-3 group w-full",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {/* No avatar icons - clean minimalist style */}
      
      {message.role === "assistant" ? (
        // Assistant message - full width, no background card
        <div className="flex-1 min-w-0">
          {/* Role name header */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {roleName}
            </span>
            {(role === 'admin' || role === 'moderator') && (
              <>
                {message.actualModel ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted">
                    {message.actualModel}
                  </Badge>
                ) : providerInfo && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted">
                    {providerInfo.providerName}
                    {providerInfo.model && (
                      <span className="ml-1 opacity-70">{providerInfo.model}</span>
                    )}
                  </Badge>
                )}
                {message.fallbackUsed && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    fallback
                  </Badge>
                )}
              </>
            )}
          </div>
          
          {/* Content */}
          <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert text-[15px] leading-relaxed">
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Генерирую ответ...</span>
              </div>
            ) : (
              <MarkdownWithCitations 
                content={message.content}
                citations={message.citations}
                perplexityCitations={message.webSearchCitations}
              />
            )}
            {message.isStreaming && message.content && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
            )}
          </div>

          {/* Reputation company card (structured data) */}
          {message.reputationCompanyData && (
            <ReputationCompanyCard data={message.reputationCompanyData} />
          )}

          {/* Reputation company selection carousel */}
          {message.reputationResults && message.reputationResults.length > 0 && onSelectReputationCompany && (
            <ReputationCarousel
              results={message.reputationResults}
              onSelect={onSelectReputationCompany}
            />
          )}
          
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
              
              {/* PII Indicator */}
              {message.hasMaskedPii && (
                <PiiIndicator 
                  text={unmaskedContent || message.content}
                  canUnmask={canUnmask && !unmaskedContent}
                  onUnmaskRequest={handleUnmaskRequest}
                />
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
            onRetryMessage={onRetryMessage}
            onSaveAsGolden={onSaveAsGolden}
            availableRoles={availableRoles}
            currentRoleId={currentRoleId}
            ragContext={message.ragContext}
            citations={message.citations}
            webSearchCitations={message.webSearchCitations}
            userQuestion={userQuestion}
          />
          
          {/* PII Unmask Dialog */}
          <PiiUnmaskDialog
            open={showUnmaskDialog}
            onOpenChange={setShowUnmaskDialog}
            text={message.content}
            sourceId={message.id}
            onUnmasked={handleUnmasked}
          />
        </div>
      ) : (
        // User message - card style, wider
        <>
          <div className="max-w-[85%] px-4 py-3 bg-muted/70 text-foreground rounded-2xl rounded-tr-sm">
            <div className="space-y-2">
              {/* Display attachments for user messages */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {message.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md bg-background/50 text-xs text-muted-foreground"
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
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
            </div>
            {/* User message actions: edit + retry */}
            {!message.isStreaming && (
              <MessageActions
                messageId={message.id}
                role={message.role}
                content={message.content}
                isStreaming={message.isStreaming}
                onEditMessage={onEditMessage}
                onRetryMessage={onRetryMessage}
              />
            )}
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
  
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.responseTime === next.responseTime &&
    prev.ragContext?.length === next.ragContext?.length &&
    prev.citations?.length === next.citations?.length &&
    prev.stopReason === next.stopReason &&
    prev.hasMaskedPii === next.hasMaskedPii &&
    prev.piiTokensCount === next.piiTokensCount &&
    prev.reputationResults?.length === next.reputationResults?.length &&
    prev.reputationCompanyData === next.reputationCompanyData &&
    prev.fallbackUsed === next.fallbackUsed &&
    prev.actualModel === next.actualModel &&
    prevProps.onEditMessage === nextProps.onEditMessage &&
    prevProps.onRegenerateResponse === nextProps.onRegenerateResponse &&
    prevProps.onRetryMessage === nextProps.onRetryMessage &&
    prevProps.onSaveAsGolden === nextProps.onSaveAsGolden &&
    prevProps.onSelectReputationCompany === nextProps.onSelectReputationCompany &&
    prevProps.availableRoles?.length === nextProps.availableRoles?.length &&
    prevProps.currentRoleId === nextProps.currentRoleId &&
    prevProps.userQuestion === nextProps.userQuestion
  );
});
