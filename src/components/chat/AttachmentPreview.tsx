import { X, FileText, Image, Loader2, BookMarked, ShieldAlert, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Attachment } from "@/types/chat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onToggleKnowledgeBase?: (id: string, value: boolean) => void;
  showKnowledgeBaseOption?: boolean;
  onTogglePii?: (id: string, value: boolean) => void;
  showPiiOption?: boolean;
  onPiiPreview?: (attachment: Attachment) => void;
  readonly?: boolean;
}

export function AttachmentPreview({ 
  attachments, 
  onRemove, 
  onToggleKnowledgeBase,
  showKnowledgeBaseOption = false,
  onTogglePii,
  showPiiOption = false,
  onPiiPreview,
  readonly = false 
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (type: string) => type.startsWith('image/');

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={cn(
            "relative flex items-center gap-2 p-2 rounded-lg border bg-muted/50",
            "transition-all duration-200",
            attachment.status === 'uploading' && "animate-pulse",
            attachment.status === 'error' && "border-destructive bg-destructive/10"
          )}
        >
          {/* Preview or Icon */}
          {isImage(attachment.file_type) && attachment.preview_url ? (
            <div className="h-10 w-10 rounded overflow-hidden flex-shrink-0">
              <img
                src={attachment.preview_url}
                alt={attachment.file_name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
              {attachment.file_type === 'application/pdf' ? (
                <FileText className="h-5 w-5 text-primary" />
              ) : isImage(attachment.file_type) ? (
                <Image className="h-5 w-5 text-primary" />
              ) : (
                <FileText className="h-5 w-5 text-primary" />
              )}
            </div>
          )}

          {/* File info */}
          <div className="flex flex-col min-w-0 max-w-[120px]">
            <span className="text-xs font-medium truncate">{attachment.file_name}</span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(attachment.file_size)}
            </span>
          </div>

          {/* Knowledge Base checkbox */}
          {showKnowledgeBaseOption && !readonly && attachment.status !== 'uploading' && onToggleKnowledgeBase && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id={`kb-${attachment.id}`}
                      checked={attachment.addToKnowledgeBase ?? true}
                      onCheckedChange={(checked) => onToggleKnowledgeBase(attachment.id, !!checked)}
                      className="h-4 w-4"
                    />
                    <BookMarked className={cn(
                      "h-3.5 w-3.5",
                      attachment.addToKnowledgeBase !== false ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Добавить в базу знаний</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* PII checkbox */}
          {showPiiOption && !readonly && attachment.status !== 'uploading' && onTogglePii && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id={`pii-${attachment.id}`}
                      checked={attachment.containsPii ?? false}
                      onCheckedChange={(checked) => onTogglePii(attachment.id, !!checked)}
                      className="h-4 w-4"
                    />
                    <ShieldAlert className={cn(
                      "h-3.5 w-3.5",
                      attachment.containsPii ? "text-destructive" : "text-muted-foreground"
                    )} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Документ содержит ПДн (персональные данные)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* PII Preview button */}
          {showPiiOption && !readonly && attachment.status !== 'uploading' && attachment.containsPii && onPiiPreview && !isImage(attachment.file_type) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-primary hover:bg-primary/10"
                    onClick={() => onPiiPreview(attachment)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Превью маскирования ПДн</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Loading indicator */}
          {attachment.status === 'uploading' && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}

          {/* Remove button */}
          {!readonly && attachment.status !== 'uploading' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 absolute -top-1 -right-1 rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => onRemove(attachment.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
