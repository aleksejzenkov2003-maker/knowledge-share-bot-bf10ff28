import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw, AlertTriangle, FileText } from "lucide-react";

export type ReprocessMode = "all" | "errors" | "pending";

interface ReprocessProgress {
  current: number;
  total: number;
  currentDocName?: string;
}

interface ReprocessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  documentCount: number;
  errorCount: number;
  pendingCount: number;
  onReprocess: (mode: ReprocessMode) => void;
  isProcessing: boolean;
  progress?: ReprocessProgress;
}

export function ReprocessDialog({
  open,
  onOpenChange,
  folderName,
  documentCount,
  errorCount,
  pendingCount,
  onReprocess,
  isProcessing,
  progress,
}: ReprocessDialogProps) {
  const [mode, setMode] = useState<ReprocessMode>("all");

  const getDocCountForMode = () => {
    switch (mode) {
      case "all":
        return documentCount;
      case "errors":
        return errorCount;
      case "pending":
        return pendingCount;
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isProcessing) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Переобработать документы
          </DialogTitle>
          <DialogDescription>
            Папка: <span className="font-medium">{folderName}</span>
          </DialogDescription>
        </DialogHeader>

        {isProcessing && progress ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Обработано</span>
                <span className="font-medium">
                  {progress.current} из {progress.total}
                </span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} />
            </div>
            {progress.currentDocName && (
              <p className="text-sm text-muted-foreground truncate">
                Обработка: {progress.currentDocName}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as ReprocessMode)}>
              <div className="flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="all" id="all" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="all" className="cursor-pointer font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Все документы
                    <span className="text-muted-foreground font-normal">
                      ({documentCount})
                    </span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Пересоздать все чанки и переиндексировать
                  </p>
                </div>
              </div>

              <div 
                className={`flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 ${
                  errorCount === 0 ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <RadioGroupItem 
                  value="errors" 
                  id="errors" 
                  className="mt-0.5" 
                  disabled={errorCount === 0}
                />
                <div className="flex-1">
                  <Label htmlFor="errors" className="cursor-pointer font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Только ошибки
                    <span className={`font-normal ${errorCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      ({errorCount})
                    </span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Повторить обработку документов с ошибками
                  </p>
                </div>
              </div>

              <div 
                className={`flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 ${
                  pendingCount === 0 ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <RadioGroupItem 
                  value="pending" 
                  id="pending" 
                  className="mt-0.5"
                  disabled={pendingCount === 0}
                />
                <div className="flex-1">
                  <Label htmlFor="pending" className="cursor-pointer font-medium flex items-center gap-2">
                    <Loader2 className="h-4 w-4" />
                    Ожидающие
                    <span className="text-muted-foreground font-normal">
                      ({pendingCount})
                    </span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Обработать документы со статусом "ожидает"
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Отмена
          </Button>
          <Button
            onClick={() => onReprocess(mode)}
            disabled={isProcessing || getDocCountForMode() === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Обработка...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Запустить ({getDocCountForMode()})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
