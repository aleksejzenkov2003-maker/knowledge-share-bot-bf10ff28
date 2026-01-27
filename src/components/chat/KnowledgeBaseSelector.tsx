import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KnowledgeBaseDocument } from "@/types/knowledgeBase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Image, File, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface KnowledgeBaseSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId?: string;
  conversationId?: string;
  selectedDocs: KnowledgeBaseDocument[];
  onSelect: (docs: KnowledgeBaseDocument[]) => void;
  maxDocs?: number;
  maxSize?: number; // in bytes
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return Image;
  if (fileType === 'application/pdf') return FileText;
  return File;
};

export function KnowledgeBaseSelector({
  open,
  onOpenChange,
  departmentId,
  conversationId,
  selectedDocs,
  onSelect,
  maxDocs = 5,
  maxSize = 20 * 1024 * 1024, // 20MB
}: KnowledgeBaseSelectorProps) {
  const [documents, setDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set());

  // Initialize local selection from props
  useEffect(() => {
    if (open) {
      setLocalSelection(new Set(selectedDocs.map(d => d.id)));
    }
  }, [open, selectedDocs]);

  // Fetch documents when dialog opens
  useEffect(() => {
    if (!open) return;

    const fetchDocuments = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('chat_knowledge_base')
          .select('*')
          .order('created_at', { ascending: false });

        if (departmentId) {
          query = query.eq('department_id', departmentId);
        } else if (conversationId) {
          query = query.eq('conversation_id', conversationId);
        }

        const { data, error } = await query;

        if (error) throw error;
        setDocuments(data || []);
      } catch (err) {
        console.error('Error fetching knowledge base:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [open, departmentId, conversationId]);

  // Filter documents by search
  const filteredDocuments = documents.filter(doc =>
    doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate selected size
  const selectedSize = documents
    .filter(d => localSelection.has(d.id))
    .reduce((sum, d) => sum + d.file_size, 0);

  const toggleDocument = (doc: KnowledgeBaseDocument) => {
    const newSelection = new Set(localSelection);
    
    if (newSelection.has(doc.id)) {
      newSelection.delete(doc.id);
    } else {
      // Check limits
      if (newSelection.size >= maxDocs) {
        return; // Max docs reached
      }
      if (selectedSize + doc.file_size > maxSize) {
        return; // Max size reached
      }
      newSelection.add(doc.id);
    }
    
    setLocalSelection(newSelection);
  };

  const handleConfirm = () => {
    const selected = documents.filter(d => localSelection.has(d.id));
    onSelect(selected);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalSelection(new Set(selectedDocs.map(d => d.id)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            База знаний
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск документов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Document list */}
        <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">
                {documents.length === 0 
                  ? "База знаний пуста" 
                  : "Документы не найдены"}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredDocuments.map((doc) => {
                const isSelected = localSelection.has(doc.id);
                const FileIcon = getFileIcon(doc.file_type);
                const canSelect = isSelected || (
                  localSelection.size < maxDocs && 
                  selectedSize + doc.file_size <= maxSize
                );

                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-muted",
                      !canSelect && !isSelected && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => canSelect && toggleDocument(doc)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={!canSelect && !isSelected}
                      className="pointer-events-none"
                    />
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)} • {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true, locale: ru })}
                      </p>
                    </div>
                    {doc.usage_count > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {doc.usage_count}×
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer with selection info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
          <span>
            Выбрано: {localSelection.size} из {maxDocs} ({formatFileSize(selectedSize)})
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Отмена
          </Button>
          <Button onClick={handleConfirm}>
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
