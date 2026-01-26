import { useState } from "react";
import { ChevronRight, ChevronDown, FileText, Folder, MoreVertical, RefreshCw, Eye, Trash2, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface Document {
  id: string;
  name: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  status: string;
  chunk_count: number | null;
  folder_id: string | null;
  document_type: string | null;
  parent_document_id: string | null;
  part_number: number | null;
  total_parts: number | null;
  created_at: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  slug: string;
}

interface DocumentGroup {
  parentDocument: Document | null;
  documents: Document[];
  isMultiPart: boolean;
}

interface DocumentTreeProps {
  documents: Document[];
  folders: DocumentFolder[];
  onReprocess: (doc: Document) => void;
  onViewChunks: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  formatFileSize: (bytes: number | null) => string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'ready':
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Готов</Badge>;
    case 'processing':
      return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Обработка</Badge>;
    case 'error':
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Ошибка</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getDocTypeBadge = (type: string | null) => {
  if (!type || type === 'auto') return null;
  const labels: Record<string, string> = {
    legal: 'Юридический',
    contract: 'Договор',
    business: 'Бизнес',
    court: 'Судебный',
    registration_decision: 'Решение Роспатента',
    general: 'Общий',
  };
  return <Badge variant="outline" className="text-xs">{labels[type] || type}</Badge>;
};

function DocumentItem({ 
  doc, 
  isChild = false,
  onReprocess, 
  onViewChunks, 
  onDelete,
  formatFileSize,
  folders,
}: {
  doc: Document;
  isChild?: boolean;
  onReprocess: (doc: Document) => void;
  onViewChunks: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  formatFileSize: (bytes: number | null) => string;
  folders: DocumentFolder[];
}) {
  const folder = folders.find(f => f.id === doc.folder_id);
  
  return (
    <div className={cn(
      "flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-md transition-colors",
      isChild && "ml-6 border-l-2 border-muted pl-4"
    )}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">
              {doc.name}
              {doc.part_number && doc.total_parts && doc.total_parts > 1 && (
                <span className="text-muted-foreground ml-1">
                  (часть {doc.part_number}/{doc.total_parts})
                </span>
              )}
            </span>
            {getStatusBadge(doc.status)}
            {getDocTypeBadge(doc.document_type)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{doc.file_name}</span>
            {doc.file_size && <span>• {formatFileSize(doc.file_size)}</span>}
            {doc.chunk_count !== null && doc.chunk_count > 0 && (
              <span>• {doc.chunk_count} чанков</span>
            )}
            {folder && <span>• {folder.name}</span>}
          </div>
        </div>
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onReprocess(doc)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Переобработать
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onViewChunks(doc)}>
            <Eye className="h-4 w-4 mr-2" />
            Просмотреть чанки
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onDelete(doc)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DocumentGroupItem({
  group,
  onReprocess,
  onViewChunks,
  onDelete,
  formatFileSize,
  folders,
}: {
  group: DocumentGroup;
  onReprocess: (doc: Document) => void;
  onViewChunks: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  formatFileSize: (bytes: number | null) => string;
  folders: DocumentFolder[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Single document that is NOT part of a multi-part set - render as simple item
  if (!group.isMultiPart && group.documents.length === 1) {
    const doc = group.documents[0];
    // If it's a single doc with total_parts = 1 or null, render normally
    if (!doc.total_parts || doc.total_parts === 1) {
      return (
        <DocumentItem
          doc={doc}
          onReprocess={onReprocess}
          onViewChunks={onViewChunks}
          onDelete={onDelete}
          formatFileSize={formatFileSize}
          folders={folders}
        />
      );
    }
  }
  
  // Multi-part document group
  const totalChunks = group.documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
  const totalSize = group.documents.reduce((sum, d) => sum + (d.file_size || 0), 0);
  const allReady = group.documents.every(d => d.status === 'ready');
  const hasError = group.documents.some(d => d.status === 'error');
  const parentDoc = group.parentDocument || group.documents[0];
  const folder = folders.find(f => f.id === parentDoc.folder_id);
  
  // Check for incomplete upload (fewer parts than expected)
  const expectedParts = parentDoc.total_parts || group.documents.reduce((max, d) => Math.max(max, d.total_parts || 0), 0);
  const actualParts = group.documents.length;
  const isIncomplete = expectedParts > 1 && actualParts < expectedParts;
  
  // Extract base name without part info for display
  const baseName = parentDoc.name.replace(/\s*\(часть\s*\d+\/\d+.*\)$/i, '').trim();
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-md cursor-pointer transition-colors">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{baseName || parentDoc.name}</span>
                {isIncomplete ? (
                  <Badge variant="outline" className="text-orange-600 border-orange-400">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {actualParts}/{expectedParts} частей
                  </Badge>
                ) : (
                  <Badge variant="secondary">{actualParts} частей</Badge>
                )}
                {hasError ? (
                  <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Ошибка</Badge>
                ) : allReady ? (
                  <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Готов</Badge>
                ) : (
                  <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Обработка</Badge>
                )}
                {getDocTypeBadge(parentDoc.document_type)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatFileSize(totalSize)}</span>
                <span>• {totalChunks} чанков</span>
                {folder && <span>• {folder.name}</span>}
                {isIncomplete && (
                  <span className="text-orange-600">• Загрузка не завершена</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 mt-1">
          {group.documents
            .sort((a, b) => (a.part_number || 0) - (b.part_number || 0))
            .map(doc => (
              <DocumentItem
                key={doc.id}
                doc={doc}
                isChild
                onReprocess={onReprocess}
                onViewChunks={onViewChunks}
                onDelete={onDelete}
                formatFileSize={formatFileSize}
                folders={folders}
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Helper function to extract base name from document name
function extractBaseName(name: string): string {
  // "Практика ППС - 1-1483-2024 (часть 1/46, стр. 1-50)" -> "Практика ППС - 1-1483-2024"
  return name.replace(/\s*\(часть\s*\d+\/\d+.*\)$/i, '').trim();
}

export function DocumentTree({
  documents,
  folders,
  onReprocess,
  onViewChunks,
  onDelete,
  formatFileSize,
}: DocumentTreeProps) {
  // Group documents by parent_document_id
  const groups: DocumentGroup[] = [];
  const processedIds = new Set<string>();
  
  // First, find all parent documents and their children
  const parentDocs = documents.filter(d => d.parent_document_id === null && d.total_parts && d.total_parts > 1);
  const childDocsMap = new Map<string, Document[]>();
  
  for (const doc of documents) {
    if (doc.parent_document_id) {
      if (!childDocsMap.has(doc.parent_document_id)) {
        childDocsMap.set(doc.parent_document_id, []);
      }
      childDocsMap.get(doc.parent_document_id)!.push(doc);
      processedIds.add(doc.id);
    }
  }
  
  // Create groups for parent documents with their children
  for (const parent of parentDocs) {
    const children = childDocsMap.get(parent.id) || [];
    // Include parent itself as it has the original metadata
    groups.push({
      parentDocument: parent,
      documents: children.length > 0 ? children : [parent],
      isMultiPart: children.length > 0 || (parent.total_parts || 0) > 1,
    });
    processedIds.add(parent.id);
  }
  
  // Also group orphan split documents (children without visible parent)
  const orphanSplits = documents.filter(
    d => d.parent_document_id && !parentDocs.find(p => p.id === d.parent_document_id)
  );
  
  const orphanGroups = new Map<string, Document[]>();
  for (const doc of orphanSplits) {
    if (!orphanGroups.has(doc.parent_document_id!)) {
      orphanGroups.set(doc.parent_document_id!, []);
    }
    orphanGroups.get(doc.parent_document_id!)!.push(doc);
  }
  
  for (const [parentId, docs] of orphanGroups) {
    groups.push({
      parentDocument: null,
      documents: docs,
      isMultiPart: docs.length > 1,
    });
    docs.forEach(d => processedIds.add(d.id));
  }
  
  // NEW: Group remaining multi-part documents by base name (fallback for docs without parent_document_id)
  const orphanMultiPartDocs = documents.filter(
    d => !processedIds.has(d.id) && d.total_parts && d.total_parts > 1
  );
  
  const baseNameGroups = new Map<string, Document[]>();
  for (const doc of orphanMultiPartDocs) {
    const baseName = extractBaseName(doc.name);
    if (!baseNameGroups.has(baseName)) {
      baseNameGroups.set(baseName, []);
    }
    baseNameGroups.get(baseName)!.push(doc);
    processedIds.add(doc.id);
  }
  
  // Create groups from base name grouping
  for (const [baseName, docs] of baseNameGroups) {
    if (docs.length > 0) {
      // Sort by part_number
      docs.sort((a, b) => (a.part_number || 0) - (b.part_number || 0));
      groups.push({
        parentDocument: null,
        documents: docs,
        isMultiPart: true,
      });
    }
  }
  
  // Add remaining standalone documents (single documents without parts)
  for (const doc of documents) {
    if (!processedIds.has(doc.id)) {
      groups.push({
        parentDocument: null,
        documents: [doc],
        isMultiPart: false,
      });
    }
  }
  
  // Sort groups by first document's created_at descending
  groups.sort((a, b) => {
    const aDate = new Date(a.documents[0]?.created_at || 0).getTime();
    const bDate = new Date(b.documents[0]?.created_at || 0).getTime();
    return bDate - aDate;
  });
  
  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Документы не найдены
      </div>
    );
  }
  
  return (
    <div className="space-y-1">
      {groups.map((group, idx) => (
        <DocumentGroupItem
          key={group.parentDocument?.id || group.documents[0]?.id || idx}
          group={group}
          onReprocess={onReprocess}
          onViewChunks={onViewChunks}
          onDelete={onDelete}
          formatFileSize={formatFileSize}
          folders={folders}
        />
      ))}
    </div>
  );
}
