import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Citation } from '@/types/chat';
import { CitationLink } from './CitationLink';

interface MarkdownWithCitationsProps {
  content: string;
  citations?: Citation[];
  // Bitrix context props
  isBitrixContext?: boolean;
  bitrixApiBaseUrl?: string;
  bitrixToken?: string;
}

// Parse text to find [N] patterns and replace with interactive links
function renderTextWithCitations(
  text: string, 
  citations?: Citation[],
  isBitrixContext?: boolean,
  bitrixApiBaseUrl?: string,
  bitrixToken?: string,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const citationIndex = parseInt(match[1], 10);
    const citation = citations?.find(c => c.index === citationIndex);

    parts.push(
      <CitationLink
        key={`citation-${key++}`}
        index={citationIndex}
        citation={citation}
        isBitrixContext={isBitrixContext}
        bitrixApiBaseUrl={bitrixApiBaseUrl}
        bitrixToken={bitrixToken}
      />
    );

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export function MarkdownWithCitations({
  content,
  citations,
  isBitrixContext,
  bitrixApiBaseUrl,
  bitrixToken,
}: MarkdownWithCitationsProps) {
  // Custom text renderer that injects citation links
  const textRenderer = ({ children }: { children?: React.ReactNode }) => {
    if (typeof children === 'string') {
      return <>{renderTextWithCitations(children, citations, isBitrixContext, bitrixApiBaseUrl, bitrixToken)}</>;
    }
    return <>{children}</>;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-3 leading-relaxed last:mb-0">
            {React.Children.map(children, child => {
              if (typeof child === 'string') {
                return <>{renderTextWithCitations(child, citations, isBitrixContext, bitrixApiBaseUrl, bitrixToken)}</>;
              }
              return child;
            })}
          </p>
        ),
        li: ({ children }) => (
          <li className="mb-1 leading-relaxed">
            {React.Children.map(children, child => {
              if (typeof child === 'string') {
                return <>{renderTextWithCitations(child, citations, isBitrixContext, bitrixApiBaseUrl, bitrixToken)}</>;
              }
              return child;
            })}
          </li>
        ),
        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
        code: ({ className, children }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ) : (
            <pre className="bg-background/50 p-3 rounded overflow-x-auto my-3">
              <code className="text-xs font-mono">{children}</code>
            </pre>
          );
        },
        h1: ({ children }) => <h1 className="text-xl font-bold mt-5 mb-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-2">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1">{children}</h4>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-primary pl-4 my-3 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary underline hover:opacity-80 font-medium"
          >
            {children}
          </a>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="my-4 border-border" />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-4 rounded border border-border">
            <table className="min-w-full border-collapse text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-border last:border-b-0 even:bg-muted/20">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold bg-muted/30 border-b border-border whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border-b border-border/50">
            {React.Children.map(children, child => {
              if (typeof child === 'string') {
                return <>{renderTextWithCitations(child, citations, isBitrixContext, bitrixApiBaseUrl, bitrixToken)}</>;
              }
              return child;
            })}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
