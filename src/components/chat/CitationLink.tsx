import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { Citation } from '@/types/chat';
import { supabase } from '@/integrations/supabase/client';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { TextContentViewer } from '@/components/documents/TextContentViewer';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface CitationLinkProps {
  index: number;
  citation?: Citation;
  // Bitrix context props
  isBitrixContext?: boolean;
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
}

interface TextViewerState {
  isOpen: boolean;
  documentName: string;
  chunkContent: string;
  highlightText?: string;
  chunkIndex?: number;
}

interface DocumentViewerState {
  isOpen: boolean;
  documentId?: string;
  storagePath?: string;
  documentName?: string;
  searchText?: string;
  pageNumber?: number;
}

export function CitationLink({ 
  index, 
  citation,
  isBitrixContext,
  bitrixApiBaseUrl,
  bitrixToken,
}: CitationLinkProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [textViewerState, setTextViewerState] = useState<TextViewerState>({ 
    isOpen: false, 
    documentName: '', 
    chunkContent: '' 
  });
  const [pdfViewerState, setPdfViewerState] = useState<DocumentViewerState>({ isOpen: false });
  const [preSignedUrl, setPreSignedUrl] = useState<string | undefined>(undefined);

  // Get signed URL via API (for Bitrix context)
  const getSignedUrlViaApi = async (storagePath: string): Promise<string | null> => {
    if (!bitrixApiBaseUrl || !bitrixToken) return null;
    
    try {
      const response = await fetch(`${bitrixApiBaseUrl}/documents/signed-url`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${bitrixToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storage_path: storagePath }),
      });
      
      if (!response.ok) throw new Error('Failed to get signed URL');
      const { signed_url } = await response.json();
      return signed_url;
    } catch (error) {
      console.error('API signed URL error:', error);
      return null;
    }
  };

  // Open PDF viewer (called from Text Viewer or directly for files without text content)
  const openPdfViewer = async () => {
    if (!citation?.storage_path) {
      toast({
        title: "Документ не найден",
        description: "Нет пути к документу для открытия PDF",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setPreSignedUrl(undefined);

    try {
      // Pre-fetch signed URL for Bitrix context
      if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
        const signedUrl = await getSignedUrlViaApi(citation.storage_path);
        if (signedUrl) {
          setPreSignedUrl(signedUrl);
        }
      }

      // Close text viewer if open
      setTextViewerState(prev => ({ ...prev, isOpen: false }));

      setPdfViewerState({
        isOpen: true,
        documentId: citation.document_id,
        storagePath: citation.storage_path,
        documentName: citation.document,
        searchText: citation.search_keywords?.length 
          ? citation.search_keywords.join(' ')
          : citation.content_preview?.slice(0, 150),
        pageNumber: citation.page_start || 1,
      });
    } catch (error) {
      console.error('Error opening PDF:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось открыть PDF документ",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!citation) {
      toast({
        title: "Источник не найден",
        description: `Цитата [${index}] не имеет связанного документа`,
        variant: "destructive",
      });
      return;
    }

    // Priority 1: Text Viewer (if full chunk content is available)
    if (citation.full_chunk_content) {
      setTextViewerState({
        isOpen: true,
        documentName: citation.document,
        chunkContent: citation.full_chunk_content,
        highlightText: citation.content_preview,
        chunkIndex: citation.index,
      });
      return;
    }

    // Priority 2: Check for Excel files - offer download
    if (citation.storage_path) {
      const fileExt = citation.storage_path.split('.').pop()?.toLowerCase();
      if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
        setIsLoading(true);
        
        let downloadUrl: string | null = null;
        if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
          downloadUrl = await getSignedUrlViaApi(citation.storage_path);
        } else {
          const { data: signedData } = await supabase.storage
            .from('rag-documents')
            .createSignedUrl(citation.storage_path, 3600);
          downloadUrl = signedData?.signedUrl || null;
        }
        
        setIsLoading(false);
        
        if (downloadUrl) {
          toast({
            title: "Табличный документ",
            description: `Файл нельзя просмотреть в браузере.`,
            action: (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(downloadUrl!, '_blank')}
              >
                Скачать
              </Button>
            ),
          });
        }
        return;
      }
    }

    // Priority 3: Open PDF Viewer directly (fallback when no text content)
    if (citation.document_id && citation.storage_path) {
      await openPdfViewer();
      return;
    }

    // Priority 4: Try to find document by name (fallback)
    setIsLoading(true);
    try {
      const { data: docs } = await supabase
        .from('documents')
        .select('id, storage_path, name')
        .ilike('name', `%${citation.document}%`)
        .limit(1);
      
      if (docs && docs.length > 0 && docs[0].storage_path) {
        if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
          const signedUrl = await getSignedUrlViaApi(docs[0].storage_path);
          if (signedUrl) setPreSignedUrl(signedUrl);
        }
        
        setPdfViewerState({
          isOpen: true,
          documentId: docs[0].id,
          storagePath: docs[0].storage_path,
          documentName: docs[0].name,
          searchText: citation.search_keywords?.join(' ') || citation.content_preview?.slice(0, 150),
          pageNumber: citation.page_start || 1,
        });
      } else {
        toast({
          title: "Документ не найден",
          description: `Не удалось найти "${citation.document}" в хранилище`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error opening citation:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось открыть документ",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Badge
        variant="outline"
        className="inline-flex items-center h-5 px-1.5 mx-0.5 text-xs font-mono cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
        onClick={handleClick}
        title={citation ? `${citation.document}${citation.section ? ` | ${citation.section}` : ''}` : `Источник ${index}`}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          `[${index}]`
        )}
      </Badge>

      {/* Text Content Viewer (primary for chunks with text) */}
      <TextContentViewer
        isOpen={textViewerState.isOpen}
        onClose={() => setTextViewerState(prev => ({ ...prev, isOpen: false }))}
        documentName={textViewerState.documentName}
        chunkContent={textViewerState.chunkContent}
        highlightText={textViewerState.highlightText}
        chunkIndex={textViewerState.chunkIndex}
        onOpenPdf={citation?.storage_path ? openPdfViewer : undefined}
      />

      {/* PDF Document Viewer (secondary/fallback) */}
      {pdfViewerState.isOpen && pdfViewerState.storagePath && (
        <DocumentViewer
          isOpen={pdfViewerState.isOpen}
          onClose={() => setPdfViewerState({ isOpen: false })}
          documentId={pdfViewerState.documentId}
          storagePath={pdfViewerState.storagePath}
          documentName={pdfViewerState.documentName}
          searchText={pdfViewerState.searchText}
          pageNumber={pdfViewerState.pageNumber}
          preSignedUrl={preSignedUrl}
        />
      )}
    </>
  );
}
