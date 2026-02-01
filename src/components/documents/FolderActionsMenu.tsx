import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, FolderOpen, RefreshCw, AlertTriangle, Trash2, Pencil } from "lucide-react";

interface FolderStats {
  documentCount: number;
  chunkCount: number;
  totalSize: number;
  errorCount: number;
  processingCount: number;
}

interface FolderActionsMenuProps {
  folderId: string;
  folderName: string;
  stats?: FolderStats;
  onOpenDocuments?: () => void;
  onEdit?: () => void;
  onClearFolder: () => void;
  onReprocessAll: () => void;
  onReprocessErrors: () => void;
  onDeleteFolder?: () => void;
}

export function FolderActionsMenu({
  folderId,
  folderName,
  stats,
  onOpenDocuments,
  onEdit,
  onClearFolder,
  onReprocessAll,
  onReprocessErrors,
  onDeleteFolder,
}: FolderActionsMenuProps) {
  const hasDocuments = stats && stats.documentCount > 0;
  const hasErrors = stats && stats.errorCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onOpenDocuments && (
          <DropdownMenuItem onClick={onOpenDocuments}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Открыть документы
          </DropdownMenuItem>
        )}
        
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Редактировать
          </DropdownMenuItem>
        )}

        {(onOpenDocuments || onEdit) && hasDocuments && <DropdownMenuSeparator />}

        {hasDocuments && (
          <>
            <DropdownMenuItem onClick={onReprocessAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Переобработать все
              <span className="ml-auto text-xs text-muted-foreground">
                {stats.documentCount}
              </span>
            </DropdownMenuItem>

            {hasErrors && (
              <DropdownMenuItem onClick={onReprocessErrors}>
                <AlertTriangle className="mr-2 h-4 w-4 text-destructive" />
                Переобработать ошибки
                <span className="ml-auto text-xs text-destructive">
                  {stats.errorCount}
                </span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem 
              onClick={onClearFolder}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Очистить папку
            </DropdownMenuItem>
          </>
        )}

        {onDeleteFolder && (
          <DropdownMenuItem 
            onClick={onDeleteFolder}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Удалить папку
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
