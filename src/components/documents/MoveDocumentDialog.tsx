import { useState } from "react";
import { Folder, Loader2, FolderInput, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FolderOption {
  id: string;
  name: string;
}

interface MoveDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "move" | "copy";
  folders: FolderOption[];
  currentFolderId: string | null;
  documentName: string;
  loading?: boolean;
  onConfirm: (targetFolderId: string) => void;
}

export function MoveDocumentDialog({
  open,
  onOpenChange,
  mode,
  folders,
  currentFolderId,
  documentName,
  loading = false,
  onConfirm,
}: MoveDocumentDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const availableFolders = mode === "move"
    ? folders.filter((f) => f.id !== currentFolderId)
    : folders;

  const title = mode === "move" ? "Перенести в папку" : "Копировать в папку";
  const Icon = mode === "move" ? FolderInput : Copy;
  const actionLabel = mode === "move" ? "Перенести" : "Копировать";

  const handleConfirm = () => {
    if (selectedFolderId) {
      onConfirm(selectedFolderId);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!loading) {
      setSelectedFolderId(null);
      onOpenChange(val);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground truncate">
            Документ: <span className="font-medium text-foreground">{documentName}</span>
          </p>

          {availableFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Нет доступных папок
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2">
              {availableFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  disabled={loading}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                    selectedFolderId === folder.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/50"
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                  {folder.id === currentFolderId && (
                    <span className="text-xs opacity-60 ml-auto">(текущая)</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedFolderId || loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
