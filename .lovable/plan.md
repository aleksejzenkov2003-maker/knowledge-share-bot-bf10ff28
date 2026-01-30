

# План: Исправление OCR для сохранения номеров страниц

## Проблема

При OCR обработке отсканированных PDF документов теряется информация о страницах:
- Все чанки документа `cbg` имеют `page_start: 1` в базе данных
- PDF viewer открывается на странице 1 вместо реальной страницы с цитатой

**Причина**: После OCR код сбрасывает `currentPdfPagesData = []`, и функция `getPageForChunk` возвращает `{ page_start: 1, page_end: 1 }` для всех чанков.

---

## Решение

### Изменения в `supabase/functions/process-document/index.ts`

**1. Модифицировать OCR промпт** для запроса маркировки страниц:

```typescript
// Изменить промпт на строках 1688-1697
text: `Это PDF документ. Извлеки ВЕСЬ текст со всех страниц.

КРИТИЧЕСКИ ВАЖНО:
- В НАЧАЛЕ каждой страницы добавь маркер: [СТРАНИЦА N]
- Например: [СТРАНИЦА 1] текст первой страницы... [СТРАНИЦА 2] текст второй...
- Сохрани структуру: абзацы, списки, заголовки
- Таблицы представь в текстовом виде
- Язык документа сохрани без изменений

Верни ТОЛЬКО извлечённый текст с маркерами страниц.`
```

**2. Добавить функцию парсинга OCR результата** (~строка 1719):

```typescript
function parseOcrTextWithPages(ocrText: string): { 
  text: string; 
  pages: { pageNum: number; offset: number }[] 
} {
  const pages: { pageNum: number; offset: number }[] = [];
  let cleanText = ocrText;
  
  // Find all page markers: [СТРАНИЦА N] or [PAGE N]
  const pageMarkerRegex = /\[(?:СТРАНИЦА|PAGE)\s*(\d+)\]/gi;
  let match;
  let offset = 0;
  
  // First pass: collect page positions
  const matches: { index: number; pageNum: number; length: number }[] = [];
  while ((match = pageMarkerRegex.exec(ocrText)) !== null) {
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
  cleanText = ocrText.replace(pageMarkerRegex, '');
  
  return { text: cleanText.trim(), pages };
}
```

**3. Интегрировать парсинг после OCR** (вместо строк 1721-1730):

```typescript
if (ocrText.length > 100) {
  console.log(`OCR successful! Extracted ${ocrText.length} characters`);
  
  // Parse OCR result to extract page markers
  const parsed = parseOcrTextWithPages(ocrText);
  text = parsed.text;
  
  // Build page data for getPageForChunk function
  if (parsed.pages.length > 0) {
    currentPdfPagesData = [];
    for (let i = 0; i < parsed.pages.length; i++) {
      const start = parsed.pages[i].offset;
      const end = i < parsed.pages.length - 1 
        ? parsed.pages[i + 1].offset 
        : text.length;
      currentPdfPagesData.push({
        pageNum: parsed.pages[i].pageNum,
        text: text.slice(start, end),
        startOffset: start,
        endOffset: end
      });
    }
    currentPdfFullText = text;
    console.log(`OCR: Parsed ${currentPdfPagesData.length} pages with offsets`);
  } else {
    // Fallback: no page markers found
    currentPdfPagesData = [];
    currentPdfFullText = text;
    console.log('OCR: No page markers found, page_start will be 1');
  }
}
```

---

## Диаграмма потока данных

```text
OCR Text from Gemini:
"[СТРАНИЦА 1] Текст стр 1... [СТРАНИЦА 2] Текст стр 2..."
           ↓
parseOcrTextWithPages()
           ↓
┌──────────────────────────────────────────┐
│ pages: [{pageNum:1, offset:0},           │
│         {pageNum:2, offset:150}, ...]    │
│ text: "Текст стр 1... Текст стр 2..."    │
└──────────────────────────────────────────┘
           ↓
currentPdfPagesData = [{pageNum:1, startOffset:0, endOffset:150},
                       {pageNum:2, startOffset:150, endOffset:300}...]
           ↓
getPageForChunk("фрагмент со стр 2") → {page_start: 2, page_end: 2}
```

---

## Результат

После исправления:
1. OCR будет возвращать текст с маркерами страниц
2. Маркеры будут парситься для создания `currentPdfPagesData`
3. Каждый чанк получит корректный `page_start` и `page_end`
4. PDF viewer откроется на правильной странице с цитатой

---

## Тестирование

1. Удалить существующий документ cbg из базы
2. Загрузить cbg.pdf заново
3. Проверить в базе что `page_start` разный для разных чанков
4. Кликнуть на цитату и убедиться что PDF открывается на правильной странице

