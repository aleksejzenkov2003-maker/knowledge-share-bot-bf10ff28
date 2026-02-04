import { useState } from "react";
import { Shield, AlertTriangle, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// PII token pattern: [TYPE_N]
const PII_TOKEN_PATTERN = /\[([A-Z_]+)_(\d+)\]/g;

// Human-readable labels for PII types
const PII_TYPE_LABELS: Record<string, string> = {
  PASSPORT: "Паспорт",
  SNILS: "СНИЛС",
  INN: "ИНН",
  INN_ORG: "ИНН организации",
  CARD: "Банковская карта",
  ACCOUNT: "Банковский счёт",
  PHONE: "Телефон",
  EMAIL: "Email",
  BIRTHDATE: "Дата рождения",
  ADDRESS: "Адрес",
  PERSON: "ФИО",
};

interface PiiUnmaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  sourceId: string;
  onUnmasked: (originalText: string) => void;
}

export function PiiUnmaskDialog({
  open,
  onOpenChange,
  text,
  sourceId,
  onUnmasked,
}: PiiUnmaskDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Extract PII tokens from text
  const extractTokens = (): Array<{ token: string; type: string }> => {
    const tokens: Array<{ token: string; type: string }> = [];
    let match;
    
    PII_TOKEN_PATTERN.lastIndex = 0;
    while ((match = PII_TOKEN_PATTERN.exec(text)) !== null) {
      tokens.push({
        token: match[0],
        type: match[1],
      });
    }
    
    return tokens;
  };

  const tokens = extractTokens();
  
  // Group by type for display
  const tokensByType: Record<string, string[]> = {};
  tokens.forEach(({ token, type }) => {
    if (!tokensByType[type]) {
      tokensByType[type] = [];
    }
    tokensByType[type].push(token);
  });

  const handleUnmask = async () => {
    setIsLoading(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.access_token) {
        toast.error("Требуется авторизация");
        return;
      }

      const { data, error } = await supabase.functions.invoke("pii-unmask", {
        body: {
          text,
          source_id: sourceId,
          audit_action: "view",
        },
      });

      if (error) {
        if (error.message?.includes("PERMISSION_DENIED")) {
          toast.error("Недостаточно прав для просмотра персональных данных");
        } else {
          throw error;
        }
        return;
      }

      if (data?.original_text) {
        onUnmasked(data.original_text);
        toast.success(`Раскрыто ${data.tokens_restored} персональных данных`);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error unmasking PII:", error);
      toast.error("Ошибка при раскрытии данных");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            Раскрытие персональных данных
          </DialogTitle>
          <DialogDescription>
            Вы собираетесь просмотреть защищённые персональные данные.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm font-medium mb-2">
              Обнаружено ПДн: {tokens.length}
            </p>
            <ul className="space-y-1">
              {Object.entries(tokensByType).map(([type, typeTokens]) => (
                <li key={type} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="font-mono text-xs bg-muted px-1 rounded">
                    {typeTokens[0]}
                  </span>
                  <span>— {PII_TYPE_LABELS[type] || type}</span>
                  {typeTokens.length > 1 && (
                    <span className="text-xs">({typeTokens.length} шт.)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Это действие будет записано в журнал аудита в соответствии с
              требованиями 152-ФЗ.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Отмена
          </Button>
          <Button
            onClick={handleUnmask}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              "Загрузка..."
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Подтверждаю
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
