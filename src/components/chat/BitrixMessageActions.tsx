import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Pencil, 
  RefreshCw, 
  Check, 
  X, 
  Copy, 
  CheckCheck, 
  ChevronDown, 
  Bot, 
  Trash2,
  Square 
} from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DownloadDropdown } from "./DownloadDropdown";
import { Citation } from "@/types/chat";

interface ChatRole {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface BitrixMessageActionsProps {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onStopGeneration?: () => void;
  availableRoles?: ChatRole[];
  currentRoleId?: string;
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
  userQuestion?: string;
}

export function BitrixMessageActions({
  messageId,
  role,
  content,
  isStreaming,
  onEditMessage,
  onRegenerateResponse,
  onDeleteMessage,
  onStopGeneration,
  availableRoles = [],
  currentRoleId,
  ragContext,
  citations,
  webSearchCitations,
  userQuestion,
}: BitrixMessageActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const htmlContent = `<div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">${content.replace(/\n/g, '<br>')}</div>`;
      
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([content], { type: 'text/plain' }),
          }),
        ]);
      } catch {
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

  // Show stop button during streaming
  if (isStreaming && onStopGeneration) {
    return (
      <div className="flex items-center gap-1 mt-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onStopGeneration}
        >
          <Square className="h-3 w-3 mr-1 fill-current" />
          Остановить
        </Button>
      </div>
    );
  }

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

  return (
    <div
      className={cn(
        "flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity",
        role === "user" ? "justify-end" : "justify-start"
      )}
    >
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

      {/* Download dropdown for assistant messages */}
      {role === "assistant" && (
        <DownloadDropdown
          content={content}
          ragContext={ragContext}
          citations={citations}
          webSearchCitations={webSearchCitations}
          userQuestion={userQuestion}
        />
      )}

      {/* Edit button for user messages */}
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

      {/* Regenerate button for assistant messages */}
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

      {/* Delete button - available for both user and assistant messages */}
      {onDeleteMessage && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Удалить
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить сообщение?</AlertDialogTitle>
              <AlertDialogDescription>
                {role === "user" 
                  ? "Вместе с вашим сообщением будет удалён и ответ ассистента."
                  : "Это действие нельзя отменить."
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDeleteMessage(messageId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
