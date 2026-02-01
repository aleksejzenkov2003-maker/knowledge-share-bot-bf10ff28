import { Badge } from "@/components/ui/badge";
import { FileText, Database, HardDrive, AlertTriangle, Loader2 } from "lucide-react";

interface FolderStats {
  documentCount: number;
  chunkCount: number;
  totalSize: number;
  errorCount: number;
  processingCount: number;
}

interface FolderStatsDisplayProps {
  stats?: FolderStats;
  loading?: boolean;
  compact?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function FolderStatsDisplay({ stats, loading, compact }: FolderStatsDisplayProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Загрузка...</span>
      </div>
    );
  }

  if (!stats || stats.documentCount === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Нет документов
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {stats.documentCount}
        </span>
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          {stats.chunkCount.toLocaleString()}
        </span>
        {stats.errorCount > 0 && (
          <Badge variant="destructive" className="h-5 text-xs px-1.5">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {stats.errorCount}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        <FileText className="h-3 w-3" />
        {stats.documentCount} док.
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Database className="h-3 w-3" />
        {stats.chunkCount.toLocaleString()} чанков
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <HardDrive className="h-3 w-3" />
        {formatFileSize(stats.totalSize)}
      </span>
      {stats.processingCount > 0 && (
        <Badge variant="secondary" className="h-5 text-xs px-1.5">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {stats.processingCount}
        </Badge>
      )}
      {stats.errorCount > 0 && (
        <Badge variant="destructive" className="h-5 text-xs px-1.5">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {stats.errorCount}
        </Badge>
      )}
    </div>
  );
}
