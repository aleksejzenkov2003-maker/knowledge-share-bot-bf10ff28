import React, { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
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
  Download,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId?: string;
  storagePath?: string;
  documentName?: string;
  searchText?: string;
  pageNumber?: number;
  // Bitrix context props
  isBitrixContext?: boolean;
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
  preSignedUrl?: string;
}

interface TextMatch {
  pageIndex: number;
  matchIndex: number;
}

export function DocumentViewer({
  isOpen,
  onClose,
  documentId,
  storagePath,
  documentName,
  searchText,
  pageNumber = 1,
  isBitrixContext,
  bitrixApiBaseUrl,
  bitrixToken,
  preSignedUrl,
}: DocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [scale, setScale] = useState(1.0);
  const [searchQuery, setSearchQuery] = useState(searchText || "");
  const [searchResults, setSearchResults] = useState<TextMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedText, setHighlightedText] = useState<string | null>(searchText || null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen && (documentId || storagePath)) {
      loadDocument();
    }
    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [isOpen, documentId, storagePath]);

  useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  // Fallback: reset to page 1 if requested page exceeds total pages
  useEffect(() => {
    if (numPages > 0 && currentPage > numPages) {
      console.log(`Page ${currentPage} exceeds numPages ${numPages}, resetting to 1`);
      setCurrentPage(1);
    }
  }, [numPages, currentPage]);

  useEffect(() => {
    if (searchText) {
      setSearchQuery(searchText);
      setHighlightedText(searchText);
    }
  }, [searchText]);

  // Auto-search when document loads and searchText is provided
  useEffect(() => {
    if (numPages > 0 && highlightedText && pdfDocRef.current) {
      performSearch(highlightedText);
    }
  }, [numPages, highlightedText]);

  const loadDocument = async () => {
    setLoading(true);
    setError(null);
    setNumPages(0);
    setSearchResults([]);

    try {
      // If pre-signed URL is provided, use it directly
      if (preSignedUrl) {
        setDocumentUrl(preSignedUrl);
        setLoading(false);
        return;
      }

      let path = storagePath;

      // Get storage path if not provided (admin context only)
      if (!path && documentId && !isBitrixContext) {
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .select('storage_path, name')
          .eq('id', documentId)
          .maybeSingle();

        if (docError) throw docError;
        if (!doc) {
          throw new Error('Документ не найден в базе данных');
        }
        path = doc?.storage_path;
      }

      if (!path) {
        throw new Error('Путь к документу не указан в базе данных');
      }

      // Get signed URL via API for Bitrix context
      if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
        const response = await fetch(`${bitrixApiBaseUrl}/documents/signed-url`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${bitrixToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storage_path: path }),
        });
        
        if (!response.ok) {
          throw new Error('Не удалось получить доступ к документу');
        }
        
        const { signed_url } = await response.json();
        if (signed_url) {
          setDocumentUrl(signed_url);
        } else {
          throw new Error('Не удалось получить ссылку на документ');
        }
      } else {
        // Standard Supabase flow for admin context
        // First check if file exists
        const { data: fileList, error: listError } = await supabase.storage
          .from('rag-documents')
          .list('', { 
            search: path.split('/').pop() || path,
            limit: 1
          });

        if (listError) {
          console.error('Storage list error:', listError);
        }

        // Create signed URL
        const { data: signedUrl, error: urlError } = await supabase.storage
          .from('rag-documents')
          .createSignedUrl(path, 3600);

        if (urlError) {
          console.error('Signed URL error:', urlError);
          // Check if it's a "not found" error
          if (urlError.message?.includes('not found') || urlError.message?.includes('Object not found')) {
            throw new Error(`Файл не найден в хранилище: ${path}`);
          }
          throw urlError;
        }

        if (signedUrl?.signedUrl) {
          setDocumentUrl(signedUrl.signedUrl);
        } else {
          throw new Error('Не удалось получить ссылку на документ');
        }
      }
    } catch (err) {
      console.error('Error loading document:', err);
      const errorMessage = err instanceof Error ? err.message : 'Ошибка загрузки документа';
      setError(errorMessage);
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setError('Ошибка загрузки PDF');
    setLoading(false);
  };

  const performSearch = async (query: string) => {
    if (!pdfDocRef.current || !query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const matches: TextMatch[] = [];
    const searchLower = query.toLowerCase();

    try {
      // First attempt: full phrase search
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocRef.current.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ').toLowerCase();
        
        let startIndex = 0;
        let matchIndex = 0;
        while ((startIndex = pageText.indexOf(searchLower, startIndex)) !== -1) {
          matches.push({ pageIndex: pageNum, matchIndex });
          matchIndex++;
          startIndex += searchLower.length;
        }
      }

      // Fallback: if no matches and query is long, try keyword search
      if (matches.length === 0 && query.length > 20) {
        const keywords = query
          .split(/\s+/)
          .filter(word => word.length > 4)
          .slice(0, 3);
        
        if (keywords.length > 0) {
          console.log('Trying keyword search with:', keywords);
          
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDocRef.current.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ').toLowerCase();
            
            // Count how many keywords match on this page
            const matchingKeywords = keywords.filter(kw => 
              pageText.includes(kw.toLowerCase())
            );
            
            // If at least 2 keywords match (or 1 if only 1 keyword), consider it a match
            if (matchingKeywords.length >= Math.min(2, keywords.length)) {
              matches.push({ pageIndex: pageNum, matchIndex: 0 });
            }
          }
          
          // Update highlighted text to first keyword for visual highlighting
          if (matches.length > 0 && keywords[0]) {
            setHighlightedText(keywords[0]);
          }
        }
      }

      setSearchResults(matches);
      setCurrentMatchIndex(0);

      if (matches.length > 0) {
        setCurrentPage(matches[0].pageIndex);
        toast({
          title: "Поиск завершён",
          description: `Найдено совпадений: ${matches.length}`,
        });
      } else {
        toast({
          title: "Поиск завершён",
          description: "Совпадений не найдено",
        });
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    setHighlightedText(searchQuery);
    performSearch(searchQuery);
  };

  const goToNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIndex);
    setCurrentPage(searchResults[nextIndex].pageIndex);
  };

  const goToPrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIndex = currentMatchIndex === 0 ? searchResults.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
    setCurrentPage(searchResults[prevIndex].pageIndex);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, numPages));
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

  const clearSearch = () => {
    setSearchQuery("");
    setHighlightedText(null);
    setSearchResults([]);
    setCurrentMatchIndex(0);
  };

  // Highlight text in the text layer after page renders
  useEffect(() => {
    if (!highlightedText || !containerRef.current) return;

    // Longer delay to ensure text layer is fully rendered
    const timeoutId = setTimeout(() => {
      const textLayer = containerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      const spans = textLayer.querySelectorAll('span');
      
      // Split search text into keywords for more reliable matching
      const searchWords = highlightedText
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3); // Words longer than 3 characters
      
      if (searchWords.length === 0) return;

      let highlightCount = 0;

      spans.forEach((span) => {
        const text = span.textContent || '';
        const textLower = text.toLowerCase();
        
        // Check if span contains any of the keywords
        const matchingWord = searchWords.find(word => textLower.includes(word));
        
        if (matchingWord) {
          // Add highlight class to the entire span instead of modifying innerHTML
          // This preserves PDF.js positioning
          (span as HTMLElement).classList.add('pdf-span-highlight');
          highlightCount++;
        }
      });

      console.log(`Highlighted ${highlightCount} spans with keywords from: "${highlightedText.slice(0, 50)}..."`);

      // Scroll to first match
      const firstHighlight = textLayer.querySelector('.pdf-span-highlight');
      if (firstHighlight) {
        firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 800); // Increased delay for reliability

    return () => clearTimeout(timeoutId);
  }, [highlightedText, currentPage, numPages]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[1400px] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate flex-1 text-sm md:text-base">
              {documentName || 'Документ'}
            </DialogTitle>
            
            <div className="flex items-center gap-1 md:gap-2 flex-wrap">
              {/* Search */}
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="h-8 w-32 md:w-40 text-sm"
                />
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSearch}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Search navigation */}
              {searchResults.length > 0 && (
                <div className="flex items-center gap-1 border-l pl-2 ml-1">
                  <Button variant="ghost" size="sm" onClick={goToPrevMatch}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Badge variant="secondary" className="text-xs whitespace-nowrap">
                    {currentMatchIndex + 1}/{searchResults.length}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={goToNextMatch}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              {/* Zoom controls */}
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button variant="ghost" size="sm" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Badge variant="secondary" className="text-xs">
                  {Math.round(scale * 100)}%
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Page navigation */}
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  {currentPage}/{numPages || '?'}
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= numPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button variant="ghost" size="sm" onClick={handleOpenExternal} title="Открыть в новой вкладке">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDownload} title="Скачать">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {highlightedText && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                Поиск: "{highlightedText.slice(0, 50)}{highlightedText.length > 50 ? '...' : ''}"
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={clearSearch}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden relative" ref={containerRef}>
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
          
          {documentUrl && (
            <ScrollArea className="h-full w-full">
              <div className="flex justify-center p-4 min-h-full">
                <Document
                  file={documentUrl}
                  onLoadSuccess={(pdf) => {
                    pdfDocRef.current = pdf;
                    onDocumentLoadSuccess(pdf);
                  }}
                  onLoadError={onDocumentLoadError}
                  loading={
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  }
                  className="pdf-document"
                >
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    loading={
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    }
                    className="shadow-lg"
                  />
                </Document>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
