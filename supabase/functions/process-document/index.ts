import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getActivePatterns } from "../_shared/pii-patterns.ts";
import { encryptAES256 } from "../_shared/pii-crypto.ts";

// ============= OCR RESULT TYPE =============
interface OcrResult {
  success: boolean;
  text: string;
  errorCode?: number;
  pages?: { pageNum: number; offset: number }[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProcessRequest {
  document_id: string;
}

// ============= SAFE BASE64 CONVERSION =============
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32768; // Process in 32KB chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// ============= PARSE OCR TEXT WITH PAGE MARKERS =============
function parseOcrTextWithPages(ocrTextInput: string): { 
  text: string; 
  pages: { pageNum: number; offset: number }[] 
} {
  const pages: { pageNum: number; offset: number }[] = [];
  
  // Find all page markers: [СТРАНИЦА N] or [PAGE N]
  const pageMarkerRegex = /\[(?:СТРАНИЦА|PAGE)\s*(\d+)\]/gi;
  
  // First pass: collect page positions
  const matches: { index: number; pageNum: number; length: number }[] = [];
  let match;
  while ((match = pageMarkerRegex.exec(ocrTextInput)) !== null) {
    matches.push({
      index: match.index,
      pageNum: parseInt(match[1], 10),
      length: match[0].length
    });
  }
  
  // Build pages array with adjusted offsets (after removing markers)
  let removedChars = 0;
  for (const m of matches) {
    pages.push({ 
      pageNum: m.pageNum, 
      offset: m.index - removedChars 
    });
    removedChars += m.length;
  }
  
  // Remove markers from text
  const cleanText = ocrTextInput.replace(/\[(?:СТРАНИЦА|PAGE)\s*\d+\]/gi, '');
  
  return { text: cleanText.trim(), pages };
}

// ============= GEMINI OCR (PRIMARY - CHEAP & FAST) =============
// Single-chunk OCR — called per chunk from tryGeminiOcrChunked
async function tryGeminiOcr(pdfData: Uint8Array, timeoutMs = 30000, addPageMarkers = false): Promise<OcrResult> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY not configured, skipping Gemini OCR');
    return { success: false, text: '', errorCode: 0 };
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const base64Pdf = uint8ArrayToBase64(pdfData);
    
    const prompt = addPageMarkers
      ? `Это PDF документ. Извлеки ВЕСЬ текст со всех страниц.

КРИТИЧЕСКИ ВАЖНО:
- В НАЧАЛЕ каждой страницы добавь маркер: [СТРАНИЦА N]
- Например: [СТРАНИЦА 1] текст первой страницы... [СТРАНИЦА 2] текст второй...
- Сохрани структуру: абзацы, списки, заголовки
- Таблицы представь в текстовом виде
- Язык документа сохрани без изменений

Верни ТОЛЬКО извлечённый текст с маркерами страниц.`
      : `Извлеки ВЕСЬ текст из этого PDF документа. Сохрани структуру: абзацы, списки, заголовки. Таблицы представь в текстовом виде. Язык документа сохрани без изменений. Верни ТОЛЬКО извлечённый текст.`;
    
    const ocrResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
            ]
          }],
          generationConfig: { maxOutputTokens: 16000 },
        }),
      }
    );
    
    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error(`Gemini OCR error: ${ocrResponse.status} - ${errorText}`);
      return { success: false, text: '', errorCode: ocrResponse.status };
    }
    
    const ocrResult = await ocrResponse.json();
    const ocrText = ocrResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (ocrText.length > 50) {
      console.log(`Gemini OCR successful! Extracted ${ocrText.length} characters`);
      if (addPageMarkers) {
        const parsed = parseOcrTextWithPages(ocrText);
        return { success: true, text: parsed.text, pages: parsed.pages };
      }
      return { success: true, text: ocrText.trim() };
    }
    
    console.log('Gemini OCR returned insufficient text');
    return { success: false, text: '', errorCode: 0 };
    
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Gemini OCR timeout (${timeoutMs}ms exceeded)`);
      return { success: false, text: '', errorCode: 408 };
    }
    console.error('Gemini OCR error:', error);
    return { success: false, text: '', errorCode: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============= GEMINI OCR WITH GLOBAL PAGE NUMBERS (FOR CHUNKED PROCESSING) =============
async function tryGeminiOcrWithGlobalPages(
  pdfData: Uint8Array, globalStartPage: number, numPagesInChunk: number, timeoutMs: number
): Promise<OcrResult> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return { success: false, text: '', errorCode: 0 };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const base64Pdf = uint8ArrayToBase64(pdfData);
    
    // Build page number mapping for prompt
    const pageNumbers = Array.from({ length: numPagesInChunk }, (_, i) => globalStartPage + i);
    const pageList = pageNumbers.join(', ');
    
    const prompt = `Это PDF документ содержащий страницы ${pageList} (${numPagesInChunk} стр.).

Извлеки ВЕСЬ текст. КРИТИЧЕСКИ ВАЖНО:
- Перед текстом КАЖДОЙ страницы добавь маркер с ПРАВИЛЬНЫМ номером:
  [СТРАНИЦА ${pageNumbers[0]}] текст первой страницы...
  [СТРАНИЦА ${pageNumbers[1] || ''}] текст второй страницы...
  и т.д.
- Номера страниц: ${pageList}
- Сохрани структуру: абзацы, списки, заголовки
- Таблицы представь в текстовом виде
- Язык документа сохрани без изменений

