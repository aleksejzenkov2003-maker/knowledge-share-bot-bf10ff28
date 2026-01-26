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
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

interface DownloadDropdownProps {
  content: string;
  ragContext?: string[];
  citations?: Citation[];
  webSearchCitations?: string[];
}

export function DownloadDropdown({
  content,
  ragContext,
  citations,
  webSearchCitations,
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
    a.download = `response-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Скачано",
      description: "Файл MD сохранён",
    });
  };

  const handleDownloadDOCX = async () => {
    setIsGenerating('docx');
    try {
      const paragraphs: Paragraph[] = [];
      
      // Parse markdown content and convert to docx paragraphs
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('# ')) {
          paragraphs.push(new Paragraph({
            text: line.slice(2),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }));
        } else if (line.startsWith('## ')) {
          paragraphs.push(new Paragraph({
            text: line.slice(3),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }));
        } else if (line.startsWith('### ')) {
          paragraphs.push(new Paragraph({
            text: line.slice(4),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }));
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: "• " + line.slice(2) })],
            indent: { left: 720 },
          }));
        } else if (line.match(/^\d+\.\s/)) {
          paragraphs.push(new Paragraph({
            text: line,
            indent: { left: 720 },
          }));
        } else if (line.startsWith('> ')) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: line.slice(2), italics: true })],
            indent: { left: 720 },
            border: { left: { color: "999999", size: 2, space: 10, style: "single" } },
          }));
        } else if (line.trim() === '') {
          paragraphs.push(new Paragraph({ text: "" }));
        } else {
          // Handle bold and italic in regular text
          const children: TextRun[] = [];
          let remaining = line;
          
          // Simple bold/italic parsing
          const parts = remaining.split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/);
          for (const part of parts) {
            if (part.startsWith('**') && part.endsWith('**')) {
              children.push(new TextRun({ text: part.slice(2, -2), bold: true }));
            } else if (part.startsWith('*') && part.endsWith('*')) {
              children.push(new TextRun({ text: part.slice(1, -1), italics: true }));
            } else if (part.startsWith('__') && part.endsWith('__')) {
              children.push(new TextRun({ text: part.slice(2, -2), bold: true }));
            } else if (part.startsWith('_') && part.endsWith('_')) {
              children.push(new TextRun({ text: part.slice(1, -1), italics: true }));
            } else {
              children.push(new TextRun({ text: part }));
            }
          }
          
          paragraphs.push(new Paragraph({ children }));
        }
      }
      
      // Add sources section
      paragraphs.push(new Paragraph({ text: "" }));
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: "─".repeat(50) })],
        alignment: AlignmentType.CENTER,
      }));
      paragraphs.push(new Paragraph({ text: "" }));
      paragraphs.push(new Paragraph({
        text: "Источники ответа",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));
      
      if (ragContext && ragContext.length > 0) {
        paragraphs.push(new Paragraph({
          text: "Источники из базы знаний",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        ragContext.forEach((source, idx) => {
          const lines = source.split('\n');
          const headerLine = lines[0] || '';
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: `${idx + 1}. ${headerLine}` })],
            spacing: { before: 100, after: 50 },
          }));
        });
      }
      
      if (citations && citations.length > 0) {
        paragraphs.push(new Paragraph({
          text: "Цитаты из документов",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        citations.forEach((citation) => {
          let text = `[${citation.index}] ${citation.document}`;
          if (citation.section) text += ` | ${citation.section}`;
          if (citation.article) text += ` | Ст. ${citation.article}`;
          text += ` (релевантность: ${(citation.relevance * 100).toFixed(0)}%)`;
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text })],
            spacing: { before: 100, after: 50 },
          }));
        });
      }
      
      if (webSearchCitations && webSearchCitations.length > 0) {
        paragraphs.push(new Paragraph({
          text: "Веб-источники",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
        webSearchCitations.forEach((url, idx) => {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: `${idx + 1}. ${url}` })],
            spacing: { before: 100, after: 50 },
          }));
        });
      }
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });
      
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `response-${new Date().toISOString().slice(0, 10)}.docx`);
      
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

  const handleDownloadPDF = async () => {
    setIsGenerating('pdf');
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let yPos = margin;
      
      // Add content
      const fullContent = content + formatSources();
      const lines = fullContent.split('\n');
      
      for (const line of lines) {
        if (yPos > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          yPos = margin;
        }
        
        if (line.startsWith('# ')) {
          doc.setFontSize(18);
          doc.setFont('helvetica', 'bold');
          const text = line.slice(2);
          const splitText = doc.splitTextToSize(text, maxWidth);
          doc.text(splitText, margin, yPos);
          yPos += splitText.length * 8 + 6;
        } else if (line.startsWith('## ')) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          const text = line.slice(3);
          const splitText = doc.splitTextToSize(text, maxWidth);
          doc.text(splitText, margin, yPos);
          yPos += splitText.length * 6 + 4;
        } else if (line.startsWith('### ')) {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          const text = line.slice(4);
          const splitText = doc.splitTextToSize(text, maxWidth);
          doc.text(splitText, margin, yPos);
          yPos += splitText.length * 5 + 3;
        } else if (line.startsWith('---')) {
          doc.setDrawColor(200);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 6;
        } else if (line.trim() === '') {
          yPos += 4;
        } else {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          // Remove markdown formatting for PDF
          const cleanLine = line
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/_([^_]+)_/g, '$1');
          const splitText = doc.splitTextToSize(cleanLine, maxWidth);
          doc.text(splitText, margin, yPos);
          yPos += splitText.length * 5;
        }
      }
      
      doc.save(`response-${new Date().toISOString().slice(0, 10)}.pdf`);
      
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
