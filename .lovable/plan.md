

# План исправления поиска в документах по источникам

## Диагностика проблемы

### Текущий неправильный поток данных

```text
┌────────────────────────────────────────────────────────────────────┐
│  Запрос пользователя: "32 класс МКТУ"                               │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  extractRelevantPreview(chunk.content, message, 300)               │
│  → Находит окно с "32" в чанке                                     │
│  → Возвращает 300 символов: "Класс 32 включает пиво..."            │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  cleanSearchText() → обрезает до 150 символов                      │
│  → "Класс 32 включает пиво, минеральные воды..."                   │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  DocumentViewer.performSearch()                                     │
│  → Ищет строку "Класс 32 включает пиво..." в PDF                   │
│  → НЕ НАХОДИТ (разное форматирование в PDF)                        │
│  → Fallback на keywords: ["Класс", "включает", "пиво"]             │
│  → Находит страницу где есть "Класс" и "пиво" → НЕПРАВИЛЬНОЕ МЕСТО │
└────────────────────────────────────────────────────────────────────┘
```

### Почему появляются странные фрагменты

На скриншотах видны поисковые запросы:
- `"подготовку следук"` → обрезанный фрагмент из content_preview
- `"ческого лица (ОГРН"` → обрезанный фрагмент
- `"продукции и рекламирования"` → из другого места чанка

Это происходит потому что:
1. `content_preview` берётся из ЧАНКА (текст в базе данных)
2. Чанк может быть из СЕРЕДИНЫ документа (не связан с PDF страницей)
3. Обрезание до 150 символов создаёт фрагменты без смысла
4. PDF поиск ищет эти фрагменты и находит "где-то рядом"

---

## Решение: Разделить content_preview и search_keywords

### Идея

Добавить **отдельное поле `search_keywords`** в Citation — это ключевые слова из ОРИГИНАЛЬНОГО запроса пользователя, которые используются ТОЛЬКО для навигации в PDF.

### Новый поток данных

```text
┌────────────────────────────────────────────────────────────────────┐
│  Запрос: "32 класс МКТУ"                                            │
└────────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────────┐   ┌─────────────────────────────────────┐
│  content_preview        │   │  search_keywords                    │
│  (для отображения UI)   │   │  (для поиска в PDF)                 │
│  "Класс 32 включает..." │   │  ["32", "класс", "мкту"]            │
└─────────────────────────┘   └─────────────────────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────────────────────────┐
                              │  DocumentViewer.performSearch()     │
                              │  → Ищет "32" в PDF                   │
                              │  → Находит "Класс 32" на странице!   │
                              └─────────────────────────────────────┘
```

---

## Изменения в коде

### 1. Добавить search_keywords в Citation (src/types/chat.ts)

```typescript
export interface Citation {
  index: number;
  document: string;
  section?: string;
  article?: string;
  relevance: number;
  chunk_id?: string;
  document_id?: string;
  page_start?: number;
  chunk_index?: number;
  content_preview?: string;
  storage_path?: string;
  search_keywords?: string[];  // NEW: ключевые слова для PDF поиска
}
```

### 2. Генерировать search_keywords в chat-stream (supabase/functions/chat-stream/index.ts)

В блоке формирования citations добавить:

```typescript
// Extract search keywords from original query
function extractSearchKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\wа-яё\s\d]/gi, ' ')
    .split(/\s+/)
    .filter(w => {
      // Include numbers (any length) - they're usually specific
      if (/^\d+$/.test(w)) return true;
      // Include words > 3 chars that are not stop words
      return w.length > 3 && !STOP_WORDS.has(w);
    })
    .slice(0, 5); // Max 5 keywords
}

// In citation building:
const searchKeywords = extractSearchKeywords(message);

const allCitations = rankedChunks.map((chunk, idx) => ({
  // ... existing fields ...
  content_preview: extractRelevantPreview(chunk.content, message, 300),
  search_keywords: searchKeywords,  // Same for all citations from this query
}));
```

### 3. Использовать search_keywords в SourcesPanel (src/components/chat/SourcesPanel.tsx)

Изменить передачу searchText в DocumentViewer:

```typescript
// В openDocumentWithHighlight:
setViewerState({
  isOpen: true,
  documentId: citationData.document_id,
  storagePath: citationData.storage_path,
  documentName: citationData.document,
  // Use search_keywords if available, otherwise fallback to content_preview
  searchText: citationData.search_keywords?.length 
    ? citationData.search_keywords.join(' ')
    : cleanSearchText(citationData.content_preview),
  pageNumber: citationData.page_start || extractPageNumber(documentInfo),
});
```

### 4. Улучшить DocumentViewer поиск по ключевым словам

В `performSearch` добавить режим "поиск по нескольким ключевым словам" как основной:

```typescript
const performSearch = async (query: string) => {
  if (!pdfDocRef.current || !query.trim()) return;
  
  // Split query into keywords
  const keywords = query.split(/\s+/).filter(w => w.length > 1);
  
  // If multiple keywords, search for page with most matches
  if (keywords.length > 1) {
    const pageScores = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocRef.current.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ').toLowerCase();
      
      let score = 0;
      for (const kw of keywords) {
        if (pageText.includes(kw.toLowerCase())) score++;
      }
      
      if (score > 0) pageScores.push({ pageNum, score });
    }
    
    // Sort by score and navigate to best match
    pageScores.sort((a, b) => b.score - a.score);
    if (pageScores.length > 0) {
      setCurrentPage(pageScores[0].pageNum);
      // Highlight the most specific keyword (usually number or longest)
      const highlightWord = keywords.find(k => /^\d+$/.test(k)) || 
                           keywords.sort((a, b) => b.length - a.length)[0];
      setHighlightedText(highlightWord);
      return;
    }
  }
  
  // Fallback to single phrase search...
};
```

---

## Файлы для изменения

1. **src/types/chat.ts** — добавить поле `search_keywords` в Citation
2. **src/types/departmentChat.ts** — добавить аналогичное поле
3. **supabase/functions/chat-stream/index.ts** — генерировать search_keywords из запроса
4. **src/components/chat/SourcesPanel.tsx** — использовать search_keywords для поиска
5. **src/components/documents/DocumentViewer.tsx** — улучшить поиск по ключевым словам

---

## Ожидаемые результаты

| До | После |
|----|-------|
| searchText = "Класс 32 включает пиво, минеральные воды..." (150 симв) | searchText = "32 класс мкту" (ключевые слова) |
| PDF поиск ищет длинную строку → не находит | PDF поиск ищет "32" → находит точно |
| Fallback на "включает", "минеральные" | Подсветка "32" на правильной странице |
| Показывает "ческого лица (ОГРН" | Показывает страницу с "Класс 32" |

---

## Техническая секция

### Порядок имплементации

1. Добавить `search_keywords` в типы Citation
2. Генерировать `search_keywords` в chat-stream из оригинального запроса
3. Обновить SourcesPanel чтобы передавать `search_keywords`
4. Улучшить DocumentViewer для поиска по нескольким ключевым словам
5. Задеплоить и протестировать

### Оценка времени

- Изменения типов: 10 минут
- chat-stream изменения: 30 минут  
- SourcesPanel изменения: 20 минут
- DocumentViewer улучшения: 30 минут
- Тестирование: 30 минут

**Общее время**: ~2 часа

