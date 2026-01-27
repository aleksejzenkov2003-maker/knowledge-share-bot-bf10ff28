import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, BookOpen, Globe, Eye, Loader2 } from "lucide-react";
import { Citation } from "@/types/chat";
import { supabase } from "@/integrations/supabase/client";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { toast } from "@/hooks/use-toast";

interface SourcesPanelProps {
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
  webSearchUsed?: boolean;
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

export function SourcesPanel({ 
  ragContext, 
  citations, 
  webSearchCitations,
  webSearchUsed,
  isBitrixContext,
  bitrixApiBaseUrl,
  bitrixToken,
}: SourcesPanelProps) {
  const [loadingSource, setLoadingSource] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<DocumentViewerState>({
    isOpen: false,
  });
  const [preSignedUrl, setPreSignedUrl] = useState<string | undefined>(undefined);

  const hasRagSources = ragContext && ragContext.length > 0;
  const hasCitations = citations && citations.length > 0;
  const hasWebSources = webSearchCitations && webSearchCitations.length > 0;

  // Determine default tab
  const defaultTab = hasRagSources ? "sources" : hasCitations ? "citations" : "web";

  // Parse domain from URL
  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  // Extract page number from document info
  // For document parts (e.g., "часть 2/46, стр. 51-100"), the internal PDF numbering starts from 1
  const extractPageNumber = (docInfo: string): number => {
    // Check if this is a document part
    const partMatch = docInfo.match(/часть\s*(\d+)/i);
    const pageRangeMatch = docInfo.match(/стр\.?\s*(\d+)(?:\s*-\s*(\d+))?/i);
    
    if (pageRangeMatch) {
      const pageStart = parseInt(pageRangeMatch[1], 10);
      
      // If this is a part with page range starting > 1, it means the PDF is split
      // Each part has internal numbering starting from 1
      if (partMatch && pageStart > 1) {
        return 1; // Start from page 1 of this part
      }
      
      // For non-split documents or first part, use the actual page number
      return pageStart;
    }
    
    // If only part is specified without page range, start from page 1
    if (partMatch) {
      return 1;
    }
    
    return 1;
  };

  // Clean and truncate search text for better matching
  const cleanSearchText = (text?: string): string | undefined => {
    if (!text) return undefined;
    
    return text
      .slice(0, 80) // First 80 characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  };

  // Search documents via API (for Bitrix context)
  const searchDocumentsViaApi = async (searchName: string) => {
    if (!bitrixApiBaseUrl || !bitrixToken) return null;
    
    try {
      const response = await fetch(
        `${bitrixApiBaseUrl}/documents/search?name=${encodeURIComponent(searchName)}`,
        {
          headers: { 'Authorization': `Bearer ${bitrixToken}` },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to search documents');
      }
      
      const { documents } = await response.json();
      return documents;
    } catch (error) {
      console.error('API document search error:', error);
      return null;
    }
  };

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
      
      if (!response.ok) {
        throw new Error('Failed to get signed URL');
      }
      
      const { signed_url } = await response.json();
      return signed_url;
    } catch (error) {
      console.error('API signed URL error:', error);
      return null;
    }
  };

  // Open document with highlight
  const openDocumentWithHighlight = async (
    documentInfo: string, 
    contentPreview?: string,
    citationData?: Citation
  ) => {
    const sourceId = documentInfo + (contentPreview || '');
    setLoadingSource(sourceId);
    setPreSignedUrl(undefined);

    try {
      // Try to use citation data first if available
      if (citationData?.document_id && citationData?.storage_path) {
        // For Bitrix context, pre-fetch signed URL
        if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
          const signedUrl = await getSignedUrlViaApi(citationData.storage_path);
          if (signedUrl) {
            setPreSignedUrl(signedUrl);
          }
        }
        
        setViewerState({
          isOpen: true,
          documentId: citationData.document_id,
          storagePath: citationData.storage_path,
          documentName: citationData.document,
          searchText: cleanSearchText(citationData.content_preview || contentPreview),
          pageNumber: citationData.page_start || extractPageNumber(documentInfo),
        });
        setLoadingSource(null);
        return;
      }

      // Clean document name - remove leading index like "[1]" if present
      let searchName = documentInfo.replace(/^\[\d+\]\s*/, '').trim();
      
      let docs: Array<{ id: string; storage_path: string; name: string; file_name: string }> | null = null;
      
      // Use API for Bitrix context, direct Supabase for admin
      if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
        // Try exact match first via API
        docs = await searchDocumentsViaApi(searchName);
        
        // If not found, try without the part/page suffix
        if (!docs?.length) {
          const baseName = searchName.replace(/\s*\(часть.*$/, '').replace(/\s*\(стр\..*$/, '').trim();
          console.log('Trying base name search via API:', baseName);
          docs = await searchDocumentsViaApi(baseName);
        }
      } else {
        // Standard Supabase flow for admin
        const { data } = await supabase
          .from('documents')
          .select('id, storage_path, name, file_name')
          .eq('name', searchName)
          .limit(1);
        docs = data;
        
        // If not found, try without the part/page suffix
        if (!docs?.length) {
          const baseName = searchName.replace(/\s*\(часть.*$/, '').replace(/\s*\(стр\..*$/, '').trim();
          console.log('Trying base name search:', baseName);
          
          // Note: Values with special characters must be quoted for PostgREST
          const { data: partialData } = await supabase
            .from('documents')
            .select('id, storage_path, name, file_name')
            .or(`name.ilike."%${baseName}%",file_name.ilike."%${baseName}%"`)
            .limit(5);
          docs = partialData;
        }
      }
      
      // If multiple results, prefer one that matches the part number
      if (docs && docs.length > 1) {
        const partMatch = searchName.match(/часть\s*(\d+)/i);
        if (partMatch) {
          const partNum = partMatch[1];
          const exactPart = docs.find(d => 
            d.name?.includes(`часть ${partNum}`) || d.name?.includes(`часть${partNum}`)
          );
          if (exactPart) {
            docs = [exactPart];
          }
        }
      }
      
      if (docs && docs.length > 0 && docs[0].storage_path) {
        console.log('Found document:', docs[0].name);
        
        // For Bitrix context, pre-fetch signed URL
        if (isBitrixContext && bitrixApiBaseUrl && bitrixToken) {
          const signedUrl = await getSignedUrlViaApi(docs[0].storage_path);
          if (signedUrl) {
            setPreSignedUrl(signedUrl);
          }
        }
        
        setViewerState({
          isOpen: true,
          documentId: docs[0].id,
          storagePath: docs[0].storage_path,
          documentName: docs[0].name || docs[0].file_name,
          searchText: cleanSearchText(contentPreview),
          pageNumber: extractPageNumber(documentInfo),
        });
      } else {
        console.log('Document not found in storage:', searchName);
        toast({
          title: "Документ не найден",
          description: "Не удалось найти документ в хранилище",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error opening document:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось открыть документ",
        variant: "destructive",
      });
    } finally {
      setLoadingSource(null);
    }
  };

  // Open citation in document viewer
  const openCitation = async (citation: Citation) => {
    await openDocumentWithHighlight(
      citation.document,
      citation.content_preview,
      citation
    );
  };

  const closeViewer = () => {
    setViewerState({ isOpen: false });
  };

  return (
    <>
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sources" disabled={!hasRagSources}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Источники
            {hasRagSources && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-5 px-1.5">
                {ragContext.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="citations" disabled={!hasCitations}>
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Цитаты
            {hasCitations && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-5 px-1.5">
                {citations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="web" disabled={!hasWebSources}>
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            Веб
            {hasWebSources && (
              <Badge variant="secondary" className="ml-1.5 text-xs h-5 px-1.5">
                {webSearchCitations.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="mt-4">
          <ScrollArea className="h-[60vh]">
            <div className="space-y-4 pr-4">
              {ragContext?.map((source, idx) => {
                // Parse the source string to extract metadata
                const lines = source.split('\n');
                const headerLine = lines[0] || '';
                const content = lines.slice(1).join('\n').trim();
                
                // Extract document name and metadata from header like "[1] DocName | Section | Article (relevance: 8.5)"
                const headerMatch = headerLine.match(/^\[(\d+)\]\s*(.+?)(?:\s*\(релевантность:\s*[\d.]+\))?$/);
                const docNum = headerMatch?.[1] || String(idx + 1);
                const docInfo = headerMatch?.[2] || headerLine;
                const sourceId = source + idx;
                const isLoading = loadingSource === sourceId;
                
                return (
                  <div 
                    key={idx}
                    className="p-3 rounded-lg bg-muted/50 border border-border/50 cursor-pointer hover:bg-accent/50 hover:border-accent transition-colors group"
                    onClick={() => !isLoading && openDocumentWithHighlight(docInfo, content)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className="shrink-0 font-mono">
                          [{docNum}]
                        </Badge>
                        <span className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                          {docInfo}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDocumentWithHighlight(docInfo, content);
                        }}
                        title="Открыть документ"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-4">
                      {content}
                    </p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="citations" className="mt-4">
          <ScrollArea className="h-[60vh]">
            <div className="space-y-3 pr-4">
              {citations?.map((citation) => {
                const isLoading = loadingSource === citation.document + citation.index;
                
                return (
                  <div 
                    key={citation.index}
                    className="p-3 rounded-lg bg-muted/50 border border-border/50 cursor-pointer hover:bg-accent/50 hover:border-accent transition-colors group"
                    onClick={() => !isLoading && openCitation(citation)}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="shrink-0 font-mono">
                        [{citation.index}]
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {citation.document}
                      </span>
                      {isLoading && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {citation.section && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {citation.section}
                        </span>
                      )}
                      {citation.article && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          Ст. {citation.article}
                        </span>
                      )}
                      <span className="ml-auto">
                        Релевантность: {(citation.relevance * 10).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="web" className="mt-4">
          <ScrollArea className="h-[60vh]">
            <div className="space-y-2 pr-4">
              {webSearchUsed && (
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  Результаты веб-поиска через Perplexity
                </p>
              )}
              {webSearchCitations?.map((url, idx) => (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50 hover:bg-accent/50 hover:border-accent transition-colors group"
                >
                  <Badge variant="outline" className="shrink-0 font-mono text-xs">
                    [{idx + 1}]
                  </Badge>
                  <span className="text-sm text-foreground truncate flex-1">
                    {getDomain(url)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <DocumentViewer
        isOpen={viewerState.isOpen}
        onClose={closeViewer}
        documentId={viewerState.documentId}
        storagePath={viewerState.storagePath}
        documentName={viewerState.documentName}
        searchText={viewerState.searchText}
        pageNumber={viewerState.pageNumber}
        isBitrixContext={isBitrixContext}
        bitrixApiBaseUrl={bitrixApiBaseUrl}
        bitrixToken={bitrixToken}
        preSignedUrl={preSignedUrl}
      />
    </>
  );
}
