import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight,
  Search,
  X,
  ExternalLink,
  Download
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId?: string;
  storagePath?: string;
  documentName?: string;
  searchText?: string;
  pageNumber?: number;
}

export function DocumentViewer({
  isOpen,
  onClose,
  documentId,
  storagePath,
  documentName,
  searchText,
  pageNumber = 1,
}: DocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [zoom, setZoom] = useState(100);
  const [searchQuery, setSearchQuery] = useState(searchText || "");
  const [highlightedText, setHighlightedText] = useState<string | null>(searchText || null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isOpen && (documentId || storagePath)) {
      loadDocument();
    }
  }, [isOpen, documentId, storagePath]);

  useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  useEffect(() => {
    setSearchQuery(searchText || "");
    setHighlightedText(searchText || null);
  }, [searchText]);

  const loadDocument = async () => {
    setLoading(true);
    setError(null);

    try {
      let path = storagePath;

      // If we have documentId but no path, fetch the document info
      if (!path && documentId) {
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .select('storage_path, name')
          .eq('id', documentId)
          .single();

        if (docError) throw docError;
        path = doc?.storage_path;
      }

      if (!path) {
        throw new Error('Путь к документу не найден');
      }

      // Get signed URL
      const { data: signedUrl, error: urlError } = await supabase.storage
        .from('rag-documents')
        .createSignedUrl(path, 3600); // 1 hour expiry

      if (urlError) throw urlError;

      if (signedUrl?.signedUrl) {
        setDocumentUrl(signedUrl.signedUrl);
      } else {
        throw new Error('Не удалось получить ссылку на документ');
      }
    } catch (err) {
      console.error('Error loading document:', err);
      setError(err instanceof Error ? err.message : 'Ошибка загрузки документа');
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить документ",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => prev + 1);
  };

  const handleSearch = () => {
    setHighlightedText(searchQuery);
    // For PDF.js viewer, we could use the find function
    // For now, we'll just set the highlight text
  };

  const handleOpenExternal = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  const handleDownload = async () => {
    if (documentUrl) {
      try {
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = documentName || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        toast({
          title: "Ошибка",
          description: "Не удалось скачать документ",
          variant: "destructive",
        });
      }
    }
  };

  // Build PDF viewer URL with page and search parameters
  const getPdfViewerUrl = () => {
    if (!documentUrl) return null;
    
    // Use browser's built-in PDF viewer with page parameter
    let url = documentUrl;
    const params = [];
    
    if (currentPage > 1) {
      params.push(`page=${currentPage}`);
    }
    
    if (highlightedText) {
      params.push(`search=${encodeURIComponent(highlightedText)}`);
    }
    
    if (params.length > 0) {
      url += '#' + params.join('&');
    }
    
    return url;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-[1200px] h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate flex-1">
              {documentName || 'Документ'}
            </DialogTitle>
            
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="h-8 w-40"
                />
                <Button variant="ghost" size="sm" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Zoom controls */}
              <div className="flex items-center gap-1 border-l pl-2 ml-2">
                <Button variant="ghost" size="sm" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Badge variant="secondary" className="text-xs">
                  {zoom}%
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Page navigation */}
              <div className="flex items-center gap-1 border-l pl-2 ml-2">
                <Button variant="ghost" size="sm" onClick={handlePrevPage}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Badge variant="outline" className="text-xs">
                  Стр. {currentPage}
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleNextPage}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1 border-l pl-2 ml-2">
                <Button variant="ghost" size="sm" onClick={handleOpenExternal}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {highlightedText && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                Поиск: "{highlightedText}"
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => {
                  setHighlightedText(null);
                  setSearchQuery("");
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Загрузка документа...</span>
              </div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center">
                <p className="text-destructive mb-2">{error}</p>
                <Button variant="outline" onClick={loadDocument}>
                  Повторить
                </Button>
              </div>
            </div>
          )}
          
          {documentUrl && !loading && !error && (
            <iframe
              ref={iframeRef}
              src={getPdfViewerUrl() || undefined}
              className="w-full h-full border-0"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
              title={documentName || 'Document viewer'}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
