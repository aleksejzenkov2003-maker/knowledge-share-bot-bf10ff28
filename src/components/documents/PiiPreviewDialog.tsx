import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// PII type labels in Russian
const PII_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  phone: { label: "Телефон", color: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  email: { label: "Email", color: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30" },
  person: { label: "ФИО", color: "bg-pink-500/20 text-pink-700 dark:text-pink-400 border-pink-500/30" },
};

interface PiiPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  fileName: string;
}

interface PreviewResult {
  masked_text: string;
  tokens_count: number;
  pii_types_found: string[];
  highlights: Array<{
    original: string;
    token: string;
    type: string;
    start: number;
    end: number;
  }>;
}

export function PiiPreviewDialog({ open, onOpenChange, text, fileName }: PiiPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);

  useEffect(() => {
    if (open && text) {
      runPreview();
    }
  }, [open, text]);

  const runPreview = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("pii-mask", {
        body: {
          text: text.slice(0, 3000), // Limit for preview
          source_type: "document",
          source_id: "preview",
          preview_mode: true, // Don't save to DB
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      setResult(data as PreviewResult);
    } catch (err) {
      console.error("PII preview error:", err);
      setError(err instanceof Error ? err.message : "Ошибка анализа ПДн");
    } finally {
      setLoading(false);
    }
  };

  // Render text with highlighted PII tokens
  const renderHighlightedText = () => {
    if (!result) return null;

    // Find all tokens in masked text and highlight them
    const tokenRegex = /\[([A-Z_]+)_(\d+)\]/g;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match;

    const maskedText = result.masked_text;
    
    while ((match = tokenRegex.exec(maskedText)) !== null) {
      // Add text before token
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {maskedText.slice(lastIndex, match.index)}
          </span>
        );
      }

      // Add highlighted token
      const tokenType = match[1].toLowerCase();
      const typeInfo = PII_TYPE_LABELS[tokenType] || { 
        label: match[1], 
        color: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/30" 
      };

      parts.push(
        <span
          key={`token-${match.index}`}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono border ${typeInfo.color}`}
          title={`Тип: ${typeInfo.label}`}
        >
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < maskedText.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {maskedText.slice(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            Превью маскирования ПДн
          </DialogTitle>
          <DialogDescription>
            Просмотр того, какие данные будут замаскированы в документе "{fileName}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Анализ персональных данных...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">{error}</span>
            </div>
          )}

          {result && (
            <>
              {/* Summary */}
              <div className="flex flex-wrap gap-2 items-center p-3 bg-muted/50 rounded-lg">
                {result.tokens_count > 0 ? (
                  <>
                    <span className="text-sm font-medium">Найдено:</span>
                    <Badge variant="secondary" className="font-mono">
                      {result.tokens_count} ПДн
                    </Badge>
                    <span className="text-muted-foreground mx-1">•</span>
                    <span className="text-sm text-muted-foreground">Типы:</span>
                    {result.pii_types_found.map((type) => {
                      const typeInfo = PII_TYPE_LABELS[type] || { label: type, color: "" };
                      return (
                        <Badge key={type} variant="outline" className={typeInfo.color}>
                          {typeInfo.label}
                        </Badge>
                      );
                    })}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Персональные данные не обнаружены</span>
                  </div>
                )}
              </div>

              {/* Preview text with highlights */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Превью текста (первые ~3000 символов):</p>
                <ScrollArea className="h-[300px] border rounded-lg p-4 bg-background">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                    {renderHighlightedText()}
                  </div>
                </ScrollArea>
              </div>

              {/* Legend */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Выделенные токены (например [PHONE_1]) заменят оригинальные данные при обработке</p>
                <p>• Оригиналы будут зашифрованы и доступны только пользователям с правами просмотра ПДн</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          {result && result.tokens_count > 0 && (
            <Button onClick={() => onOpenChange(false)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Подтвердить и загрузить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
