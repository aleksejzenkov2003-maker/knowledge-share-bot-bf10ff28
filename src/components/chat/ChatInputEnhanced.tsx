import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Paperclip, ChevronDown, Bot, X, StopCircle, BookOpen, AtSign } from "lucide-react";
import { Attachment } from "@/types/chat";
import { AttachmentPreview } from "./AttachmentPreview";
import { ReplyPreview } from "./ReplyPreview";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";
import { KnowledgeBaseDocument } from "@/types/knowledgeBase";
import { DepartmentChatMessage, AgentMention } from "@/types/departmentChat";
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
  onToggleAttachmentPii?: (id: string, value: boolean) => void;
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
  // @-mention support for department chats
  availableAgents?: AgentMention[];
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
  onToggleAttachmentPii,
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
  // Mentions
  availableAgents = [],
}: ChatInputEnhancedProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [kbSelectorOpen, setKbSelectorOpen] = useState(false);

  // Mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const selectedRole = roles.find(r => r.id === selectedRoleId);

  // Filter agents for mention dropdown
  const filteredAgents = useMemo(() => {
    if (!availableAgents.length) return [];
    if (!mentionSearch) return availableAgents;
    const search = mentionSearch.toLowerCase();
    return availableAgents.filter(a => 
      a.name.toLowerCase().includes(search) ||
      a.slug.toLowerCase().includes(search) ||
      (a.mention_trigger && a.mention_trigger.toLowerCase().includes(search))
    );
  }, [availableAgents, mentionSearch]);

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

  // Close mentions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Insert mention into text
  const insertMention = useCallback((agent: AgentMention) => {
    if (mentionStart === null) return;

    const trigger = agent.mention_trigger || `@${agent.slug}`;
    const cleanTrigger = trigger.startsWith('@') ? trigger : `@${trigger}`;
    
    const beforeMention = value.slice(0, mentionStart);
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const afterCursor = value.slice(cursorPos);
    
    const newValue = `${beforeMention}${cleanTrigger} ${afterCursor}`;
    onChange(newValue);
    setShowMentions(false);
    setMentionStart(null);
    setMentionSearch("");

    // Focus and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeMention.length + cleanTrigger.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  }, [mentionStart, value, onChange]);

  // Handle input changes and detect @mentions
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    onChange(newValue);

    // Only process mentions if agents are available
    if (availableAgents.length === 0) return;

    // Check for @ trigger
    const textBeforeCursor = newValue.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // If there's no space after @, show suggestions
      if (!textAfterAt.includes(' ')) {
        setMentionStart(atIndex);
        setMentionSearch(textAfterAt);
        setShowMentions(true);
        setMentionIndex(0);
        return;
      }
    }

    setShowMentions(false);
    setMentionStart(null);
    setMentionSearch("");
  }, [onChange, availableAgents.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention navigation
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredAgents.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex]);
        return;
      } else if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    // Default Enter behavior
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

  // Trigger @ mention on button click
  const handleAtButtonClick = useCallback(() => {
    if (!textareaRef.current) return;
    
    const cursorPos = textareaRef.current.selectionStart;
    const newValue = value.slice(0, cursorPos) + '@' + value.slice(cursorPos);
    onChange(newValue);
    
    // Trigger suggestion display
    setMentionStart(cursorPos);
    setMentionSearch("");
    setShowMentions(true);
    setMentionIndex(0);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorPos + 1, cursorPos + 1);
      }
    }, 0);
  }, [value, onChange]);

  const isUploading = attachments.some(a => a.status === 'uploading');
  const canSend = (value.trim() || attachments.length > 0) && !isLoading && !isUploading && !disabled;
  const hasMentionSupport = availableAgents.length > 0;

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
            showPiiOption={true}
            onTogglePii={onToggleAttachmentPii}
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
      <div className="relative">
        {/* Agent suggestions dropdown */}
        {showMentions && filteredAgents.length > 0 && (
          <div 
            ref={suggestionsRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
          >
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium flex items-center gap-1">
                <AtSign className="h-3 w-3" />
                Выберите агента
              </div>
              {filteredAgents.map((agent, index) => (
                <button
                  key={agent.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors",
                    index === mentionIndex 
                      ? "bg-accent text-accent-foreground" 
                      : "hover:bg-muted"
                  )}
                  onClick={() => insertMention(agent)}
                  onMouseEnter={() => setMentionIndex(index)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <span className="text-sm font-medium">
                      {agent.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {agent.mention_trigger || `@${agent.slug}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 pt-3 pb-12 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
            disabled={isLoading || disabled}
          />

          {/* Bottom Toolbar */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            {/* Left Side - Attach, Knowledge Base, @ Mention & Agent Selector */}
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

              {/* @ Mention Button - only for department chats */}
              {hasMentionSupport && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-background/80 text-muted-foreground hover:text-primary"
                  onClick={handleAtButtonClick}
                  disabled={isLoading || disabled}
                  title="Упомянуть агента (@)"
                >
                  <AtSign className="h-4 w-4" />
                </Button>
              )}

              {/* Agent Selector - for personal chats without mention support */}
              {roles.length > 0 && onRoleChange && !hasMentionSupport && (
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
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground text-center mt-2">
        {hasMentionSupport 
          ? "Начните с @ для выбора агента • PDF, JPG, PNG, WEBP, CSV, XLS, XLSX (до 10MB) • Enter для отправки"
          : "PDF, JPG, PNG, WEBP, CSV, XLS, XLSX (до 10MB) • Enter для отправки • Shift+Enter для новой строки"
        }
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
