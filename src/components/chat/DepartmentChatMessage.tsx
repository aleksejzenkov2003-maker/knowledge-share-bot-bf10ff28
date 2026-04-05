import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DepartmentChatMessage as MessageType } from '@/types/departmentChat';
import { Bot, User, FileText, Image, Clock, BookOpen, Globe, AlertTriangle, Copy, CheckCheck, RefreshCw, ChevronDown, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SourcesPanel } from './SourcesPanel';
import { DownloadDropdown } from './DownloadDropdown';
import { MarkdownWithCitations } from './MarkdownWithCitations';
import { ReputationCarousel } from './ReputationCarousel';
import { ReputationCompanyCard } from './ReputationCompanyCard';
import { ReputationSearchResult } from '@/types/chat';

import { RoleProviderInfo } from '@/hooks/useRoleProviderLabels';

interface AgentInfo {
  id: string;
  name: string;
  mention_trigger?: string | null;
  slug: string;
  description?: string;
}

interface DepartmentChatMessageProps {
  message: MessageType;
  currentUserId?: string;
  availableAgents?: AgentInfo[];
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onReply?: (message: MessageType) => void;
  replyToMessage?: MessageType | null;
  onSelectReputationCompany?: (result: ReputationSearchResult) => void;
  roleProviderLabels?: Map<string, RoleProviderInfo>;
  userQuestion?: string;
}