Верни ТОЛЬКО извлечённый текст с маркерами страниц.`;
    
    const ocrResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inlineData: { mimeType: 'application/pdf', data: base64Pdf } }
          ]}],
          generationConfig: { maxOutputTokens: 16000 },
        }),
      }
    );
    
    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error(`Gemini OCR chunk error: ${ocrResponse.status} - ${errorText}`);
      return { success: false, text: '', errorCode: ocrResponse.status };
    }
    
    const ocrResult = await ocrResponse.json();
    const ocrText = ocrResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (ocrText.length > 50) {
      console.log(`Gemini OCR chunk (pages ${pageList}): ${ocrText.length} chars`);
      const parsed = parseOcrTextWithPages(ocrText);
      return { success: true, text: parsed.text, pages: parsed.pages };
    }
    
    return { success: false, text: '', errorCode: 0 };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Gemini OCR chunk timeout (${timeoutMs}ms)`);
      return { success: false, text: '', errorCode: 408 };
    }
    console.error('Gemini OCR chunk error:', error);
    return { success: false, text: '', errorCode: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============= CHUNKED GEMINI OCR (SPLITS PDF INTO 4-PAGE CHUNKS) =============
async function tryGeminiOcrChunked(pdfData: Uint8Array, numPages: number): Promise<OcrResult> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    return { success: false, text: '', errorCode: 0 };
  }

  // For small PDFs (<=4 pages), just send directly with page markers
  if (numPages <= 4) {
    console.log(`Small PDF (${numPages} pages), sending directly to Gemini`);
    return tryGeminiOcr(pdfData, 45000, true);
  }

  // Cap OCR pages to prevent CPU timeout on very large PDFs
  const MAX_OCR_PAGES = 120;
  if (numPages > MAX_OCR_PAGES) {
    console.log(`PDF has ${numPages} pages, exceeding OCR limit of ${MAX_OCR_PAGES}. Processing first ${MAX_OCR_PAGES} pages only.`);
    numPages = MAX_OCR_PAGES;
  }

  console.log(`Large scanned PDF (${numPages} pages), splitting into 4-page chunks...`);

  const PAGES_PER_CHUNK = 4;
  const PARALLEL_LIMIT = 2;
  
  try {
    // Import pdf-lib from esm.sh for Deno
    const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1');
    
    const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    
    // Build chunk definitions
    const chunks: { startPage: number; endPage: number }[] = [];
    for (let i = 0; i < totalPages; i += PAGES_PER_CHUNK) {
      chunks.push({ startPage: i, endPage: Math.min(i + PAGES_PER_CHUNK, totalPages) });
    }
    
    console.log(`Split into ${chunks.length} chunks of up to ${PAGES_PER_CHUNK} pages`);
    
    const results: { chunkIndex: number; text: string; success: boolean; pages: { pageNum: number; offset: number }[] }[] = [];
    
    for (let batchStart = 0; batchStart < chunks.length; batchStart += PARALLEL_LIMIT) {
      const batch = chunks.slice(batchStart, batchStart + PARALLEL_LIMIT);
      const batchPromises = batch.map(async (chunk, idx) => {
        const chunkIndex = batchStart + idx;
        try {
          // Create sub-PDF for this chunk
          const subDoc = await PDFDocument.create();
          const pageIndices = Array.from(
            { length: chunk.endPage - chunk.startPage },
            (_, i) => chunk.startPage + i
          );
          const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
          copiedPages.forEach((page: any) => subDoc.addPage(page));
          const subPdfBytes = await subDoc.save();
          
          const chunkPages = chunk.endPage - chunk.startPage;
          const globalStartPage = chunk.startPage + 1;
          console.log(`Chunk ${chunkIndex + 1}/${chunks.length}: pages ${globalStartPage}-${chunk.endPage}, size ${subPdfBytes.length} bytes`);
          
          // Ask Gemini for page markers with GLOBAL page numbers
          const chunkResult = await tryGeminiOcrWithGlobalPages(
            new Uint8Array(subPdfBytes), globalStartPage, chunkPages, 30000
          );
          return { chunkIndex, text: chunkResult.text || '', success: chunkResult.success, pages: chunkResult.pages };
        } catch (err) {
          console.error(`Chunk ${chunkIndex + 1} failed:`, err);
          return { chunkIndex, text: '', success: false, pages: [] as { pageNum: number; offset: number }[] };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to reduce CPU spikes
      if (batchStart + PARALLEL_LIMIT < chunks.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    // Merge results with page markers
    const successCount = results.filter(r => r.success).length;
    console.log(`OCR complete: ${successCount}/${chunks.length} chunks succeeded`);
    
    if (successCount === 0) {
      return { success: false, text: '', errorCode: 408 };
    }
    
    // Sort by chunk index and merge
    results.sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    let mergedText = '';
    const pages: { pageNum: number; offset: number }[] = [];
    
    for (const result of results) {
      if (!result.success || !result.text) continue;
      const chunk = chunks[result.chunkIndex];
      
      // Add page markers from parsed chunk results (with correct global offsets)
      if (result.pages && result.pages.length > 0) {
        for (const p of result.pages) {
          pages.push({ pageNum: p.pageNum, offset: mergedText.length + p.offset });
        }
      } else {
        // Fallback: at least mark the first page of the chunk
        pages.push({ pageNum: chunk.startPage + 1, offset: mergedText.length });
      }
      
      mergedText += result.text + '\n\n';
    }
    
    const finalText = mergedText.trim();
    console.log(`Chunked OCR merged: ${finalText.length} chars, ${pages.length} page markers`);
    
    return { success: true, text: finalText, pages };
    
  } catch (error) {
    console.error('Chunked OCR failed (pdf-lib error):', error);
    // Fallback: try sending the whole PDF with longer timeout
    console.log('Falling back to single-request Gemini OCR...');
    return tryGeminiOcr(pdfData, 50000, true);
  }
}

// ============= ANTHROPIC CLAUDE OCR (FALLBACK) =============
async function tryAnthropicOcr(pdfData: Uint8Array): Promise<OcrResult> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not configured, skipping Anthropic OCR fallback');
    return { success: false, text: '', errorCode: 0 };
  }
  
  // Timeout 55 seconds (Edge Functions have ~60s limit)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  
  try {
    console.log('Attempting OCR via Anthropic Claude...');
    const base64Pdf = uint8ArrayToBase64(pdfData);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: `Извлеки ВЕСЬ текст из этого PDF документа.

КРИТИЧЕСКИ ВАЖНО:
- В НАЧАЛЕ каждой страницы добавь маркер: [СТРАНИЦА N]
- Например: [СТРАНИЦА 1] текст первой страницы... [СТРАНИЦА 2] текст второй...
- Сохрани структуру: абзацы, списки, заголовки
- Таблицы представь в текстовом виде
- Язык документа сохрани без изменений

Верни ТОЛЬКО извлечённый текст с маркерами страниц.`,
              },
            ],
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API error: ${response.status} - ${errorText}`);
      return { success: false, text: '', errorCode: response.status };
    }
    
    const result = await response.json();
    const ocrText = result.content?.[0]?.text || '';
    
    if (ocrText.length > 100) {
      console.log(`Anthropic OCR successful! Extracted ${ocrText.length} characters`);
      const parsed = parseOcrTextWithPages(ocrText);
      return { success: true, text: parsed.text, pages: parsed.pages };
    }
    
    console.log('Anthropic OCR returned insufficient text');
    return { success: false, text: '', errorCode: 0 };
    
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Anthropic OCR timeout (55s exceeded)');
      return { success: false, text: '', errorCode: 408 };
    }
    console.error('Anthropic OCR error:', error);
    return { success: false, text: '', errorCode: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============= STRUCTURE PATTERNS FOR LEGAL DOCUMENTS =============

const STRUCTURE_PATTERNS = {
  // Части документа: "ЧАСТЬ ПЕРВАЯ", "Часть 3", "ЧАСТЬ ТРЕТЬЯ"
  part: /^(?:ЧАСТЬ\s+)?(ПЕРВАЯ|ВТОРАЯ|ТРЕТЬЯ|ЧЕТВЕРТАЯ|ПЯТАЯ|ШЕСТАЯ|СЕДЬМАЯ|\d+)(?:\s*[.\-:]?\s*(.+)?)?$/im,
  
  // Разделы: "РАЗДЕЛ I", "Раздел 5", "РАЗДЕЛ V. НАСЛЕДСТВЕННОЕ ПРАВО"
  section: /^РАЗДЕЛ\s+([IVX]+|\d+)(?:\s*[.\-:]?\s*(.+)?)?$/im,
  
  // Подразделы: "Подраздел 1", "ПОДРАЗДЕЛ 2. ОБЩИЕ ПОЛОЖЕНИЯ"
  subsection: /^ПОДРАЗДЕЛ\s+(\d+)(?:\s*[.\-:]?\s*(.+)?)?$/im,
  
  // Главы: "ГЛАВА 72", "Глава I", "Глава 72. ПАТЕНТНОЕ ПРАВО"
  chapter: /^ГЛАВА\s+([IVX]+|\d+)(?:\s*[.\-:]?\s*(.+)?)?$/im,
  
  // Статьи (ключевое для законов!): "Статья 1142.", "Статья 1142. Наследники первой очереди"
  article: /^Статья\s+(\d+(?:\.\d+)?)\.?\s*(.*)$/im,
  
  // Параграфы: "§ 1", "§ 2. Общие положения"
  paragraph: /^§\s*(\d+)(?:\s*[.\-:]?\s*(.+)?)?$/im,
};

// ============= STRUCTURE PATTERNS FOR BUSINESS DOCUMENTS =============

const BUSINESS_PATTERNS = {
  // Главные разделы: "1. ВВЕДЕНИЕ", "2. ОПИСАНИЕ ПРОЕКТА", "3. ТИПЫ ПОТОКОВ"
  mainSection: /^(\d+)\.\s+([A-ZА-ЯЁ][A-ZА-ЯЁ\s\(\)]+)$/m,
  
  // Подразделы: "3.1 Start Flow", "4.2 Growing Flow", "3.1 Начальный поток"
  subSection: /^(\d+\.\d+)\s+(.+)$/m,
  
  // Под-подразделы: "3.1.1 Детали", "4.2.1 Подробности"
  subSubSection: /^(\d+\.\d+\.\d+)\s+(.+)$/m,
  
  // Маркированные списки: "• пункт", "- пункт", "* пункт"
  bulletPoint: /^[•\-\*]\s+(.+)$/m,
};

// ============= STRUCTURE PATTERNS FOR COURT DOCUMENTS =============

const COURT_PATTERNS = {
  // Заголовок решения: "РЕШЕНИЕ", "ОПРЕДЕЛЕНИЕ", "ПОСТАНОВЛЕНИЕ"
  decision: /^(РЕШЕНИЕ|ОПРЕДЕЛЕНИЕ|ПОСТАНОВЛЕНИЕ|ПРИГОВОР)$/im,
  
  // Секции судебного решения: "установил:", "УСТАНОВИЛ:", "решил:", "РЕШИЛ:"
  section: /^(УСТАНОВИЛ|РЕШИЛ|ПОСТАНОВИЛ|ОПРЕДЕЛИЛ)\s*:?\s*$/im,
  
  // Резолютивная часть
  resolutive: /^(На основании изложенного|Руководствуясь|С учетом изложенного)/im,
  
  // Ссылки на нормы права: "пункт 1 статьи 1486 ГК РФ", "статьи 110, 167-170 АПК РФ"
  lawReference: /(?:пункт(?:а|ов|у|ом|е|ами)?\s+\d+(?:\s*,\s*\d+)*\s+)?статьи?\s+\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*\s+[A-ZА-ЯЁ]+\s+РФ/gi,
  
  // Даты: "5 ноября 2025 года", "от 12.01.2025"
  date: /(\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*года?|\d{2}\.\d{2}\.\d{4})/gi,
  
  // Номер дела: "Дело № СИП-833/2024", "дело № А40-12345/2024"  
  caseNumber: /Дело\s*№?\s*([A-ZА-ЯЁ0-9\-\/]+)/gi,
};

// Типы чанков для метаданных
type ChunkType = 'header' | 'article' | 'paragraph' | 'point' | 'section' | 'general' | 'registration';

// Типы документов (включая ручные)
type DocumentType = 'legal' | 'contract' | 'business' | 'court' | 'article' | 'general' | 'registration_decision' | 'auto';

interface StructuredChunk {
  content: string;
  section_title: string | null;
  article_number: string | null;
  chunk_type: ChunkType;
  parent_context: string;
  page_start?: number;
  page_end?: number;
}

// Track PDF page positions for accurate navigation
interface PageText {
  pageNum: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

// Global variable to pass page data between functions
let currentPdfPagesData: PageText[] = [];
let currentPdfFullText: string = '';

// Function to determine page numbers for a chunk based on its position in full text
function getPageForChunk(chunkContent: string): { page_start: number; page_end: number } {
  if (currentPdfPagesData.length === 0 || !currentPdfFullText) {
    return { page_start: 1, page_end: 1 }; // Default for non-PDF or failed extraction
  }
  
  // Find where this chunk appears in the full text
  const chunkStart = currentPdfFullText.indexOf(chunkContent);
  if (chunkStart === -1) {
    // Chunk not found - try fuzzy match with first 100 chars
    const shortChunk = chunkContent.slice(0, 100).trim();
    const fuzzyStart = currentPdfFullText.indexOf(shortChunk);
    if (fuzzyStart === -1) {
      return { page_start: 1, page_end: 1 };
    }
    return getPageForOffset(fuzzyStart, fuzzyStart + chunkContent.length);
  }
  
  return getPageForOffset(chunkStart, chunkStart + chunkContent.length);
}

function getPageForOffset(startOffset: number, endOffset: number): { page_start: number; page_end: number } {
  let pageStart = 1;
  let pageEnd = 1;
  
  for (const page of currentPdfPagesData) {
    // Check if chunk starts in this page
    if (startOffset >= page.startOffset && startOffset < page.endOffset) {
      pageStart = page.pageNum;
    }
    // Check if chunk ends in this page
    if (endOffset > page.startOffset && endOffset <= page.endOffset) {
      pageEnd = page.pageNum;
      break;
    }
    // If chunk extends beyond this page, update end page
    if (startOffset < page.endOffset && endOffset > page.endOffset) {
      pageEnd = page.pageNum;
    }
  }
  
  return { page_start: pageStart, page_end: pageEnd };
}

interface DocumentStructure {
  currentPart: string | null;
  currentSection: string | null;
  currentChapter: string | null;
  currentArticle: string | null;
}

interface BusinessDocumentStructure {
  currentMainSection: string | null;
  currentMainSectionNumber: string | null;
  currentSubSection: string | null;
  currentSubSectionNumber: string | null;
}

// ============= DOCUMENT TYPE DETECTION =============

function detectDocumentType(text: string): 'legal' | 'contract' | 'business' | 'court' | 'article' | 'general' {
  const textSample = text.slice(0, 15000); // Анализируем первые 15к символов
  
  // Ключевые слова для судебных документов
  const courtPatterns = [
    /\bРЕШЕНИЕ\b/g,
    /\bОПРЕДЕЛЕНИЕ\b/g,
    /\bПОСТАНОВЛЕНИЕ\b/g,
    /\bУСТАНОВИЛ\s*:/gi,
    /\bРЕШИЛ\s*:/gi,
    /суд\s+по\s+интеллектуальным\s+правам/gi,
    /арбитражн\w+\s+суд/gi,
    /именем\s+российской\s+федерации/gi,
    /истец/gi,
    /ответчик/gi,
    /правообладател/gi,
    /товарн\w+\s+знак/gi,
    /правовая\s+охрана/gi,
    /ГК\s+РФ/gi,
    /АПК\s+РФ/gi,
    /Дело\s*№/gi,
  ];
  
  // Ключевые слова для юридических документов (законы, кодексы)
  const legalPatterns = [
    /^Статья\s+\d+/gim,  // Статьи в начале строки - сильный сигнал
    /глава\s+\d+/gi,
    /кодекс/gi,
    /федеральн\w+\s+закон/gi,
    /раздел\s+[ivx\d]+/gi,
  ];
  
  const contractPatterns = [
    /договор\s+\w+/gi,
    /стороны\s+договорились/gi,
    /обязуется/gi,
    /ответственность\s+сторон/gi,
    /заказчик/gi,
    /исполнитель/gi,
    /подрядчик/gi,
  ];
  
  let courtScore = 0;
  let legalScore = 0;
  let contractScore = 0;
  let businessScore = 0;
  
  for (const pattern of courtPatterns) {
    const matches = textSample.match(pattern);
    if (matches) courtScore += matches.length;
  }
  
  for (const pattern of legalPatterns) {
    const matches = textSample.match(pattern);
    if (matches) legalScore += matches.length;
  }
  
  for (const pattern of contractPatterns) {
    const matches = textSample.match(pattern);
    if (matches) contractScore += matches.length;
  }
  
  // Проверяем наличие структуры статей В НАЧАЛЕ СТРОКИ (для кодексов)
  const articleMatches = text.match(/^Статья\s+\d+/gim);
  if (articleMatches && articleMatches.length >= 3) {
    legalScore += 10;
  }
  
  // Проверяем бизнес-структуру: "1. НАЗВАНИЕ", "2.1 Подраздел"
  const mainSectionMatches = textSample.match(/^\d+\.\s+[A-ZА-ЯЁ][A-ZА-ЯЁ\s\(\)]+$/gm);
  const subSectionMatches = textSample.match(/^\d+\.\d+\s+.+$/gm);
  
  if (mainSectionMatches) businessScore += mainSectionMatches.length * 2;
  if (subSectionMatches) businessScore += subSectionMatches.length;
  
  console.log(`Document type detection - Court: ${courtScore}, Legal: ${legalScore}, Contract: ${contractScore}, Business: ${businessScore}`);
  
  // Судебные документы имеют приоритет над legal (т.к. содержат ссылки на статьи, но это не кодекс)
  if (courtScore >= 8) return 'court';
  if (legalScore >= 10 && articleMatches && articleMatches.length >= 3) return 'legal';
  if (contractScore >= 3) return 'contract';
  if (businessScore >= 4) return 'business';
  if (courtScore >= 4) return 'court'; // Более мягкий порог для судебных документов
  
  return 'general';
}

// ============= HIERARCHICAL STRUCTURE PARSER =============

function extractStructureFromLine(line: string): {
  type: 'part' | 'section' | 'subsection' | 'chapter' | 'paragraph' | 'article' | null;
  number: string | null;
  title: string | null;
} {
  const trimmedLine = line.trim();
  
  // Проверяем статьи первыми (наиболее важные)
  const articleMatch = trimmedLine.match(STRUCTURE_PATTERNS.article);
  if (articleMatch) {
    return { type: 'article', number: articleMatch[1], title: articleMatch[2]?.trim() || null };
  }
  
  // Главы
  const chapterMatch = trimmedLine.match(STRUCTURE_PATTERNS.chapter);
  if (chapterMatch) {
    return { type: 'chapter', number: chapterMatch[1], title: chapterMatch[2]?.trim() || null };
  }
  
  // Разделы
  const sectionMatch = trimmedLine.match(STRUCTURE_PATTERNS.section);
  if (sectionMatch) {
    return { type: 'section', number: sectionMatch[1], title: sectionMatch[2]?.trim() || null };
  }
  
  // Подразделы
  const subsectionMatch = trimmedLine.match(STRUCTURE_PATTERNS.subsection);
  if (subsectionMatch) {
    return { type: 'subsection', number: subsectionMatch[1], title: subsectionMatch[2]?.trim() || null };
  }
  
  // Части
  const partMatch = trimmedLine.match(STRUCTURE_PATTERNS.part);
  if (partMatch && trimmedLine.toUpperCase().includes('ЧАСТЬ')) {
    return { type: 'part', number: partMatch[1], title: partMatch[2]?.trim() || null };
  }
  
  // Параграфы
  const paragraphMatch = trimmedLine.match(STRUCTURE_PATTERNS.paragraph);
  if (paragraphMatch) {
    return { type: 'paragraph', number: paragraphMatch[1], title: paragraphMatch[2]?.trim() || null };
  }
  
  return { type: null, number: null, title: null };
}

function buildContextPath(structure: DocumentStructure): string {
  const parts: string[] = [];
  
  if (structure.currentPart) parts.push(structure.currentPart);
  if (structure.currentSection) parts.push(structure.currentSection);
  if (structure.currentChapter) parts.push(structure.currentChapter);
  
  return parts.join(' > ') || 'Документ';
}

function parseStructuredDocument(text: string): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  const lines = text.split(/\n/);
  
  const structure: DocumentStructure = {
    currentPart: null,
    currentSection: null,
    currentChapter: null,
    currentArticle: null,
  };
  
  let currentChunkContent: string[] = [];
  let currentChunkType: ChunkType = 'general';
  let currentArticleNumber: string | null = null;
  let currentSectionTitle: string | null = null;
  
  const flushChunk = () => {
    const content = currentChunkContent.join('\n').trim();
    if (content.length > 50) { // Минимальная длина чанка
      chunks.push({
        content,
        section_title: currentSectionTitle || structure.currentChapter,
        article_number: currentArticleNumber,
        chunk_type: currentChunkType,
        parent_context: buildContextPath(structure),
      });
    }
    currentChunkContent = [];
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const extracted = extractStructureFromLine(line);
    
    if (extracted.type) {
      // Обнаружен структурный элемент
      switch (extracted.type) {
        case 'part':
          flushChunk();
          structure.currentPart = `Часть ${extracted.number}${extracted.title ? '. ' + extracted.title : ''}`;
          structure.currentSection = null;
          structure.currentChapter = null;
          currentChunkType = 'header';
          currentArticleNumber = null;
          currentSectionTitle = structure.currentPart;
          currentChunkContent.push(line);
          break;
          
        case 'section':
          flushChunk();
          structure.currentSection = `Раздел ${extracted.number}${extracted.title ? '. ' + extracted.title : ''}`;
          structure.currentChapter = null;
          currentChunkType = 'header';
          currentArticleNumber = null;
          currentSectionTitle = structure.currentSection;
          currentChunkContent.push(line);
          break;
          
        case 'subsection':
          flushChunk();
          const subsectionTitle = `Подраздел ${extracted.number}${extracted.title ? '. ' + extracted.title : ''}`;
          currentChunkType = 'header';
          currentArticleNumber = null;
          currentSectionTitle = subsectionTitle;
          currentChunkContent.push(line);
          break;
          
        case 'chapter':
          flushChunk();
          structure.currentChapter = `Глава ${extracted.number}${extracted.title ? '. ' + extracted.title : ''}`;
          currentChunkType = 'header';
          currentArticleNumber = null;
          currentSectionTitle = structure.currentChapter;
          currentChunkContent.push(line);
          break;
          
        case 'paragraph':
          flushChunk();
          currentChunkType = 'paragraph';
          currentArticleNumber = null;
          currentSectionTitle = `§ ${extracted.number}${extracted.title ? '. ' + extracted.title : ''}`;
          currentChunkContent.push(line);
          break;
          
        case 'article':
          flushChunk();
          currentChunkType = 'article';
          currentArticleNumber = extracted.number;
          currentSectionTitle = structure.currentChapter;
          structure.currentArticle = extracted.number;
          currentChunkContent.push(line);
          break;
      }
    } else {
      // Обычная строка - добавляем к текущему чанку
      currentChunkContent.push(line);
      
      // Если чанк становится слишком большим, разбиваем его
      const currentLength = currentChunkContent.join('\n').length;
      if (currentLength > 3000) {
        // Разбиваем большую статью по пунктам
        const content = currentChunkContent.join('\n');
        const pointChunks = splitByPoints(content, currentArticleNumber, currentSectionTitle, buildContextPath(structure));
        
        if (pointChunks.length > 1) {
          chunks.push(...pointChunks);
          currentChunkContent = [];
        } else {
          // Если не удалось разбить по пунктам, принудительно сбрасываем
          flushChunk();
        }
      }
    }
  }
  
  // Не забываем последний чанк
  flushChunk();
  
  return chunks;
}

// ============= SPLIT LARGE ARTICLES BY POINTS =============

function splitByPoints(
  content: string,
  articleNumber: string | null,
  sectionTitle: string | null,
  parentContext: string
): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  
  // Паттерны для пунктов внутри статей
  // 1) или 1. - пункты
  // а) или a) - подпункты
  const pointPattern = /^(\d+)[.)]\s+/gm;
  
  const parts = content.split(pointPattern);
  
  if (parts.length <= 2) {
    // Не удалось разбить по пунктам
    return [{
      content: content.trim(),
      section_title: sectionTitle,
      article_number: articleNumber,
      chunk_type: 'article',
      parent_context: parentContext,
    }];
  }
  
  // Первая часть - заголовок статьи
  let currentContent = parts[0];
  let currentPointNum = '';
  
  for (let i = 1; i < parts.length; i += 2) {
    const pointNum = parts[i];
    const pointContent = parts[i + 1] || '';
    
    // Сохраняем предыдущий пункт
    if (currentContent.trim().length > 50) {
      chunks.push({
        content: currentContent.trim(),
        section_title: sectionTitle,
        article_number: articleNumber,
        chunk_type: currentPointNum ? 'point' : 'article',
        parent_context: currentPointNum 
          ? `${parentContext} > п. ${currentPointNum}` 
          : parentContext,
      });
    }
    
    currentContent = `${pointNum}) ${pointContent}`;
    currentPointNum = pointNum;
  }
  
  // Последний пункт
  if (currentContent.trim().length > 50) {
    chunks.push({
      content: currentContent.trim(),
      section_title: sectionTitle,
      article_number: articleNumber,
      chunk_type: currentPointNum ? 'point' : 'article',
      parent_context: currentPointNum 
        ? `${parentContext} > п. ${currentPointNum}` 
        : parentContext,
    });
  }
  
  return chunks;
}

// ============= BUSINESS DOCUMENT PARSER =============

function parseBusinessDocument(text: string): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  const lines = text.split(/\n/);
  
  const structure: BusinessDocumentStructure = {
    currentMainSection: null,
    currentMainSectionNumber: null,
    currentSubSection: null,
    currentSubSectionNumber: null,
  };
  
  let currentChunkContent: string[] = [];
  let currentChunkType: ChunkType = 'general';
  let currentSectionTitle: string | null = null;
  let currentArticleNumber: string | null = null;
  
  const buildBusinessContext = (): string => {
    const parts: string[] = ['Документ'];
    if (structure.currentMainSection) parts.push(structure.currentMainSection);
    if (structure.currentSubSection) parts.push(structure.currentSubSection);
    return parts.join(' > ');
  };
  
  const flushChunk = () => {
    const content = currentChunkContent.join('\n').trim();
    if (content.length > 50) {
      chunks.push({
        content,
        section_title: currentSectionTitle,
        article_number: currentArticleNumber,
        chunk_type: currentChunkType,
        parent_context: buildBusinessContext(),
      });
    }
    currentChunkContent = [];
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Проверяем под-подразделы первыми (3.1.1)
    const subSubMatch = trimmedLine.match(BUSINESS_PATTERNS.subSubSection);
    if (subSubMatch) {
      flushChunk();
      currentArticleNumber = subSubMatch[1];
      currentSectionTitle = `${subSubMatch[1]} ${subSubMatch[2]}`;
      currentChunkType = 'section';
      currentChunkContent.push(line);
      continue;
    }
    
    // Проверяем подразделы (3.1, 4.2)
    const subMatch = trimmedLine.match(BUSINESS_PATTERNS.subSection);
    if (subMatch) {
      flushChunk();
      structure.currentSubSection = `${subMatch[1]} ${subMatch[2]}`;
      structure.currentSubSectionNumber = subMatch[1];
      currentArticleNumber = subMatch[1];
      currentSectionTitle = `${subMatch[1]} ${subMatch[2]}`;
      currentChunkType = 'section';
      currentChunkContent.push(line);
      continue;
    }
    
    // Проверяем главные разделы (1. НАЗВАНИЕ)
    const mainMatch = trimmedLine.match(BUSINESS_PATTERNS.mainSection);
    if (mainMatch) {
      flushChunk();
      structure.currentMainSection = `${mainMatch[1]}. ${mainMatch[2]}`;
      structure.currentMainSectionNumber = mainMatch[1];
      structure.currentSubSection = null;
      structure.currentSubSectionNumber = null;
      currentArticleNumber = mainMatch[1];
      currentSectionTitle = `${mainMatch[1]}. ${mainMatch[2]}`;
      currentChunkType = 'header';
      currentChunkContent.push(line);
      continue;
    }
    
    // Обычная строка
    currentChunkContent.push(line);
    
    // Если чанк слишком большой, сбрасываем
    const currentLength = currentChunkContent.join('\n').length;
    if (currentLength > 2500) {
      flushChunk();
      currentChunkType = 'paragraph';
    }
  }
  
  flushChunk();
  
  return chunks;
}

// ============= COURT DOCUMENT PARSER =============

interface CourtDocumentStructure {
  caseNumber: string | null;
  court: string | null;
  currentSection: string | null;
}

function parseCourtDocument(text: string): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  
  // Извлекаем номер дела
  const caseMatch = text.match(/Дело\s*№?\s*([A-ZА-ЯЁ0-9\-\/]+)/i);
  const caseNumber = caseMatch ? caseMatch[1] : null;
  
  // Определяем суд
  const courtMatch = text.match(/(Суд\s+по\s+интеллектуальным\s+правам|Арбитражн\w+\s+суд\s+[^\n,]+)/i);
  const court = courtMatch ? courtMatch[1].trim() : null;
  
  const structure: CourtDocumentStructure = {
    caseNumber,
    court,
    currentSection: 'Вводная часть',
  };
  
  // Разбиваем по секциям судебного решения
  const sections: { name: string; content: string }[] = [];
  
  // Паттерны секций
  const sectionPatterns = [
    { pattern: /УСТАНОВИЛ\s*:/i, name: 'Описательная часть (УСТАНОВИЛ)' },
    { pattern: /РЕШИЛ\s*:/i, name: 'Резолютивная часть (РЕШИЛ)' },
    { pattern: /ПОСТАНОВИЛ\s*:/i, name: 'Резолютивная часть (ПОСТАНОВИЛ)' },
    { pattern: /ОПРЕДЕЛИЛ\s*:/i, name: 'Резолютивная часть (ОПРЕДЕЛИЛ)' },
    { pattern: /На основании изложенного/i, name: 'Резолютивная часть' },
    { pattern: /Руководствуясь статьями?/i, name: 'Правовое обоснование' },
  ];
  
  // Разбиваем текст на части
  let remainingText = text;
  let introEnd = text.length;
  
  for (const { pattern, name } of sectionPatterns) {
    const match = remainingText.match(pattern);
    if (match && match.index !== undefined) {
      introEnd = Math.min(introEnd, match.index);
    }
  }
  
  // Вводная часть
  const intro = text.slice(0, introEnd).trim();
  if (intro.length > 100) {
    sections.push({ name: 'Вводная часть', content: intro });
  }
  
  // Находим все секции
  let lastEnd = introEnd;
  const sectionMatches: { index: number; name: string; pattern: RegExp }[] = [];
  
  for (const { pattern, name } of sectionPatterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      sectionMatches.push({ index: match.index, name, pattern });
    }
  }
  
  // Сортируем по позиции
  sectionMatches.sort((a, b) => a.index - b.index);
  
  for (let i = 0; i < sectionMatches.length; i++) {
    const current = sectionMatches[i];
    const next = sectionMatches[i + 1];
    const endIndex = next ? next.index : text.length;
    const sectionContent = text.slice(current.index, endIndex).trim();
    
    if (sectionContent.length > 100) {
      sections.push({ name: current.name, content: sectionContent });
    }
  }
  
  // Если секций мало, разбиваем по ссылкам на нормы права
  if (sections.length < 2) {
    // Fallback: разбиваем по абзацам с извлечением ссылок на нормы
    return parseCourtDocumentByReferences(text, caseNumber, court);
  }
  
  // Создаём чанки из секций
  for (const section of sections) {
    // Если секция большая, разбиваем на подчанки
    if (section.content.length > 3000) {
      const subChunks = splitCourtSectionByParagraphs(section.content, section.name, caseNumber, court);
      chunks.push(...subChunks);
    } else {
      chunks.push({
        content: section.content,
        section_title: section.name,
        article_number: caseNumber,
        chunk_type: 'section',
        parent_context: court ? `${court} > Дело ${caseNumber}` : `Дело ${caseNumber}`,
      });
    }
  }
  
  return chunks;
}

function splitCourtSectionByParagraphs(
  content: string,
  sectionName: string,
  caseNumber: string | null,
  court: string | null
): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  const parentContext = court ? `${court} > Дело ${caseNumber}` : `Дело ${caseNumber}`;
  
  // Разбиваем по абзацам (двойной перенос строки)
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  
  let currentChunk = '';
  let chunkIndex = 1;
  
  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).length > 2500 && currentChunk.length > 200) {
      // Извлекаем ссылки на нормы из чанка
      const lawRefs = currentChunk.match(COURT_PATTERNS.lawReference);
      const lawRefsStr = lawRefs ? lawRefs.slice(0, 3).join(', ') : null;
      
      chunks.push({
        content: currentChunk.trim(),
        section_title: lawRefsStr ? `${sectionName} (${lawRefsStr})` : sectionName,
        article_number: caseNumber,
        chunk_type: 'paragraph',
        parent_context: `${parentContext} > ${sectionName} > Часть ${chunkIndex}`,
      });
      currentChunk = para;
      chunkIndex++;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
    }
  }
  
  // Последний чанк
  if (currentChunk.trim().length > 100) {
    const lawRefs = currentChunk.match(COURT_PATTERNS.lawReference);
    const lawRefsStr = lawRefs ? lawRefs.slice(0, 3).join(', ') : null;
    
    chunks.push({
      content: currentChunk.trim(),
      section_title: lawRefsStr ? `${sectionName} (${lawRefsStr})` : sectionName,
      article_number: caseNumber,
      chunk_type: 'paragraph',
      parent_context: `${parentContext} > ${sectionName} > Часть ${chunkIndex}`,
    });
  }
  
  return chunks;
}

function parseCourtDocumentByReferences(
  text: string,
  caseNumber: string | null,
  court: string | null
): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  const parentContext = court ? `${court} > Дело ${caseNumber}` : `Дело ${caseNumber}`;
  
  // Разбиваем по абзацам
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  
  let currentChunk = '';
  let chunkIndex = 1;
  
  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).length > 2500 && currentChunk.length > 200) {
      // Извлекаем ссылки на нормы из чанка
      const lawRefs = currentChunk.match(COURT_PATTERNS.lawReference);
      const lawRefsStr = lawRefs ? lawRefs.slice(0, 3).join(', ') : null;
      
      chunks.push({
        content: currentChunk.trim(),
        section_title: lawRefsStr || 'Судебное решение',
        article_number: caseNumber,
        chunk_type: 'paragraph',
        parent_context: `${parentContext} > Часть ${chunkIndex}`,
      });
      currentChunk = para;
      chunkIndex++;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
    }
  }
  
  // Последний чанк
  if (currentChunk.trim().length > 100) {
    const lawRefs = currentChunk.match(COURT_PATTERNS.lawReference);
    const lawRefsStr = lawRefs ? lawRefs.slice(0, 3).join(', ') : null;
    
    chunks.push({
      content: currentChunk.trim(),
      section_title: lawRefsStr || 'Судебное решение',
      article_number: caseNumber,
      chunk_type: 'paragraph',
      parent_context: `${parentContext} > Часть ${chunkIndex}`,
    });
  }
  
  return chunks;
}

// ============= FALLBACK: SIMPLE CHUNKING FOR GENERAL DOCUMENTS =============

// ============= CSV PARSER =============

function parseCSVToText(csvText: string, fileName: string): string {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return '';
  
  // Detect delimiter (comma, semicolon, or tab)
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes(';') && !firstLine.includes(',')) {
    delimiter = ';';
  } else if (firstLine.includes('\t')) {
    delimiter = '\t';
  }
  
  // Parse CSV with simple split (handles most cases)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCSVLine(line));
  
  // Format as structured text for better chunking
  const textParts: string[] = [`[CSV Document: ${fileName}]`, `Столбцы: ${headers.join(', ')}`, ''];
  
  // Group rows into chunks of 20 for readability
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowText = headers.map((header, idx) => {
      const value = row[idx] || '';
      return value ? `${header}: ${value}` : null;
    }).filter(Boolean).join('; ');
    
    if (rowText) {
      textParts.push(`Строка ${i + 1}: ${rowText}`);
    }
    
    // Add blank line every 20 rows for chunking
    if ((i + 1) % 20 === 0 && i < rows.length - 1) {
      textParts.push('');
    }
  }
  
  return textParts.join('\n');
}

// ============= XLSX PARSER =============

function parseXLSXSheetToText(sheetXml: string, sharedStrings: string[], fileName: string): string {
  const rows: string[][] = [];
  
  // Parse rows from sheet XML
  const rowMatches = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  
  for (const rowXml of rowMatches) {
    const cells: { col: number; value: string }[] = [];
    const cellMatches = rowXml.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
    
    for (const cellXml of cellMatches) {
      // Get cell reference (e.g., "A1", "B2")
      const refMatch = cellXml.match(/r="([A-Z]+)(\d+)"/);
      if (!refMatch) continue;
      
      const colLetter = refMatch[1];
      const colNum = colLetter.split('').reduce((acc, char, i, arr) => {
        return acc + (char.charCodeAt(0) - 64) * Math.pow(26, arr.length - 1 - i);
      }, 0) - 1;
      
      // Get cell value
      const valueMatch = cellXml.match(/<v>([^<]*)<\/v>/);
      let value = valueMatch ? valueMatch[1] : '';
      
      // Check if it's a shared string reference
      const isSharedString = cellXml.includes('t="s"');
      if (isSharedString && sharedStrings.length > 0) {
        const ssIndex = parseInt(value, 10);
        if (!isNaN(ssIndex) && ssIndex < sharedStrings.length) {
          value = sharedStrings[ssIndex];
        }
      }
      
      cells.push({ col: colNum, value });
    }
    
    if (cells.length > 0) {
      const maxCol = Math.max(...cells.map(c => c.col));
      const rowArr = new Array(maxCol + 1).fill('');
      cells.forEach(c => { rowArr[c.col] = c.value; });
      rows.push(rowArr);
    }
  }
  
  if (rows.length === 0) return '';
  
  // Assume first row is headers
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Format as structured text
  const textParts: string[] = [`[Excel Document: ${fileName}]`, `Столбцы: ${headers.filter(h => h).join(', ')}`, ''];
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowText = headers.map((header, idx) => {
      const value = row[idx] || '';
      return value && header ? `${header}: ${value}` : null;
    }).filter(Boolean).join('; ');
    
    if (rowText) {
      textParts.push(`Строка ${i + 1}: ${rowText}`);
    }
    
    if ((i + 1) % 20 === 0 && i < dataRows.length - 1) {
      textParts.push('');
    }
  }
  
  return textParts.join('\n');
}

// ============= SIMPLE CHUNKING FALLBACK =============

function chunkTextSimple(text: string, chunkSize: number = 2000): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return [];

  // Пытаемся разбить по абзацам
  const paragraphs = cleanText.split(/\n\n+/);
  let currentChunk = '';
  
  for (const para of paragraphs) {
    if ((currentChunk + ' ' + para).length > chunkSize && currentChunk.length > 100) {
      chunks.push({
        content: currentChunk.trim(),
        section_title: null,
        article_number: null,
        chunk_type: 'paragraph',
        parent_context: 'Документ',
      });
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
    }
  }
  
  // Остаток
  if (currentChunk.trim().length > 50) {
    chunks.push({
      content: currentChunk.trim(),
      section_title: null,
      article_number: null,
      chunk_type: 'paragraph',
      parent_context: 'Документ',
    });
  }
  
  // Если всё ещё слишком большие чанки, разбиваем принудительно
  const finalChunks: StructuredChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.content.length > chunkSize * 1.5) {
      // Принудительное разбиение
      let start = 0;
      while (start < chunk.content.length) {
        let end = Math.min(start + chunkSize, chunk.content.length);
        if (end < chunk.content.length) {
          const lastSpace = chunk.content.lastIndexOf(' ', end);
          if (lastSpace > start + chunkSize / 2) {
            end = lastSpace;
          }
        }
        finalChunks.push({
          ...chunk,
          content: chunk.content.slice(start, end).trim(),
        });
        start = end;
      }
    } else {
      finalChunks.push(chunk);
    }
  }
  
  return finalChunks;
}

// ============= REGISTRATION DECISION PARSER (Роспатент) =============

function parseRegistrationDecision(text: string): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  
  console.log('Parsing registration decision, text length:', text.length);
  
  // Извлекаем номера заявки и регистрации
  const appMatch = text.match(/Заявка\s*№?\s*([\d\/]+)/i);
  const applicationNumber = appMatch ? appMatch[1] : null;
  
  const regMatch = text.match(/регистрации?\s*(?:№|номер)?\s*(\d+)/i);
  const registrationNumber = regMatch ? regMatch[1] : null;
  
  console.log(`Found application: ${applicationNumber}, registration: ${registrationNumber}`);
  
  // Маркеры секций для непрерывного текста (ищем внутри текста, не в начале строки)
  const sectionSplitters = [
    { pattern: /ЗАКЛЮЧЕНИЕ ПО РЕЗУЛЬТАТАМ ЭКСПЕРТИЗЫ/gi, name: 'Заключение экспертизы' },
    { pattern: /\(210\)\s*Заявка/gi, name: 'Реквизиты заявки' },
    { pattern: /\(220\)\s*Дата подачи/gi, name: 'Дата подачи' },
    { pattern: /\(511\)\s*Классы МКТУ/gi, name: 'Классы МКТУ' },
    { pattern: /\(540\)\s*Воспроизведение знака/gi, name: 'Воспроизведение знака' },
    { pattern: /\(550\)\s*Указание/gi, name: 'Указание о виде знака' },
    { pattern: /\(731\)\s*Имя и адрес/gi, name: 'Заявитель' },
    { pattern: /В результате экспертизы/gi, name: 'Результат экспертизы' },
    { pattern: /статьей?\s*1499\s*Гражданского кодекса/gi, name: 'Правовое основание' },
    { pattern: /в отношении приведённого ниже перечня/gi, name: 'Перечень товаров и услуг' },
    { pattern: /Р\s*Е\s*Ш\s*Е\s*Н\s*И\s*Е/g, name: 'Решение' },
  ];
  
  // Собираем все позиции разделителей
  interface SplitPoint {
    index: number;
    name: string;
  }
  
  const splitPoints: SplitPoint[] = [];
  
  for (const splitter of sectionSplitters) {
    let match;
    const regex = new RegExp(splitter.pattern.source, 'gi');
    while ((match = regex.exec(text)) !== null) {
      splitPoints.push({ index: match.index, name: splitter.name });
    }
  }
  
  // Сортируем по позиции
  splitPoints.sort((a, b) => a.index - b.index);
  
  console.log(`Found ${splitPoints.length} split points`);
  
  // Если нашли маркеры - разбиваем по ним
  if (splitPoints.length >= 2) {
    // Добавляем начало и конец
    const points = [
      { index: 0, name: 'Заголовок документа' },
      ...splitPoints,
      { index: text.length, name: 'Конец' }
    ];
    
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i].index;
      const end = points[i + 1].index;
      const content = text.slice(start, end).trim();
      
      if (content.length > 100) {
        chunks.push({
          content,
          section_title: points[i].name,
          article_number: applicationNumber || registrationNumber,
          chunk_type: 'registration',
          parent_context: `Решение Роспатента${applicationNumber ? ` по заявке ${applicationNumber}` : ''}`,
        });
      }
    }
  }
  
  // Если маркеры не сработали, разбиваем по классам МКТУ
  if (chunks.length < 3) {
    console.log('Splitting by MKTU classes...');
    
    // Ищем классы МКТУ: "09 -", "35 -", "38 -", "42 -"
    const mktuPattern = /(?:^|\s)(\d{2})\s*[-–]\s+/g;
    const mktuMatches: { index: number; classNum: string }[] = [];
    let match;
    
    while ((match = mktuPattern.exec(text)) !== null) {
      const classNum = match[1];
      // Проверяем что это похоже на класс МКТУ (01-45)
      const num = parseInt(classNum);
      if (num >= 1 && num <= 45) {
        mktuMatches.push({ index: match.index, classNum });
      }
    }
    
    if (mktuMatches.length >= 2) {
      console.log(`Found ${mktuMatches.length} MKTU classes`);
      
      // Берём текст до первого класса как заголовок
      const headerEnd = mktuMatches[0].index;
      const headerContent = text.slice(0, headerEnd).trim();
      
      if (headerContent.length > 200) {
        chunks.length = 0; // Очищаем предыдущие попытки
        chunks.push({
          content: headerContent,
          section_title: 'Реквизиты и заявитель',
          article_number: applicationNumber || registrationNumber,
          chunk_type: 'registration',
          parent_context: `Решение Роспатента${applicationNumber ? ` по заявке ${applicationNumber}` : ''}`,
        });
      }
      
      // Каждый класс МКТУ - отдельный чанк
      for (let i = 0; i < mktuMatches.length; i++) {
        const start = mktuMatches[i].index;
        const end = i < mktuMatches.length - 1 ? mktuMatches[i + 1].index : text.length;
        const content = text.slice(start, end).trim();
        
        if (content.length > 50) {
          chunks.push({
            content,
            section_title: `Класс МКТУ ${mktuMatches[i].classNum}`,
            article_number: applicationNumber || registrationNumber,
            chunk_type: 'registration',
            parent_context: `Решение Роспатента${applicationNumber ? ` по заявке ${applicationNumber}` : ''}`,
          });
        }
      }
    }
  }
  
  // Fallback: если ничего не помогло, разбиваем на фиксированные чанки с умным разделением
  if (chunks.length < 3 && text.length > 1000) {
    console.log('Using smart fixed-size chunking for registration decision...');
    chunks.length = 0;
    
    // Разбиваем на чанки ~1500 символов, стараясь резать по предложениям
    const targetSize = 1500;
    let start = 0;
    let chunkNum = 0;
    
    while (start < text.length) {
      let end = Math.min(start + targetSize, text.length);
      
      // Ищем конец предложения (. или ) ближайший к target)
      if (end < text.length) {
        const searchWindow = text.slice(end - 200, end + 200);
        const sentenceEnd = searchWindow.search(/[.)] /);
        if (sentenceEnd !== -1) {
          end = end - 200 + sentenceEnd + 2;
        }
      }
      
      const content = text.slice(start, end).trim();
      if (content.length > 100) {
        chunkNum++;
        
        // Определяем название секции по содержимому
        let sectionName = `Часть ${chunkNum}`;
        if (content.includes('ФЕДЕРАЛЬНАЯ СЛУЖБА')) sectionName = 'Заголовок';
        else if (content.includes('Классы МКТУ') || content.match(/\d{2}\s*[-–]/)) sectionName = 'Классы МКТУ';
        else if (content.includes('статьей 1499') || content.includes('Гражданского кодекса')) sectionName = 'Правовое основание';
        else if (content.includes('ЗАКЛЮЧЕНИЕ')) sectionName = 'Заключение экспертизы';
        else if (content.includes('заявитель') || content.includes('адрес')) sectionName = 'Сведения о заявителе';
        
        chunks.push({
          content,
          section_title: sectionName,
          article_number: applicationNumber || registrationNumber,
          chunk_type: 'registration',
          parent_context: `Решение Роспатента${applicationNumber ? ` по заявке ${applicationNumber}` : ''}`,
        });
      }
      
      start = end;
    }
  }
  
  console.log(`Created ${chunks.length} chunks from registration decision`);
  return chunks;
}

// ============= MAIN PROCESSING FUNCTION =============

function processDocumentText(text: string, fileName: string, manualType?: string): StructuredChunk[] {
  console.log(`Processing document: ${fileName}, text length: ${text.length}, manual type: ${manualType || 'none'}`);
  
  // Определяем тип документа: ручной или автоматический
  let docType: DocumentType;
  if (manualType && manualType !== 'auto') {
    docType = manualType as DocumentType;
    console.log(`Using manual document type: ${docType}`);
  } else {
    docType = detectDocumentType(text);
    console.log(`Detected document type: ${docType}`);
  }
  
  let chunks: StructuredChunk[];
  
  if (docType === 'registration_decision') {
    chunks = parseRegistrationDecision(text);
    console.log(`Parsed ${chunks.length} structured chunks from registration decision`);
    
    if (chunks.length < 3 && text.length > 1000) {
      console.log('Registration decision parsing yielded few results, falling back to simple chunking');
      chunks = chunkTextSimple(text);
    }
  } else if (docType === 'court') {
    chunks = parseCourtDocument(text);
    console.log(`Parsed ${chunks.length} structured chunks from court document`);
    
    // Fallback если парсинг судебного документа дал мало результатов
    if (chunks.length < 3 && text.length > 1000) {
      console.log('Court parsing yielded few results, falling back to simple chunking');
      chunks = chunkTextSimple(text);
    }
  } else if (docType === 'legal') {
    chunks = parseStructuredDocument(text);
    console.log(`Parsed ${chunks.length} structured chunks from legal document`);
    
    // Если структурный парсинг дал мало результатов, используем fallback
    if (chunks.length < 3 && text.length > 1000) {
      console.log('Structured parsing yielded few results, falling back to simple chunking');
      chunks = chunkTextSimple(text);
    }
  } else if (docType === 'business') {
    chunks = parseBusinessDocument(text);
    console.log(`Parsed ${chunks.length} structured chunks from business document`);
    
    // Fallback если бизнес-парсинг дал мало результатов
    if (chunks.length < 3 && text.length > 1000) {
      console.log('Business parsing yielded few results, falling back to simple chunking');
      chunks = chunkTextSimple(text);
    }
  } else {
    chunks = chunkTextSimple(text);
    console.log(`Created ${chunks.length} simple chunks`);
  }
  
  // Логируем статистику
  const articleChunks = chunks.filter(c => c.chunk_type === 'article').length;
  const headerChunks = chunks.filter(c => c.chunk_type === 'header').length;
  const sectionChunks = chunks.filter(c => c.chunk_type === 'section').length;
  const pointChunks = chunks.filter(c => c.chunk_type === 'point').length;
  const registrationChunks = chunks.filter(c => c.chunk_type === 'registration').length;
  console.log(`Chunk types: articles=${articleChunks}, headers=${headerChunks}, sections=${sectionChunks}, points=${pointChunks}, registration=${registrationChunks}`);
  
  return chunks;
}

// ============= EMBEDDING AND SANITIZATION =============

function createSimpleEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (i + 1) * (j + 1)) % 1536;
      embedding[index] += 0.1 / (1 + Math.sqrt(i));
    }
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = Math.round(embedding[i] / magnitude * 1000000) / 1000000;
    }
  }
  
  return embedding;
}

function sanitizeText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0) continue;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    if (code === 127) continue;
    if (code === 0xFFFE || code === 0xFFFF) continue;
    if (code >= 0xD800 && code <= 0xDFFF) {
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          result += text[i] + text[i + 1];
          i++;
          continue;
        }
      }
      continue;
    }
    result += text[i];
  }
  
  // Для структурного парсинга сохраняем переносы строк!
  result = result
    .replace(/\\/g, ' ')
    .replace(/[ \t]+/g, ' ')  // Заменяем только пробелы и табы, не переносы
    .replace(/\n{3,}/g, '\n\n')  // Максимум 2 переноса подряд
    .trim();
  
  return result;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { document_id }: ProcessRequest = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: 'document_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing document: ${document_id}`);

    // Get document info
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single();

    if (docError || !doc) {
      console.error('Document not found:', docError);
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect stuck documents: if already "processing" for > 5 minutes, reset to error
    if (doc.status === 'processing') {
      const updatedAt = new Date(doc.updated_at || doc.created_at);
      const minutesElapsed = (Date.now() - updatedAt.getTime()) / 60000;
      if (minutesElapsed > 5) {
        console.log(`Document stuck in processing for ${minutesElapsed.toFixed(0)} minutes, resetting to error`);
        await supabase.from('documents').update({ status: 'error' }).eq('id', document_id);
        return new Response(JSON.stringify({ 
          error: 'Document was stuck in processing. Reset to error. Please retry.' 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Check file size limit (10 MB max for edge functions)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (doc.file_size && doc.file_size > MAX_FILE_SIZE) {
      console.error(`File too large: ${doc.file_size} bytes (max ${MAX_FILE_SIZE})`);
      await supabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', document_id);
      return new Response(
        JSON.stringify({ 
          error: 'File too large', 
          message: `Файл слишком большой (${(doc.file_size / (1024 * 1024)).toFixed(1)} MB). Максимум: 10 MB` 
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', document_id);

    try {
      // Download file from storage
      if (!doc.storage_path) {
        throw new Error('No storage path for document');
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('rag-documents')
        .download(doc.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      console.log(`Downloaded file: ${doc.storage_path}, size: ${fileData.size}`);

      // Extract text based on file type
      let text = '';
      const fileType = doc.file_type || '';
      const fileName = doc.file_name?.toLowerCase() || '';
      
      // IMPORTANT: Check file extensions FIRST (before MIME types) since MIME can be unreliable
      // Priority: Extension > MIME type to avoid misidentification
      
      // 1. DOCX - Check FIRST because MIME types for Office files are often wrong
      if (
        fileName.endsWith('.docx') ||
        fileName.endsWith('.doc')
      ) {
        console.log('Processing DOCX/Word document by extension...');
        
        try {
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          
          if (fileName.endsWith('.docx')) {
            // DOCX - это ZIP архив. Используем библиотеку для распаковки и парсинга
            const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
            const zip = await JSZip.loadAsync(bytes);
            
            // Главный контент находится в word/document.xml
            const documentXml = await zip.file("word/document.xml")?.async("string");
            
            if (documentXml) {
              // Восстанавливаем абзацы - каждый <w:p> это параграф
              const paragraphs: string[] = [];
              const pMatches = documentXml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];
              
              for (const pMatch of pMatches) {
                const textParts = pMatch.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
                const paraText = textParts
                  .map(t => t.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
                  .join('');
                if (paraText.trim()) {
                  paragraphs.push(paraText.trim());
                }
              }
              
              text = paragraphs.join('\n\n');
              
              console.log(`Extracted ${paragraphs.length} paragraphs from DOCX, text length: ${text.length}`);
            }
            
            // Декодируем HTML entities если есть
            text = text
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
          } else {
            // DOC (старый формат) - пробуем извлечь текст
            console.log('Processing legacy .doc file...');
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const rawText = decoder.decode(bytes);
            
            // Извлекаем читаемый текст из бинарного DOC
            const textParts = rawText.match(/[A-Za-zА-Яа-яЁё0-9\s.,;:!?()«»"\-—–]{10,}/g) || [];
            text = textParts.join(' ').replace(/\s+/g, ' ').trim();
          }
        } catch (docxError) {
          console.error('DOCX extraction failed:', docxError);
          text = `[DOCX Document: ${doc.file_name}] - Не удалось извлечь текст. Ошибка: ${docxError}`;
        }
        
        if (text.length < 100) {
          text = `[DOCX Document: ${doc.file_name}] - Не удалось извлечь текст из документа.`;
        }
      } else if (
        fileName.endsWith('.csv') || 
        fileType.includes('csv')
      ) {
        // 2. CSV Processing
        console.log('Processing CSV file...');
        
        try {
          const csvText = await fileData.text();
          text = parseCSVToText(csvText, doc.file_name || 'data.csv');
          console.log(`Parsed CSV, text length: ${text.length}`);
        } catch (csvError) {
          console.error('CSV extraction failed:', csvError);
          text = `[CSV Document: ${doc.file_name}] - Не удалось извлечь текст. Ошибка: ${csvError}`;
        }
      } else if (
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls') ||
        fileType.includes('spreadsheet') ||
        fileType.includes('excel') ||
        fileType.includes('vnd.ms-excel')
      ) {
        // 3. Excel XLS/XLSX Processing
        console.log('Processing Excel file:', fileName);
        
        try {
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          
          if (fileName.endsWith('.xlsx')) {
            // XLSX is a ZIP archive with XML inside
            const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
            const zip = await JSZip.loadAsync(bytes);
            
            // Get shared strings (for cell text values)
            const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
            const sharedStrings: string[] = [];
            if (sharedStringsXml) {
              // More robust shared string parsing - handle multiple <t> tags in <si>
              const siMatches = sharedStringsXml.match(/<si>[\s\S]*?<\/si>/g) || [];
              for (const si of siMatches) {
                const textMatches = si.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
                const combinedText = textMatches
                  .map(t => t.replace(/<t[^>]*>/, '').replace(/<\/t>/, ''))
                  .join('');
                sharedStrings.push(combinedText);
              }
            }
            console.log(`Parsed ${sharedStrings.length} shared strings from XLSX`);
            
            // Get all worksheets, not just sheet1
            const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'));
            console.log(`Found ${sheetFiles.length} worksheets:`, sheetFiles);
            
            const allSheetTexts: string[] = [];
            for (const sheetFile of sheetFiles.sort()) {
              const sheetXml = await zip.file(sheetFile)?.async("string");
              if (sheetXml) {
                const sheetName = sheetFile.replace('xl/worksheets/', '').replace('.xml', '');
                const sheetText = parseXLSXSheetToText(sheetXml, sharedStrings, `${doc.file_name} - ${sheetName}`);
                if (sheetText.length > 50) {
                  allSheetTexts.push(sheetText);
                }
              }
            }
            
            text = allSheetTexts.join('\n\n---\n\n');
            console.log(`Parsed XLSX, total text length: ${text.length}`);
          } else {
            // XLS (binary format) - limited support
            console.log('XLS binary format - attempting basic extraction...');
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const rawText = decoder.decode(bytes);
            
            // Extract readable text from binary
            const textParts = rawText.match(/[A-Za-zА-Яа-яЁё0-9\s.,;:!?()-]{5,}/g) || [];
            text = `[Excel Document: ${doc.file_name}]\n\n` + textParts.join(' ');
          }
        } catch (xlsError) {
          console.error('Excel extraction failed:', xlsError);
          text = `[Excel Document: ${doc.file_name}] - Не удалось извлечь текст. Ошибка: ${xlsError}`;
        }
        
        if (text.length < 100) {
          text = `[Excel Document: ${doc.file_name}] - Не удалось извлечь данные из таблицы.`;
        }
      } else if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileType.includes('text')) {
        // 4. Text files
        text = await fileData.text();
      } else if (fileName.endsWith('.pdf') || fileType.includes('pdf')) {
        // 5. PDF Processing - Extract page-by-page for accurate navigation
        console.log('Processing PDF with unpdf library (page-by-page extraction)...');
        
        // Store arrayBuffer for potential OCR fallback
        const arrayBuffer = await fileData.arrayBuffer();
        const pdfData = new Uint8Array(arrayBuffer);
        
        let numPages = 0;
        try {
          // Dynamic import of unpdf for proper PDF text extraction
          const unpdf = await import("https://esm.sh/unpdf@0.12.1");
          
          console.log(`PDF file size: ${pdfData.length} bytes`);
          
          const pdf = await unpdf.getDocumentProxy(pdfData);
          numPages = pdf.numPages;
          console.log(`PDF has ${numPages} pages`);
          
          // Extract text page by page to track page positions
          // Use mergePages: false to get array of page texts
          currentPdfPagesData = [];
          currentPdfFullText = '';
          
          const pageResult = await unpdf.extractText(pdf, {
            mergePages: false  // Returns array of strings, one per page
          });
          
          // pageResult is an array of strings when mergePages: false
          const pageTexts = Array.isArray(pageResult) ? pageResult : [];
          console.log(`Extracted ${pageTexts.length} pages with separate text`);
          
          let currentOffset = 0;
          for (let pageNum = 1; pageNum <= pageTexts.length; pageNum++) {
            const pageText = pageTexts[pageNum - 1] || '';
            
            // Clean page text
            const cleanedPageText = pageText
              .replace(/\x00/g, '')
              .replace(/[\uFFFD]/g, '')
              .trim();
            
            const startOffset = currentOffset;
            currentPdfFullText += cleanedPageText + '\n\n';
            currentOffset = currentPdfFullText.length;
            
            currentPdfPagesData.push({
              pageNum,
              text: cleanedPageText,
              startOffset,
              endOffset: currentOffset
            });
          }
          
          text = currentPdfFullText.trim();
          console.log(`Extracted text from ${numPages} PDF pages, total length: ${text.length}`);
          console.log(`Page tracking: ${currentPdfPagesData.length} pages indexed`);
          
          // Clean up PDF extraction artifacts
          text = text
            .replace(/\s{3,}/g, '\n\n')     // Convert multiple spaces to paragraphs
            .trim();
            
        } catch (pdfError) {
          console.error('PDF extraction with unpdf failed:', pdfError);
          console.log('Falling back to basic PDF extraction (no page tracking)...');
          
          // Reset page tracking - will use fallback
          currentPdfPagesData = [];
          currentPdfFullText = '';
          
          // Fallback to old method for compatibility
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const rawText = decoder.decode(pdfData);
          
          const textMatches = rawText.match(/\((.*?)\)/g);
          if (textMatches) {
            text = textMatches
              .map(m => m.slice(1, -1))
              .filter(t => t.length > 2 && /[a-zA-Zа-яА-Я]/.test(t))
              .join(' ');
          }
        }
        
        // ============= OCR FALLBACK FOR SCANNED PDFs =============
        // If text extraction yielded very little text, the PDF is likely scanned images
        // Primary: Gemini (chunked for large PDFs). Anthropic only if Gemini completely fails.
        if (text.length < 200 && pdfData.length > 10000) {
          console.log(`PDF appears to be scanned (text length: ${text.length}). Attempting OCR via Gemini (primary)...`);
          
          let ocrErrorCode = 0;
          let ocrSucceeded = false;
          
          // Try chunked Gemini OCR (splits large PDFs into 4-page chunks)
          // If numPages is 0 (unpdf failed), estimate from file size
          const estimatedPages = numPages > 0 ? numPages : Math.max(1, Math.ceil(pdfData.length / (35 * 1024)));
          console.log(`OCR: using ${numPages > 0 ? 'actual' : 'estimated'} page count: ${estimatedPages}`);
          const geminiOcrResult = await tryGeminiOcrChunked(pdfData, estimatedPages);
          
          if (geminiOcrResult.success && geminiOcrResult.text) {
            text = geminiOcrResult.text;
            ocrSucceeded = true;
            
            // Build page data for getPageForChunk function
            if (geminiOcrResult.pages && geminiOcrResult.pages.length > 0) {
              currentPdfPagesData = [];
              for (let i = 0; i < geminiOcrResult.pages.length; i++) {
                const start = geminiOcrResult.pages[i].offset;
                const end = i < geminiOcrResult.pages.length - 1 
                  ? geminiOcrResult.pages[i + 1].offset 
                  : text.length;
                currentPdfPagesData.push({
                  pageNum: geminiOcrResult.pages[i].pageNum,
                  text: text.slice(start, end),
                  startOffset: start,
                  endOffset: end
                });
              }
              currentPdfFullText = text;
              console.log(`Gemini OCR: Parsed ${currentPdfPagesData.length} pages with offsets`);
            } else {
              currentPdfPagesData = [];
              currentPdfFullText = text;
              console.log('Gemini OCR: No page markers found, page_start will be 1');
            }
          } else {
            console.log(`Gemini OCR failed (error ${geminiOcrResult.errorCode || 0}), trying Anthropic fallback...`);
            
            // Fallback to Anthropic OCR
            const anthropicOcrResult = await tryAnthropicOcr(pdfData);
            
            if (anthropicOcrResult.success && anthropicOcrResult.text) {
              text = anthropicOcrResult.text;
              ocrSucceeded = true;
              
              if (anthropicOcrResult.pages && anthropicOcrResult.pages.length > 0) {
                currentPdfPagesData = [];
                for (let i = 0; i < anthropicOcrResult.pages.length; i++) {
                  const start = anthropicOcrResult.pages[i].offset;
                  const end = i < anthropicOcrResult.pages.length - 1 
                    ? anthropicOcrResult.pages[i + 1].offset 
                    : text.length;
                  currentPdfPagesData.push({
                    pageNum: anthropicOcrResult.pages[i].pageNum,
                    text: text.slice(start, end),
                    startOffset: start,
                    endOffset: end
                  });
                }
                currentPdfFullText = text;
                console.log(`Anthropic OCR fallback: Parsed ${currentPdfPagesData.length} pages`);
              } else {
                currentPdfPagesData = [];
                currentPdfFullText = text;
              }
            } else {
              ocrErrorCode = anthropicOcrResult.errorCode || geminiOcrResult.errorCode || 0;
              console.log(`Both OCR methods failed (error ${ocrErrorCode})`);
            }
          }
        
          // Set error message if OCR failed
          if (!ocrSucceeded && text.length < 100) {
            let reason: string;
            if (ocrErrorCode === 400 || ocrErrorCode === 402) {
              reason = 'Недостаточно средств на балансе Anthropic API. Пополните баланс в консоли Anthropic.';
            } else if (ocrErrorCode === 401) {
              reason = 'Ошибка авторизации Anthropic API. Проверьте API ключ.';
            } else if (ocrErrorCode === 429) {
              reason = 'Превышен лимит запросов Anthropic API. Попробуйте позже.';
            } else if (ocrErrorCode === 408) {
              reason = 'Таймаут OCR обработки. Попробуйте обработать документ повторно.';
            } else {
              reason = 'Не удалось извлечь текст. Документ может быть отсканирован без текстового слоя.';
            }
            
            text = `[PDF Document: ${doc.file_name}] - ${reason}`;
          }
        } else if (text.length < 100) {
          // Non-scanned PDF but still couldn't extract text
          text = `[PDF Document: ${doc.file_name}] - Не удалось извлечь текст из PDF.`;
        }
      } else {
        try {
          text = await fileData.text();
        } catch {
          text = `[Document: ${doc.file_name}] - Binary content, requires specific parser.`;
        }
      }

      // Sanitize text (preserve line breaks for structure parsing)
      text = sanitizeText(text);
      console.log(`Extracted text length: ${text.length}`);

      // =====================================================
      // PII MASKING - Mask personal data if document has contains_pii flag
      // =====================================================
      let documentHasMaskedPii = false;
      const PII_KEY = Deno.env.get('PII_ENCRYPTION_KEY');
      
      if (doc.contains_pii && PII_KEY) {
        console.log('PII mode enabled for document, masking personal data...');
        
        try {
          const piiResult = await maskDocumentPii(text, {
            source_type: 'document',
            source_id: document_id,
            pii_key: PII_KEY,
            supabase,
          });
          
          if (piiResult.tokens_count > 0) {
            text = piiResult.masked_text;
            documentHasMaskedPii = true;
            console.log(`PII: Masked ${piiResult.tokens_count} tokens in document. Types: ${piiResult.pii_types_found.join(', ')}`);
          }
        } catch (piiError) {
          console.error('PII masking error (continuing without masking):', piiError);
        }
      }

      // Process document with hierarchical chunking (use manual document_type if specified)
      const manualType = doc.document_type || 'auto';
      const structuredChunks = processDocumentText(text, doc.file_name || 'unknown', manualType);
      console.log(`Created ${structuredChunks.length} structured chunks (manual type: ${manualType})`);

      // Mark that this document has been processed for PII
      if (doc.contains_pii) {
        await supabase
          .from('documents')
          .update({ pii_processed: true })
          .eq('id', document_id);
      }
      // Delete existing chunks
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', document_id);

      // Insert chunks in batches with metadata
      if (structuredChunks.length > 0) {
        const BATCH_SIZE = 100;
        let totalInserted = 0;
        
        for (let i = 0; i < structuredChunks.length; i += BATCH_SIZE) {
          const batch = structuredChunks.slice(i, i + BATCH_SIZE);
          const chunkRecords = batch.map((chunk, index) => {
            // Determine page numbers from PDF page tracking (if available)
            const pageInfo = getPageForChunk(chunk.content);
            
            return {
              document_id,
              content: chunk.content,
              chunk_index: i + index,
              section_title: chunk.section_title,
              article_number: chunk.article_number,
              chunk_type: chunk.chunk_type,
              page_start: chunk.page_start || pageInfo.page_start, // From chunk or calculated
              page_end: chunk.page_end || pageInfo.page_end,
              has_masked_pii: documentHasMaskedPii, // Track PII masking at chunk level
              embedding: `[${createSimpleEmbedding(chunk.content).join(',')}]`,
              metadata: {
                file_name: doc.file_name,
                folder_id: doc.folder_id,
                parent_context: chunk.parent_context,
              },
            };
          });

          const { error: insertError } = await supabase
            .from('document_chunks')
            .insert(chunkRecords);

          if (insertError) {
            console.error(`Failed to insert batch ${i}:`, insertError.message);
          } else {
            totalInserted += batch.length;
          }
        }

        console.log(`Inserted ${totalInserted} chunks with hierarchical metadata`);
      }

      // Update document status to ready
      await supabase
        .from('documents')
        .update({ 
          status: 'ready',
          chunk_count: structuredChunks.length,
        })
        .eq('id', document_id);

      // Calculate statistics for response
      const stats = {
        total_chunks: structuredChunks.length,
        article_chunks: structuredChunks.filter(c => c.chunk_type === 'article').length,
        header_chunks: structuredChunks.filter(c => c.chunk_type === 'header').length,
        point_chunks: structuredChunks.filter(c => c.chunk_type === 'point').length,
        paragraph_chunks: structuredChunks.filter(c => c.chunk_type === 'paragraph').length,
        unique_articles: [...new Set(structuredChunks.map(c => c.article_number).filter(Boolean))].length,
      };

      console.log(`Document processed successfully:`, stats);

      return new Response(
        JSON.stringify({ 
          success: true, 
          chunks_count: structuredChunks.length,
          text_length: text.length,
          document_type: detectDocumentType(text),
          stats,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processError) {
      console.error('Processing error:', processError);

      await supabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', document_id);

      throw processError;
    }

  } catch (error) {
    console.error('Process document error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =====================================================
// INLINE PII MASKING FOR DOCUMENTS
// =====================================================
interface DocMaskContext {
  source_type: string;
  source_id: string;
  pii_key: string;
  supabase: any;
}

interface DocMaskResult {
  masked_text: string;
  tokens_count: number;
  pii_types_found: string[];
}

async function maskDocumentPii(text: string, context: DocMaskContext): Promise<DocMaskResult> {
  const patterns = getActivePatterns();
  const tokenCounters: Record<string, number> = {};
  let maskedText = text;
  let totalTokens = 0;
  const piiTypesFound: string[] = [];
  
  // Track already masked positions to avoid overlapping
  const maskedRanges: Array<{ start: number; end: number }> = [];

  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      // Reset regex state
      regex.lastIndex = 0;
      
      // Find all matches and store them first
      const matches: Array<{ match: string; index: number }> = [];
      let regexMatch: RegExpExecArray | null;
      
      while ((regexMatch = regex.exec(maskedText)) !== null) {
        // Skip if this position is already masked
        const matchIndex = regexMatch.index;
        const isOverlapping = maskedRanges.some(
          range => matchIndex >= range.start && matchIndex < range.end
        );
        
        if (!isOverlapping && !regexMatch[0].startsWith('[') && !regexMatch[0].includes('_')) {
          matches.push({ match: regexMatch[0], index: matchIndex });
        }
      }

      // Process matches in reverse order to maintain indices
      for (const { match: originalValue, index } of matches.reverse()) {
        // Increment counter for this type
        tokenCounters[pattern.type] = (tokenCounters[pattern.type] || 0) + 1;
        const tokenNum = tokenCounters[pattern.type];
        const token = `[${pattern.token_prefix}_${tokenNum}]`;

        // Encrypt the original value and store mapping
        try {
          const { encrypted, iv } = await encryptAES256(originalValue, context.pii_key);
          
          await context.supabase
            .from('pii_mappings')
            .insert({
              token,
              pii_type: pattern.type,
              encrypted_value: encrypted,
              encryption_iv: iv,
              source_type: context.source_type,
              source_id: context.source_id,
            });
        } catch (err) {
          console.error('Error storing PII mapping:', err);
        }

        // Replace in text
        maskedText = maskedText.substring(0, index) + token + maskedText.substring(index + originalValue.length);
        
        // Track masked range
        maskedRanges.push({ start: index, end: index + token.length });
        totalTokens++;
        
        if (!piiTypesFound.includes(pattern.type)) {
          piiTypesFound.push(pattern.type);
        }
      }
    }
  }

  return {
    masked_text: maskedText,
    tokens_count: totalTokens,
    pii_types_found: piiTypesFound,
  };
}
