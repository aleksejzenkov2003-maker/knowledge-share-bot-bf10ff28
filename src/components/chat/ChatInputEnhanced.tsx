import { useRef, useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Paperclip, ChevronDown, Bot, X, StopCircle, BookOpen, Reply } from "lucide-react";
import { Attachment } from "@/types/chat";
import { AttachmentPreview } from "./AttachmentPreview";
import { ReplyPreview } from "./ReplyPreview";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";
import { KnowledgeBaseDocument } from "@/types/knowledgeBase";
import { DepartmentChatMessage } from "@/types/departmentChat";
import { Message } from "@/types/chat";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_FILES = 5;

interface ChatRole {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface ChatInputEnhancedProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  attachments: Attachment[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  roles?: ChatRole[];
  selectedRoleId?: string | null;
  onRoleChange?: (roleId: string) => void;
  placeholder?: string;
  // Knowledge Base props
  departmentId?: string;
  conversationId?: string;
  selectedKnowledgeDocs?: KnowledgeBaseDocument[];
  onKnowledgeDocsChange?: (docs: KnowledgeBaseDocument[]) => void;
  // Reply-to props
  replyTo?: DepartmentChatMessage | Message | null;
  onClearReply?: () => void;
}

export function ChatInputEnhanced({ 
  value, 
  onChange, 
  onSend,
  onStop,
  isLoading, 
  disabled,
  attachments,
  onAttach,
  onRemoveAttachment,
  roles = [],
  selectedRoleId,
  onRoleChange,
  placeholder = "Спросите что-нибудь...",
  // Knowledge Base
  departmentId,
  conversationId,
  selectedKnowledgeDocs = [],
  onKnowledgeDocsChange,
  // Reply-to
  replyTo,
  onClearReply,
}: ChatInputEnhancedProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);

  const selectedRole = roles.find(r => r.id === selectedRoleId);

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && !disabled) {
        onSend();
      }
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
      className="w-full max-w-3xl mx-auto px-4 pb-4"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="mb-2">
          <AttachmentPreview 
            attachments={attachments} 
            onRemove={onRemoveAttachment} 
          />
        </div>
      )}

      {/* Knowledge Base Docs Preview */}
      {selectedKnowledgeDocs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedKnowledgeDocs.map((doc) => (
            <Badge 
              key={doc.id} 
              variant="secondary" 
              className="text-xs gap-1 cursor-pointer hover:bg-destructive/20"
              onClick={() => onKnowledgeDocsChange?.(selectedKnowledgeDocs.filter(d => d.id !== doc.id))}
            >
              📚 {doc.file_name.slice(0, 20)}{doc.file_name.length > 20 ? '...' : ''}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && onClearReply && (
        <ReplyPreview replyTo={replyTo} onClear={onClearReply} />
      )}

      {/* Main Input Container - ChatGPT Style */}
      <div 
        className={cn(
          "relative flex flex-col bg-muted/50 border transition-all duration-200",
          replyTo ? "rounded-b-2xl" : "rounded-2xl",
          isFocused ? "border-ring shadow-sm" : "border-border",
          disabled && "opacity-50"
        )}
      >
        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 pt-3 pb-12 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
          disabled={isLoading || disabled}
        />

        {/* Bottom Toolbar */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          {/* Left Side - Attach, Knowledge Base & Agent Selector */}
          <div className="flex items-center gap-1">
            {/* Attach Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-background/80"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || disabled || attachments.length >= MAX_FILES}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={`${ALLOWED_TYPES.join(',')},.csv,.xls,.xlsx`}
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Knowledge Base Button */}
            {onKnowledgeDocsChange && (departmentId || conversationId) && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-lg hover:bg-background/80 relative",
                  selectedKnowledgeDocs.length > 0 && "text-primary"
                )}
                onClick={() => setKbSelectorOpen(true)}
                disabled={isLoading || disabled}
              >
                <BookOpen className="h-4 w-4" />
                {selectedKnowledgeDocs.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                    {selectedKnowledgeDocs.length}
                  </span>
                )}
              </Button>
            )}

            {/* Agent Selector */}
            {roles.length > 0 && onRoleChange && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 rounded-lg hover:bg-background/80 text-muted-foreground"
                    disabled={isLoading || disabled}
                  >
                    <Bot className="h-4 w-4" />
                    <span className="text-sm max-w-[120px] truncate">
                      {selectedRole?.name || "Выберите агента"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="start" 
                  className="w-64 max-h-[300px] overflow-y-auto bg-popover"
                >
                  {roles.map((role) => (
                    <DropdownMenuItem
                      key={role.id}
                      onClick={() => onRoleChange(role.id)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 py-2",
                        role.id === selectedRoleId && "bg-accent"
                      )}
                    >
                      <span className="font-medium">{role.name}</span>
                      {role.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {role.description}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Right Side - Send/Stop Button */}
          <div className="flex items-center gap-1">
            {isLoading && onStop ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive"
                onClick={onStop}
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={onSend}
                disabled={!canSend}
              >
                {isLoading || isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground text-center mt-2">
        PDF, JPG, PNG, WEBP, CSV, XLS, XLSX (до 10MB) • Enter для отправки • Shift+Enter для новой строки
      </p>

      {/* Knowledge Base Selector Dialog */}
      <KnowledgeBaseSelector
        open={kbSelectorOpen}
        onOpenChange={setKbSelectorOpen}
        departmentId={departmentId}
        conversationId={conversationId}
        selectedDocs={selectedKnowledgeDocs}
        onSelect={(docs) => onKnowledgeDocsChange?.(docs)}
      />
    </div>
  );
}
