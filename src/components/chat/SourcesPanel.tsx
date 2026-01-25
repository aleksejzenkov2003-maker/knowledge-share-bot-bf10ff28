import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileText, BookOpen, Globe } from "lucide-react";
import { Citation } from "@/types/chat";

interface SourcesPanelProps {
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
  webSearchUsed?: boolean;
}

export function SourcesPanel({ 
  ragContext, 
  citations, 
  webSearchCitations,
  webSearchUsed 
}: SourcesPanelProps) {
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

  return (
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
              
              return (
                <div 
                  key={idx}
                  className="p-3 rounded-lg bg-muted/50 border border-border/50"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Badge variant="outline" className="shrink-0 font-mono">
                      [{docNum}]
                    </Badge>
                    <span className="text-sm font-medium text-foreground line-clamp-2">
                      {docInfo}
                    </span>
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
            {citations?.map((citation) => (
              <div 
                key={citation.index}
                className="p-3 rounded-lg bg-muted/50 border border-border/50"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="shrink-0 font-mono">
                    [{citation.index}]
                  </Badge>
                  <span className="text-sm font-medium text-foreground truncate">
                    {citation.document}
                  </span>
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
            ))}
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
  );
}
