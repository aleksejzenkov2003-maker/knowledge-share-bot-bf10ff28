import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Paperclip } from "lucide-react";
import { Attachment } from "@/types/chat";
import { AttachmentPreview } from "./AttachmentPreview";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  disabled?: boolean;
  attachments: Attachment[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export function ChatInput({ 
  value, 
  onChange, 
  onSend, 
  isLoading, 
  disabled,
  attachments,
  onAttach,
  onRemoveAttachment,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const validateFiles = useCallback((files: File[]): File[] => {
    const validFiles: File[] = [];
    const currentCount = attachments.length;

    for (const file of files) {
      if (currentCount + validFiles.length >= MAX_FILES) {
        toast.error(`Максимум ${MAX_FILES} файлов`);
        break;
      }

      // Check file extension for CSV/XLS which may have different MIME types
      const ext = file.name.toLowerCase().split('.').pop();
      const isAllowedByType = ALLOWED_TYPES.includes(file.type);
      const isAllowedByExt = ['csv', 'xls', 'xlsx'].includes(ext || '');
      
      if (!isAllowedByType && !isAllowedByExt) {
        toast.error(`Неподдерживаемый формат: ${file.name}. Разрешены: PDF, JPG, PNG, WEBP, CSV, XLS, XLSX`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Файл слишком большой: ${file.name}. Максимум 10MB`);
        continue;
      }

      validFiles.push(file);
    }

    return validFiles;
  }, [attachments.length]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      onAttach(validFiles);
    }
    // Reset input
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      onAttach(validFiles);
    }
  }, [validateFiles, onAttach]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const isUploading = attachments.some(a => a.status === 'uploading');
  const canSend = (value.trim() || attachments.length > 0) && !isLoading && !isUploading && !disabled;

  return (
    <div 
      className="p-4 border-t"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Attachment Preview */}
        <AttachmentPreview 
          attachments={attachments} 
          onRemove={onRemoveAttachment} 
        />

        {/* Input Area */}
        <div className="flex gap-2">
          {/* Attach Button */}
          <Button
            variant="outline"
            size="icon"
            className="h-auto flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || disabled || attachments.length >= MAX_FILES}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение... (Enter для отправки, Shift+Enter для новой строки)"
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={isLoading || disabled}
          />
          <Button
            onClick={onSend}
            disabled={!canSend}
            className="h-auto"
          >
            {isLoading || isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground text-center">
          Поддерживаемые форматы: PDF, JPG, PNG, WEBP, CSV, XLS, XLSX (до 10MB)
        </p>
      </div>
    </div>
  );
}
