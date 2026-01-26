import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, BookOpen, Globe, Eye, Loader2 } from "lucide-react";
import { Citation } from "@/types/chat";
import { supabase } from "@/integrations/supabase/client";
import { DocumentViewer } from "@/components/documents/DocumentViewer";

interface SourcesPanelProps {
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
  webSearchUsed?: boolean;
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
  webSearchUsed 
}: SourcesPanelProps) {
  const [loadingSource, setLoadingSource] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<DocumentViewerState>({
    isOpen: false,
  });

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

  // Extract page number from document info (e.g., "стр. 1-10" or "часть 2/5")
  const extractPageNumber = (docInfo: string): number => {
    const pageMatch = docInfo.match(/стр\.?\s*(\d+)/i);
    if (pageMatch) return parseInt(pageMatch[1], 10);
    
    const partMatch = docInfo.match(/часть\s*(\d+)/i);
    if (partMatch) return parseInt(partMatch[1], 10) * 10 - 9; // Approximate page
    
    return 1;
  };

  // Open document with highlight
  const openDocumentWithHighlight = async (
    documentInfo: string, 
    contentPreview?: string,
    citationData?: Citation
  ) => {
    const sourceId = documentInfo + (contentPreview || '');
    setLoadingSource(sourceId);

    try {
      // Try to use citation data first if available
      if (citationData?.document_id && citationData?.storage_path) {
        setViewerState({
          isOpen: true,
          documentId: citationData.document_id,
          storagePath: citationData.storage_path,
          documentName: citationData.document,
          searchText: citationData.content_preview || contentPreview?.slice(0, 100),
          pageNumber: citationData.page_start || extractPageNumber(documentInfo),
        });
        setLoadingSource(null);
        return;
      }

      // Extract document name from header like "[1] DocName | Section | Article"
      const docMatch = documentInfo.match(/^\[?\d+\]?\s*(.+?)(?:\s*\||\s*\(|$)/);
      const docName = docMatch?.[1]?.trim();
      
      if (!docName) {
        console.log('Could not extract document name from:', documentInfo);
        setLoadingSource(null);
        return;
      }
      
      // Query for document in database
      const { data: docs } = await supabase
        .from('documents')
        .select('id, storage_path, name, file_name')
        .or(`name.ilike.%${docName}%,file_name.ilike.%${docName}%`)
        .limit(1);
      
      if (docs && docs.length > 0 && docs[0].storage_path) {
        setViewerState({
          isOpen: true,
          documentId: docs[0].id,
          storagePath: docs[0].storage_path,
          documentName: docs[0].name || docs[0].file_name,
          searchText: contentPreview?.slice(0, 100),
          pageNumber: extractPageNumber(documentInfo),
        });
      } else {
        console.log('Document not found in storage:', docName);
      }
    } catch (error) {
      console.error('Error opening document:', error);
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
      />
    </>
  );
}
