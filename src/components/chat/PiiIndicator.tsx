import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// PII token pattern: [TYPE_N]
const PII_TOKEN_PATTERN = /\[([A-Z_]+)_(\d+)\]/g;

// Human-readable labels for PII types
const PII_TYPE_LABELS: Record<string, string> = {
  PASSPORT: "Паспорт",
  SNILS: "СНИЛС",
  INN: "ИНН",
  INN_ORG: "ИНН орг.",
  CARD: "Карта",
  ACCOUNT: "Счёт",
  PHONE: "Телефон",
  EMAIL: "Email",
  BIRTHDATE: "Дата рождения",
  ADDRESS: "Адрес",
  PERSON: "ФИО",
};

interface PiiIndicatorProps {
  text: string;
  onUnmaskRequest?: () => void;
  canUnmask?: boolean;
  className?: string;
}

export function PiiIndicator({ 
  text, 
  onUnmaskRequest, 
  canUnmask = false,
  className = "" 
}: PiiIndicatorProps) {
  // Count PII tokens by type
  const piiCounts: Record<string, number> = {};
  let match;
  
  while ((match = PII_TOKEN_PATTERN.exec(text)) !== null) {
    const type = match[1];
    piiCounts[type] = (piiCounts[type] || 0) + 1;
  }
  
  // Reset regex state
  PII_TOKEN_PATTERN.lastIndex = 0;
  
  const totalCount = Object.values(piiCounts).reduce((sum, count) => sum + count, 0);
  
  if (totalCount === 0) {
    return null;
  }

  const typesList = Object.entries(piiCounts)
    .map(([type, count]) => `${PII_TYPE_LABELS[type] || type}: ${count}`)
    .join(", ");

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="secondary" 
              className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 cursor-help"
            >
              <Shield className="h-3 w-3" />
              <span>Скрыто {totalCount} ПДн</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">Персональные данные замаскированы:</p>
            <p className="text-xs text-muted-foreground">{typesList}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {canUnmask && onUnmaskRequest && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onUnmaskRequest}
          className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
        >
          Показать
        </Button>
      )}
    </div>
  );
}

// Utility function to check if text contains PII tokens
export function hasPiiTokens(text: string): boolean {
  PII_TOKEN_PATTERN.lastIndex = 0;
  return PII_TOKEN_PATTERN.test(text);
}

// Utility function to count PII tokens
export function countPiiTokens(text: string): number {
  PII_TOKEN_PATTERN.lastIndex = 0;
  let count = 0;
  while (PII_TOKEN_PATTERN.exec(text) !== null) {
    count++;
  }
  PII_TOKEN_PATTERN.lastIndex = 0;
  return count;
}