function DepartmentChatMessageComponent({
  message,
  currentUserId,
  availableAgents = [],
  onRegenerateResponse,
  onRetryMessage,
  onReply,
  replyToMessage,
  onSelectReputationCompany,
  roleProviderLabels,
  userQuestion,
}: DepartmentChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const { role: userRole } = useAuth();
  
  const isAssistant = message.message_role === 'assistant';
  const isOwnMessage = message.user_id === currentUserId;
  const userName = message.metadata?.user_name || 'Пользователь';
  const agentName = message.metadata?.agent_name || 'Ассистент';
  const isGenerating = isAssistant && !message.content;

  const handleCopy = async () => {
    const showSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const fallbackCopy = () => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = message.content;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) {
          showSuccess();
          return true;
        }
      } catch (e) {
        console.error('execCommand copy failed:', e);
      }
      return false;
    };

    try {
      const htmlContent = `<div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">${message.content.replace(/\n/g, '<br>')}</div>`;
      
      // Try modern Clipboard API with HTML + plain text
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([message.content], { type: 'text/plain' }),
          }),
        ]);
        showSuccess();
        return;
      } catch (clipboardWriteError) {
        console.log('ClipboardItem not supported, trying writeText:', clipboardWriteError);
      }

      // Fallback: plain text via writeText
      try {
        await navigator.clipboard.writeText(message.content);
        showSuccess();
        return;
      } catch (writeTextError) {
        console.log('writeText failed, trying execCommand:', writeTextError);
      }

      // Last resort: execCommand
      if (fallbackCopy()) return;

      throw new Error('All copy methods failed');
    } catch (err) {
      console.error('Copy failed:', err);
      toast({
        title: "Ошибка",
        description: "Не удалось скопировать. Выделите текст и скопируйте вручную (Ctrl+C).",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = (roleId?: string) => {
    onRegenerateResponse?.(message.id, roleId);
  };

  return (
    <div className={cn(
      "group flex gap-3 py-4",
      isAssistant ? "" : "justify-end"
    )}>
      {/* No avatar icons - clean minimalist style */}

      {/* Content */}
      {isAssistant ? (
        // Assistant message - full width, no background
        <div className="flex-1 min-w-0">
          {/* Reply indicator */}
          {replyToMessage && (
            <div className="mb-2 p-2 bg-muted/30 rounded border-l-2 border-primary/50 text-xs">
              <div className="flex items-center gap-1 mb-0.5">
                <Reply className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">
                  {replyToMessage.message_role === 'assistant' ? '🤖 ' : ''}
                  {replyToMessage.metadata?.user_name || replyToMessage.metadata?.agent_name || 'Сообщение'}
                </span>
              </div>
              <p className="text-muted-foreground truncate">{replyToMessage.content.slice(0, 80)}{replyToMessage.content.length > 80 ? '...' : ''}</p>
            </div>
          )}

          {/* Agent name header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-foreground">
              {agentName}
            </span>
            {message.role_id && (userRole === 'admin' || userRole === 'moderator') && roleProviderLabels?.get(message.role_id) && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted">
                {roleProviderLabels.get(message.role_id)!.providerName}
                {roleProviderLabels.get(message.role_id)!.model && (
                  <span className="ml-1 opacity-70">{roleProviderLabels.get(message.role_id)!.model}</span>
                )}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {new Date(message.created_at).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>

          {/* Message content */}
          <div className="prose prose-sm dark:prose-invert max-w-none break-words text-[15px] leading-relaxed">
            <MarkdownWithCitations
              content={message.content || '...'}
              citations={message.metadata?.citations}
              perplexityCitations={message.metadata?.perplexity_citations || message.metadata?.web_search_citations}
            />
          </div>

          {/* Reputation company card (structured data) */}
          {message.metadata?.reputation_company_data && (
            <ReputationCompanyCard data={message.metadata.reputation_company_data} />
          )}

          {/* Reputation company selection carousel */}
          {message.metadata?.reputation_results && message.metadata.reputation_results.length > 0 && onSelectReputationCompany && (
            <ReputationCarousel
              results={message.metadata.reputation_results}
              onSelect={onSelectReputationCompany}
            />
          )}

          {/* Attachments */}
          {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.metadata.attachments.map((att, idx) => {
                const isImage = att.file_type.startsWith('image/');
                const handleClick = async (e: React.MouseEvent) => {
                  e.preventDefault();
                  const { data, error } = await supabase.storage.from('chat-attachments').createSignedUrl(att.file_path, 3600);
                  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                };
                
                return (
                  <a
                    key={idx}
                    href="#"
                    onClick={handleClick}
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
          {message.content && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
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

          {/* Actions: Reply, Copy, Download, Regenerate */}
          {!isGenerating && message.content && (
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Reply button */}
              {onReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onReply(message)}
                >
                  <Reply className="h-3 w-3 mr-1" />
                  Ответить
                </Button>
              )}

              {/* Copy button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCheck className="h-3 w-3 mr-1 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {copied ? "Скопировано" : "Копировать"}
              </Button>

              {/* Download */}
              <DownloadDropdown
                content={message.content}
                ragContext={message.metadata?.rag_context}
                citations={message.metadata?.citations}
                webSearchCitations={message.metadata?.perplexity_citations || message.metadata?.web_search_citations}
                userQuestion={userQuestion}
              />

              {/* Regenerate */}
              {onRegenerateResponse && (
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleRegenerate()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Обновить
                  </Button>
                  
                  {availableAgents.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1.5 text-xs"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56 bg-popover z-50">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          Обновить с другим агентом
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {availableAgents.map((agent) => (
                          <DropdownMenuItem
                            key={agent.id}
                            onClick={() => handleRegenerate(agent.id)}
                            className={cn(
                              "cursor-pointer",
                              agent.id === message.role_id && "bg-accent"
                            )}
                          >
                            <Bot className="h-3 w-3 mr-2" />
                            <div className="flex flex-col">
                              <span className="text-sm">{agent.name}</span>
                              {agent.description && (
                                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {agent.description}
                                </span>
                              )}
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // User message - compact card style
        <>
          <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-tr-sm bg-muted/70 text-foreground">
            {/* Reply indicator */}
            {replyToMessage && (
              <div className="mb-2 p-2 bg-background/50 rounded border-l-2 border-muted-foreground/30 text-xs">
                <div className="flex items-center gap-1 mb-0.5">
                  <Reply className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">
                    {replyToMessage.message_role === 'assistant' ? '🤖 ' : ''}
                    {replyToMessage.metadata?.user_name || replyToMessage.metadata?.agent_name || 'Сообщение'}
                  </span>
                </div>
                <p className="truncate text-muted-foreground">{replyToMessage.content.slice(0, 60)}{replyToMessage.content.length > 60 ? '...' : ''}</p>
              </div>
            )}
            
            {/* Header with name and time */}
            <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
              <span className="font-medium">{userName}</span>
              <span>
                {new Date(message.created_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
            
            {/* Attachments */}
            {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.metadata.attachments.map((att, idx) => {
                  const isImage = att.file_type.startsWith('image/');
                  const handleClick = async (e: React.MouseEvent) => {
                    e.preventDefault();
                    const { data, error } = await supabase.storage.from('chat-attachments').createSignedUrl(att.file_path, 3600);
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                  };
                  
                  return (
                    <a
                      key={idx}
                      href="#"
                      onClick={handleClick}
                      className="flex items-center gap-2 px-2 py-1 rounded-md bg-background/50 hover:bg-background/80 transition-colors text-xs text-muted-foreground"
                    >
                      {isImage ? (
                        <Image className="h-3 w-3" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      <span className="truncate max-w-[100px]">{att.file_name}</span>
                    </a>
                  );
                })}
              </div>
            )}
            
            {/* Reply + Retry actions for user messages */}
            {!isGenerating && (
              <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {onReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onReply(message)}
                  >
                    <Reply className="h-3 w-3 mr-1" />
                    Ответить
                  </Button>
                )}
                {onRetryMessage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onRetryMessage(message.id)}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Повторить
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
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
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.availableAgents?.length === nextProps.availableAgents?.length &&
    prevProps.onRegenerateResponse === nextProps.onRegenerateResponse &&
    prevProps.onRetryMessage === nextProps.onRetryMessage &&
    prevProps.onReply === nextProps.onReply &&
    prevProps.replyToMessage?.id === nextProps.replyToMessage?.id &&
    prevProps.onSelectReputationCompany === nextProps.onSelectReputationCompany &&
    prev.metadata?.reputation_results?.length === next.metadata?.reputation_results?.length &&
    prev.metadata?.reputation_company_data === next.metadata?.reputation_company_data &&
    prevProps.userQuestion === nextProps.userQuestion
  );
});
