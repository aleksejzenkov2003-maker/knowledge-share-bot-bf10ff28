import { X, FileText, Image, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Attachment } from "@/types/chat";

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  readonly?: boolean;
}

export function AttachmentPreview({ attachments, onRemove, readonly = false }: AttachmentPreviewProps) {
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
