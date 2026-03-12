import { useCallback } from 'react';
import { Attachment } from '@/types/chat';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const MAX_CHARS = 3000;

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages && text.length < MAX_CHARS; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    text += pageText + '\n';
  }
  
  return text.slice(0, MAX_CHARS);
}

async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file('word/document.xml')?.async('text');
  
  if (!docXml) return '';
  
  // Strip XML tags to get plain text
  const text = docXml
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  
  return text.slice(0, MAX_CHARS);
}

async function extractTextFromPlain(file: File): Promise<string> {
  const text = await file.text();
  return text.slice(0, MAX_CHARS);
}

export function useAttachmentTextExtractor() {
  const extractText = useCallback(async (attachment: Attachment): Promise<string | null> => {
    if (!attachment.file) return null;
    
    const file = attachment.file;
    const ext = file.name.toLowerCase().split('.').pop();
    
    try {
      if (file.type === 'application/pdf' || ext === 'pdf') {
        return await extractTextFromPdf(file);
      }
      
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
        return await extractTextFromDocx(file);
      }
      
      if (['csv', 'txt', 'xls', 'xlsx', 'md', 'doc', 'json', 'xml', 'html', 'htm', 'log', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'rtf'].includes(ext || '') || file.type.startsWith('text/')) {
        return await extractTextFromPlain(file);
      }
      
      // Images - no text to extract
      if (file.type.startsWith('image/')) {
        return null;
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting text from attachment:', error);
      return null;
    }
  }, []);
  
  return { extractText };
}
