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

// Insert logical line breaks into continuous text (no \n in source)
function insertLineBreaks(text: string): string {
  if (!text) return '';
  
  let result = text;
  
  // 1. Numbered points like "27. Text" or "28. Text" → break before number
  result = result.replace(
    /(\.\s*)(\d{1,3})\.\s+([А-ЯЁA-Z])/g,
    '$1\n\n$2. $3'
  );
  
  // 2. Sub-points "1)" or "а)" after punctuation → break
  result = result.replace(
    /([.;:])\s+(\d+\)|[а-яё]\))\s+/gi,
    '$1\n$2 '
  );
  
  // 3. "Статья X.", "Глава X", "Раздел X" → new block
  result = result.replace(
    /(\.|\s)\s*(Статья\s+\d+|Глава\s+[IVXLCDM\d]+|Раздел\s+[IVXLCDM\d]+)/gi,
    '$1\n\n$2'
  );
  
  // 4. Editorial notes "(Пункт в редакции..." → break after
  result = result.replace(
    /(\([^)]*редакции[^)]*\)\.?)\s*/gi,
    '$1\n\n'
  );
  
  // 5. Semicolons followed by lowercase letters often indicate list items
  result = result.replace(
    /;\s+([а-яё])/g,
    ';\n$1'
  );
  
  return result;
}

// Format chunk content for better readability
function formatChunkContent(text: string): string {
  if (!text) return '';
  
  // 1. First insert logical line breaks
  let formatted = insertLineBreaks(text);
  
  // 2. Escape HTML tags for security
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // 3. Process double line breaks as paragraphs
  formatted = formatted.replace(/\n\s*\n/g, '</p><p class="mb-4">');
  
  // 4. Single line breaks → <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  // 5. Highlight numbered points (27., 28., etc.) at start of paragraphs
  formatted = formatted.replace(
    /(?:^|<br>|<p[^>]*>)(\d{1,3})\.\s/g,
    (match, num) => match.replace(`${num}. `, `<span class="font-semibold text-primary">${num}.</span> `)
  );
  
  // 6. Highlight sub-points (1), а), etc.)
  formatted = formatted.replace(
    /(\d+\)|[а-яё]\))\s/gi,
    '<span class="text-muted-foreground font-medium">$1</span> '
  );
  
  // 7. Highlight articles and paragraphs
  formatted = formatted.replace(
    /(Статья\s+\d+(?:\.\d+)?\.?|§\s*\d+\.?|Глава\s+[IVXLCDM\d]+\.?|Раздел\s+[IVXLCDM\d]+\.?)/gi,
    '<span class="font-semibold text-primary">$1</span>'
  );
  
  // 8. Highlight section headers (lines in ALL CAPS, min 10 chars)
  formatted = formatted.replace(
    /<br>([A-ZА-ЯЁ][A-ZА-ЯЁ\s\d.,\-():]{9,})<br>/g,
    '<br><strong class="block mt-4 mb-2 text-base">$1</strong><br>'
  );
  
  // Wrap in paragraph
  return `<p class="mb-4">${formatted}</p>`;
}

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
    if (!chunkContent) return '';
    
    // First format the content
    let formatted = formatChunkContent(chunkContent);
    
    // Then highlight search text (if any)
    if (highlightText) {
      const escaped = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const regex = new RegExp(`(${escaped})`, 'gi');
        formatted = formatted.replace(
          regex, 
          '<mark class="bg-yellow-300/60 dark:bg-yellow-500/40 px-0.5 rounded">$1</mark>'
        );
      } catch {
        // Regex failed, keep formatted content
      }
    }
    
    return formatted;
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
              className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:my-3 leading-relaxed text-foreground"
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
