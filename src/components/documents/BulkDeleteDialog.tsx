import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  totalSize: string;
  onConfirm: () => void;
  isDeleting: boolean;
  requireConfirmation?: boolean;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  documentCount,
  chunkCount,
  totalSize,
  onConfirm,
  isDeleting,
  requireConfirmation = false,
}: BulkDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  
  const needsConfirmation = requireConfirmation || documentCount > 50;
  const canConfirm = !needsConfirmation || confirmText === "УДАЛИТЬ";

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmText("");
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Документов:</span>
            <span className="font-medium">{documentCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Чанков для индексации:</span>
            <span className="font-medium">{chunkCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Размер файлов:</span>
            <span className="font-medium">{totalSize}</span>
          </div>
        </div>

        {needsConfirmation && (
          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-sm text-muted-foreground">
              Для подтверждения введите <span className="font-mono font-bold">УДАЛИТЬ</span>
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="УДАЛИТЬ"
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting || !canConfirm}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Удаление...
              </>
            ) : (
              "Удалить"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
