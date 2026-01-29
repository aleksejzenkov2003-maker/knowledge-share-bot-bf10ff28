import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { Citation } from '@/types/chat';
import { supabase } from '@/integrations/supabase/client';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
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
  const [viewerState, setViewerState] = useState<DocumentViewerState>({ isOpen: false });
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

    setIsLoading(true);
    setPreSignedUrl(undefined);

    try {
      // Check if we have direct citation data
      if (citation.document_id && citation.storage_path) {
        // Check if this is an Excel file
        const fileExt = citation.storage_path.split('.').pop()?.toLowerCase();
        if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
          setIsLoading(false);
          
          let downloadUrl: string | null = null;
          if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
            downloadUrl = await getSignedUrlViaApi(citation.storage_path);
          } else {
            const { data: signedData } = await supabase.storage
              .from('rag-documents')
              .createSignedUrl(citation.storage_path, 3600);
            downloadUrl = signedData?.signedUrl || null;
          }
          
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
        
        // For Bitrix context, pre-fetch signed URL
        if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
          const signedUrl = await getSignedUrlViaApi(citation.storage_path);
          if (signedUrl) {
            setPreSignedUrl(signedUrl);
          }
        }
        
        setViewerState({
          isOpen: true,
          documentId: citation.document_id,
          storagePath: citation.storage_path,
          documentName: citation.document,
          searchText: citation.search_keywords?.length 
            ? citation.search_keywords.join(' ')
            : citation.content_preview?.slice(0, 150),
          pageNumber: citation.page_start || 1,
        });
      } else {
        // Fallback: search by document name
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
          
          setViewerState({
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

      {viewerState.isOpen && viewerState.storagePath && (
        <DocumentViewer
          isOpen={viewerState.isOpen}
          onClose={() => setViewerState({ isOpen: false })}
          documentId={viewerState.documentId}
          storagePath={viewerState.storagePath}
          documentName={viewerState.documentName}
          searchText={viewerState.searchText}
          pageNumber={viewerState.pageNumber}
          preSignedUrl={preSignedUrl}
        />
      )}
    </>
  );
}
