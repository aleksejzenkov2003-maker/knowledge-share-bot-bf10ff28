import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, RefreshCw, Check, X, Copy, CheckCheck, ChevronDown, Bot, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChatRole, Citation } from "@/types/chat";
import { DownloadDropdown } from "./DownloadDropdown";

interface MessageActionsProps {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onSaveAsGolden?: (messageId: string) => void;
  availableRoles?: ChatRole[];
  currentRoleId?: string;
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
}

export function MessageActions({
  messageId,
  role,
  content,
  isStreaming,
  onEditMessage,
  onRegenerateResponse,
  onRetryMessage,
  onSaveAsGolden,
  availableRoles = [],
  currentRoleId,
  ragContext,
  citations,
  webSearchCitations,
  userQuestion,
}: MessageActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      // Try to copy as rich text (HTML + plain text)
      const htmlContent = `<div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">${content.replace(/\n/g, '<br>')}</div>`;
      
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([content], { type: 'text/plain' }),
          }),
        ]);
      } catch {
        // Fallback to plain text
        await navigator.clipboard.writeText(content);
      }
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось скопировать текст",
        variant: "destructive",
      });
    }
  };

  // handleDownload removed - now using DownloadDropdown component
  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== content) {
      onEditMessage?.(messageId, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const handleRegenerate = (roleId?: string) => {
    onRegenerateResponse?.(messageId, roleId);
  };

  if (isStreaming) return null;

  if (isEditing && role === "user") {
    return (
      <div className="mt-2 space-y-2">
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="min-h-[80px] bg-background/50 text-foreground"
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSaveEdit} className="h-7">
            <Check className="h-3 w-3 mr-1" />
            Сохранить
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancelEdit} className="h-7">
            <X className="h-3 w-3 mr-1" />
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  const currentRole = availableRoles.find(r => r.id === currentRoleId);

  return (
    <div
      className={cn(
        "flex items-center gap-1 mt-2 transition-opacity",
        role === "assistant" && content.length > 500
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100",
        role === "user" ? "justify-end" : "justify-start"
      )}
    >
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

      {role === "assistant" && (
        <DownloadDropdown
          content={content}
          ragContext={ragContext}
          citations={citations}
          webSearchCitations={webSearchCitations}
        />
      )}

      {role === "assistant" && onSaveAsGolden && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onSaveAsGolden(messageId)}
        >
          <Star className="h-3 w-3 mr-1" />
          Эталон
        </Button>
      )}

      {role === "user" && onEditMessage && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleEdit}
        >
          <Pencil className="h-3 w-3 mr-1" />
          Изменить
        </Button>
      )}

      {role === "user" && onRetryMessage && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onRetryMessage(messageId)}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Повторить
        </Button>
      )}

      {role === "assistant" && onRegenerateResponse && (
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
          
          {availableRoles.length > 1 && (
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
                {availableRoles.map((agentRole) => (
                  <DropdownMenuItem
                    key={agentRole.id}
                    onClick={() => handleRegenerate(agentRole.id)}
                    className={cn(
                      "cursor-pointer",
                      agentRole.id === currentRoleId && "bg-accent"
                    )}
                  >
                    <Bot className="h-3 w-3 mr-2" />
                    <div className="flex flex-col">
                      <span className="text-sm">{agentRole.name}</span>
                      {agentRole.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {agentRole.description}
                        </span>
                      )}
                    </div>
                    {agentRole.id === currentRoleId && (
                      <Check className="h-3 w-3 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
