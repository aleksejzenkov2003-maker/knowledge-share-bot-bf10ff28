import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, FileType, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { Citation } from "@/types/chat";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ExternalHyperlink } from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function generateFileName(userQuestion: string | undefined, extension: string): string {
  if (!userQuestion || !userQuestion.trim()) {
    return `response-${new Date().toISOString().slice(0, 10)}.${extension}`;
  }
  const cleaned = userQuestion
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').slice(0, 6).join(' ');
  const truncated = words.length > 50 ? words.slice(0, 50).trim() : words;
  return `${truncated || 'response'}.${extension}`;
}

interface DownloadDropdownProps {
  content: string;
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
  userQuestion?: string;
}

export function DownloadDropdown({
  content,
  ragContext,
  citations,
  webSearchCitations,
  userQuestion,
}: DownloadDropdownProps) {
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const formatSources = () => {
    let sources = "";
    
    if (ragContext && ragContext.length > 0) {
      sources += "\n\n---\n\n## Источники из базы знаний\n\n";
      ragContext.forEach((source, idx) => {
        const lines = source.split('\n');
        const headerLine = lines[0] || '';
        sources += `${idx + 1}. ${headerLine}\n`;
      });
    }
    
    if (citations && citations.length > 0) {
      sources += "\n\n## Цитаты из документов\n\n";
      citations.forEach((citation) => {
        sources += `[${citation.index}] ${citation.document}`;
        if (citation.section) sources += ` | ${citation.section}`;
        if (citation.article) sources += ` | Ст. ${citation.article}`;
        sources += ` (релевантность: ${(citation.relevance * 100).toFixed(0)}%)\n`;
      });
    }
    
    if (webSearchCitations && webSearchCitations.length > 0) {
      sources += "\n\n## Веб-источники\n\n";
      webSearchCitations.forEach((url, idx) => {
        sources += `${idx + 1}. ${url}\n`;
      });
    }
    
    return sources;
  };

  const handleDownloadMD = () => {
    const fullContent = content + formatSources();
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateFileName(userQuestion, 'md');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Скачано",
      description: "Файл MD сохранён",
    });
  };

  // Parse inline markdown formatting into TextRun array
  const parseInlineFormatting = (text: string): TextRun[] => {
    const children: TextRun[] = [];
    // Handle bold, italic, links, and clean up stray asterisks
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_|\[[^\]]+\]\([^)]+\))/);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        children.push(new TextRun({ text: part.slice(2, -2), bold: true }));
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        children.push(new TextRun({ text: part.slice(1, -1), italics: true }));
      } else if (part.startsWith('__') && part.endsWith('__')) {
        children.push(new TextRun({ text: part.slice(2, -2), bold: true }));
      } else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
        children.push(new TextRun({ text: part.slice(1, -1), italics: true }));
      } else if (part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)) {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
        children.push(new TextRun({ text: match[1], color: "0563C1", underline: { type: "single" } }));
      } else {
        // Clean stray asterisks that weren't matched
        children.push(new TextRun({ text: part.replace(/\*/g, '') }));
      }
    }
    return children.length > 0 ? children : [new TextRun({ text })];
  };

  // Parse markdown table lines into a docx Table
  const parseMarkdownTable = (tableLines: string[]): Table => {
    const parseRow = (line: string) =>
      line.split('|').map(c => c.trim()).filter(c => c !== '');

    const headerCells = parseRow(tableLines[0]);
    const dataRows = tableLines.slice(2); // skip separator line

    const borderStyle = {
      style: BorderStyle.SINGLE,
      size: 1,
      color: "CCCCCC",
    };
    const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

    const rows: TableRow[] = [];

    // Header row
    rows.push(new TableRow({
      children: headerCells.map(cell => new TableCell({
        borders,
        width: { size: Math.floor(9000 / headerCells.length), type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: cell, bold: true })] })],
      })),
    }));

    // Data rows
    for (const line of dataRows) {
      if (!line.trim()) continue;
      const cells = parseRow(line);
      rows.push(new TableRow({
        children: headerCells.map((_, i) => new TableCell({
          borders,
          width: { size: Math.floor(9000 / headerCells.length), type: WidthType.DXA },
          children: [new Paragraph({ children: parseInlineFormatting(cells[i] || '') })],
        })),
      }));
    }

    return new Table({
      rows,
      width: { size: 9000, type: WidthType.DXA },
    });
  };

  const handleDownloadDOCX = async () => {
    setIsGenerating('docx');
    try {
      const docChildren: (Paragraph | Table)[] = [];
      const lines = content.split('\n');
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        // Detect markdown table (line starts with |, next line is separator)
        if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].match(/^\|[\s\-:|]+\|/)) {
          const tableLines: string[] = [];
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]);
            i++;
          }
          docChildren.push(parseMarkdownTable(tableLines));
          docChildren.push(new Paragraph({ text: "" }));
          continue;
        }

        if (line.startsWith('# ')) {
          docChildren.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
        } else if (line.startsWith('## ')) {
          docChildren.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }));
        } else if (line.startsWith('### ')) {
          docChildren.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          docChildren.push(new Paragraph({ children: parseInlineFormatting("• " + line.slice(2)), indent: { left: 720 } }));
        } else if (line.match(/^\d+\.\s/)) {
          docChildren.push(new Paragraph({ children: parseInlineFormatting(line), indent: { left: 720 } }));
        } else if (line.startsWith('> ')) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: line.slice(2), italics: true })],
            indent: { left: 720 },
            border: { left: { color: "999999", size: 2, space: 10, style: "single" } },
          }));
        } else if (line.trim() === '') {
          docChildren.push(new Paragraph({ text: "" }));
        } else {
          docChildren.push(new Paragraph({ children: parseInlineFormatting(line) }));
        }
        i++;
      }
      
      // Add sources section
      docChildren.push(new Paragraph({ text: "" }));
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "─".repeat(50) })],
        alignment: AlignmentType.CENTER,
      }));
      docChildren.push(new Paragraph({ text: "" }));
      docChildren.push(new Paragraph({
        text: "Источники ответа",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));
      
      if (ragContext && ragContext.length > 0) {
        docChildren.push(new Paragraph({
          text: "Источники из базы знаний",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        ragContext.forEach((source, idx) => {
          const lines = source.split('\n');
          const headerLine = lines[0] || '';
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: `${idx + 1}. ${headerLine}` })],
            spacing: { before: 100, after: 50 },
          }));
        });
      }
      
      if (citations && citations.length > 0) {
        docChildren.push(new Paragraph({
          text: "Цитаты из документов",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        citations.forEach((citation) => {
          let text = `[${citation.index}] ${citation.document}`;
          if (citation.section) text += ` | ${citation.section}`;
          if (citation.article) text += ` | Ст. ${citation.article}`;
          text += ` (релевантность: ${(citation.relevance * 100).toFixed(0)}%)`;
          docChildren.push(new Paragraph({
            children: [new TextRun({ text })],
            spacing: { before: 100, after: 50 },
          }));
        });
      }
      
      if (webSearchCitations && webSearchCitations.length > 0) {
        docChildren.push(new Paragraph({
          text: "Веб-источники",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        webSearchCitations.forEach((url, idx) => {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: `${idx + 1}. ${url}` })],
            spacing: { before: 100, after: 50 },
          }));
        });
      }
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: docChildren,
        }],
      });
      
      const blob = await Packer.toBlob(doc);
      saveAs(blob, generateFileName(userQuestion, 'docx'));
      
      toast({
        title: "Скачано",
        description: "Файл DOCX сохранён",
      });
    } catch (error) {
      console.error('Error generating DOCX:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать DOCX файл",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(null);
    }
  };

  const date = new Date().toISOString().slice(0, 10);

  const handleDownloadPDF = async () => {
    setIsGenerating('pdf');
    try {
      // Create a temporary container for rendering
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 800px;
        padding: 40px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        background: white;
        color: black;
      `;
      
      // Convert markdown to HTML
      const htmlContent = convertMarkdownToHtml(content);
      const sourcesHtml = formatSourcesAsHtml();
      
      container.innerHTML = `
        <div style="margin-bottom: 20px;">
          ${htmlContent}
        </div>
        ${sourcesHtml ? `
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
          <div>
            <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">Источники ответа</h2>
            ${sourcesHtml}
          </div>
        ` : ''}
      `;
      
      document.body.appendChild(container);
      
      // Render to canvas
      const canvas = await html2canvas(container, { 
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      document.body.removeChild(container);
      
      // Create PDF from canvas
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20; // 10mm margin on each side
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Handle multi-page PDFs
      let heightLeft = imgHeight;
      let position = 10; // Top margin
      
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 20;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight - 20;
      }
      
      pdf.save(generateFileName(userQuestion, 'pdf'));
      
      toast({
        title: "Скачано",
        description: "Файл PDF сохранён",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать PDF файл",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(null);
    }
  };

  // Convert markdown to HTML for PDF rendering
  const convertMarkdownToHtml = (text: string): string => {
    return text
      .replace(/^### (.+)$/gm, '<h3 style="font-size: 16px; font-weight: bold; margin: 15px 0 10px;">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size: 18px; font-weight: bold; margin: 18px 0 12px;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size: 22px; font-weight: bold; margin: 20px 0 15px;">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^[-*] (.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 5px;">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 5px; list-style-type: decimal;">$1</li>')
      .replace(/\n\n/g, '</p><p style="margin: 10px 0;">')
      .replace(/\n/g, '<br/>')
      .replace(/^/, '<p style="margin: 10px 0;">')
      .replace(/$/, '</p>');
  };

  // Format sources as HTML for PDF
  const formatSourcesAsHtml = (): string => {
    const parts: string[] = [];
    
    if (ragContext && ragContext.length > 0) {
      parts.push('<div style="margin-bottom: 15px;">');
      parts.push('<h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">RAG-источники:</h3>');
      parts.push('<ul style="margin: 0; padding-left: 20px;">');
      ragContext.forEach((source, idx) => {
        const firstLine = source.split('\n')[0] || source.slice(0, 100);
        parts.push(`<li style="margin-bottom: 5px; font-size: 12px;">${firstLine}</li>`);
      });
      parts.push('</ul></div>');
    }
    
    if (citations && citations.length > 0) {
      parts.push('<div style="margin-bottom: 15px;">');
      parts.push('<h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Цитаты:</h3>');
      parts.push('<ul style="margin: 0; padding-left: 20px;">');
      citations.forEach((citation) => {
        let citationText = `[${citation.index}] ${citation.document}`;
        if (citation.section) citationText += ` | ${citation.section}`;
        if (citation.article) citationText += ` | Ст. ${citation.article}`;
        parts.push(`<li style="margin-bottom: 5px; font-size: 12px;">${citationText}</li>`);
      });
      parts.push('</ul></div>');
    }
    
    if (webSearchCitations && webSearchCitations.length > 0) {
      parts.push('<div style="margin-bottom: 15px;">');
      parts.push('<h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Веб-источники:</h3>');
      parts.push('<ul style="margin: 0; padding-left: 20px;">');
      webSearchCitations.forEach((url, idx) => {
        parts.push(`<li style="margin-bottom: 5px; font-size: 12px;"><a href="${url}">${url}</a></li>`);
      });
      parts.push('</ul></div>');
    }
    
    return parts.join('');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isGenerating !== null}
        >
          {isGenerating ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Download className="h-3 w-3 mr-1" />
          )}
          Скачать
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 bg-popover z-50">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Выберите формат
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDownloadMD} className="cursor-pointer">
          <FileText className="h-3.5 w-3.5 mr-2" />
          <span>Markdown (.md)</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleDownloadDOCX} 
          className="cursor-pointer"
          disabled={isGenerating === 'docx'}
        >
          <FileType className="h-3.5 w-3.5 mr-2" />
          <span>Word (.docx)</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleDownloadPDF} 
          className="cursor-pointer"
          disabled={isGenerating === 'pdf'}
        >
          <FileText className="h-3.5 w-3.5 mr-2" />
          <span>PDF (.pdf)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
