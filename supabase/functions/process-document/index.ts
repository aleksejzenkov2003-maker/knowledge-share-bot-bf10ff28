import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  document_id: string;
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

// Типы чанков для метаданных
type ChunkType = 'header' | 'article' | 'paragraph' | 'point' | 'section' | 'general';

interface StructuredChunk {
  content: string;
  section_title: string | null;
  article_number: string | null;
  chunk_type: ChunkType;
  parent_context: string;
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

function detectDocumentType(text: string): 'legal' | 'contract' | 'business' | 'article' | 'general' {
  const textSample = text.slice(0, 15000); // Анализируем первые 15к символов
  
  // Ключевые слова для юридических документов
  const legalPatterns = [
    /статья\s+\d+/gi,
    /глава\s+\d+/gi,
    /кодекс/gi,
    /федеральн\w+\s+закон/gi,
    /гражданск\w+\s+кодекс/gi,
    /трудов\w+\s+кодекс/gi,
    /уголовн\w+\s+кодекс/gi,
    /налогов\w+\s+кодекс/gi,
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
  
  let legalScore = 0;
  let contractScore = 0;
  let businessScore = 0;
  
  for (const pattern of legalPatterns) {
    const matches = textSample.match(pattern);
    if (matches) legalScore += matches.length;
  }
  
  for (const pattern of contractPatterns) {
    const matches = textSample.match(pattern);
    if (matches) contractScore += matches.length;
  }
  
  // Проверяем наличие структуры статей
  const articleMatches = text.match(/^Статья\s+\d+/gim);
  if (articleMatches && articleMatches.length >= 3) {
    legalScore += 10;
  }
  
  // Проверяем бизнес-структуру: "1. НАЗВАНИЕ", "2.1 Подраздел"
  const mainSectionMatches = textSample.match(/^\d+\.\s+[A-ZА-ЯЁ][A-ZА-ЯЁ\s\(\)]+$/gm);
  const subSectionMatches = textSample.match(/^\d+\.\d+\s+.+$/gm);
  
  if (mainSectionMatches) businessScore += mainSectionMatches.length * 2;
  if (subSectionMatches) businessScore += subSectionMatches.length;
  
  console.log(`Document type detection - Legal: ${legalScore}, Contract: ${contractScore}, Business: ${businessScore}`);
  
  if (legalScore >= 5) return 'legal';
  if (contractScore >= 3) return 'contract';
  if (businessScore >= 4) return 'business';
  
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

// ============= FALLBACK: SIMPLE CHUNKING FOR GENERAL DOCUMENTS =============

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

// ============= MAIN PROCESSING FUNCTION =============

function processDocumentText(text: string, fileName: string): StructuredChunk[] {
  console.log(`Processing document: ${fileName}, text length: ${text.length}`);
  
  const docType = detectDocumentType(text);
  console.log(`Detected document type: ${docType}`);
  
  let chunks: StructuredChunk[];
  
  if (docType === 'legal') {
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
  console.log(`Chunk types: articles=${articleChunks}, headers=${headerChunks}, sections=${sectionChunks}, points=${pointChunks}`);
  
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

      if (fileType.includes('text') || doc.file_name?.endsWith('.txt') || doc.file_name?.endsWith('.md')) {
        text = await fileData.text();
      } else if (fileType.includes('pdf')) {
        const arrayBuffer = await fileData.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const rawText = decoder.decode(bytes);
        
        const textMatches = rawText.match(/\((.*?)\)/g);
        if (textMatches) {
          text = textMatches
            .map(m => m.slice(1, -1))
            .filter(t => t.length > 2 && /[a-zA-Zа-яА-Я]/.test(t))
            .join(' ');
        }
        
        if (text.length < 100) {
          text = `[PDF Document: ${doc.file_name}] - Please upload a text version of this document for better results.`;
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

      // Process document with hierarchical chunking
      const structuredChunks = processDocumentText(text, doc.file_name || 'unknown');
      console.log(`Created ${structuredChunks.length} structured chunks`);

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
          const chunkRecords = batch.map((chunk, index) => ({
            document_id,
            content: chunk.content,
            chunk_index: i + index,
            section_title: chunk.section_title,
            article_number: chunk.article_number,
            chunk_type: chunk.chunk_type,
            embedding: `[${createSimpleEmbedding(chunk.content).join(',')}]`,
            metadata: {
              file_name: doc.file_name,
              folder_id: doc.folder_id,
              parent_context: chunk.parent_context,
            },
          }));

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
