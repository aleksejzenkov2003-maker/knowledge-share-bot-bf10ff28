import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, RefreshCw, Check, X, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface MessageActionsProps {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateResponse?: (messageId: string) => void;
}

export function MessageActions({
  messageId,
  role,
  content,
  isStreaming,
  onEditMessage,
  onRegenerateResponse,
}: MessageActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
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

      {role === "assistant" && onRegenerateResponse && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onRegenerateResponse(messageId)}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Обновить
        </Button>
      )}
    </div>
  );
}
