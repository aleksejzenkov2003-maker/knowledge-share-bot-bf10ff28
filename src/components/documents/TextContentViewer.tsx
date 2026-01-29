import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ExternalLink, Copy, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TextContentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  chunkContent: string;
  highlightText?: string; // Phrase to highlight
  chunkIndex?: number; // Index/part number
  onOpenPdf?: () => void; // Transition to PDF viewer
}

export function TextContentViewer({
  isOpen,
  onClose,
  documentName,
  chunkContent,
  highlightText,
  chunkIndex,
  onOpenPdf,
}: TextContentViewerProps) {
  const [copied, setCopied] = React.useState(false);

  // Highlight the text in chunkContent
  const highlightedContent = useMemo(() => {
    if (!highlightText || !chunkContent) return chunkContent || '';
    
    // Escape special regex characters
    const escaped = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Try to match, case-insensitive
    try {
      const regex = new RegExp(`(${escaped})`, 'gi');
      return chunkContent.replace(
        regex, 
        '<mark class="bg-yellow-300/60 dark:bg-yellow-500/40 px-0.5 rounded">$1</mark>'
      );
    } catch {
      // If regex fails, return original
      return chunkContent;
    }
  }, [chunkContent, highlightText]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chunkContent);
      setCopied(true);
      toast({
        title: 'Скопировано',
        description: 'Текст фрагмента скопирован в буфер обмена',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать текст',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            <span className="truncate">{documentName}</span>
            {chunkIndex && (
              <span className="text-xs text-muted-foreground font-normal">
                (фрагмент {chunkIndex})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-4">
            <div
              className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:my-3 whitespace-pre-wrap leading-relaxed text-foreground"
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            />
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t shrink-0 bg-muted/30">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Копировать
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPdf && (
              <Button variant="outline" size="sm" onClick={onOpenPdf} className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                Открыть PDF
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
