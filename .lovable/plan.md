

# План: Сохранение номера страницы в чанках для точной навигации в PDF

## Диагностика

На скриншотах видно:
1. **TextViewer** показывает правильный фрагмент ("розовый цвет" на странице 50)
2. **PDF Viewer** не находит текст — поиск по "розовый" показывает 4 совпадения, но открывается не та страница
3. Проблема: **номер страницы не хранится в чанках**

### Корневая причина

1. **При извлечении PDF** используется `mergePages: true` (строка 1517 в `process-document/index.ts`):
```typescript
const result = await unpdf.extractText(pdf, { 
  mergePages: true  // ← ВСЕ СТРАНИЦЫ ОБЪЕДИНЯЮТСЯ В ОДИН ТЕКСТ
});
```

2. **В таблице `document_chunks`** нет колонок `page_start`/`page_end` — только:
- `chunk_index` — порядковый номер чанка
- `metadata` — содержит только `file_name`, `folder_id`, `parent_context`

3. **В Citation** поле `page_start` есть, но заполняется значением `chunk.part_number`, которое не связано со страницей PDF.

---

## Решение: Трёхуровневое изменение

### Уровень 1: Миграция — добавить колонки страниц

```sql
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS page_start INTEGER,
ADD COLUMN IF NOT EXISTS page_end INTEGER;
```

### Уровень 2: Извлечение — сохранять номера страниц

Изменить `process-document/index.ts`:

```typescript
// Вместо:
const result = await unpdf.extractText(pdf, { mergePages: true });

// Использовать постраничное извлечение:
const numPages = pdf.numPages;
const pagesText: Array<{pageNum: number, text: string}> = [];

for (let pageNum = 1; pageNum <= numPages; pageNum++) {
  const pageResult = await unpdf.extractText(pdf, { 
    mergePages: false,
    firstPage: pageNum,
    lastPage: pageNum 
  });
  const pageText = typeof pageResult === 'string' ? pageResult : (pageResult.text || '');
  pagesText.push({ pageNum, text: pageText });
}
```

При создании чанков передавать информацию о страницах:

```typescript
// В парсерах документов добавить отслеживание:
interface ChunkWithPages extends StructuredChunk {
  page_start: number;
  page_end: number;
}
```

### Уровень 3: Использование — открывать PDF на нужной странице

В `CitationLink.tsx` и `SourcesPanel.tsx`:

```typescript
// Вместо поиска по ключевым словам:
setViewerState({
  isOpen: true,
  documentId: citation.document_id,
  storagePath: citation.storage_path,
  documentName: citation.document,
  pageNumber: citation.page_start || 1,  // ← ИСПОЛЬЗОВАТЬ РЕАЛЬНЫЙ НОМЕР СТРАНИЦЫ
  searchText: undefined,  // Поиск не нужен — сразу на нужной странице
});
```

---

## Детализация изменений

### Файл 1: Миграция базы данных

```sql
-- Добавить колонки для номеров страниц
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS page_start INTEGER,
ADD COLUMN IF NOT EXISTS page_end INTEGER;

-- Индекс для быстрого поиска по страницам
CREATE INDEX IF NOT EXISTS idx_chunks_pages 
ON document_chunks(document_id, page_start, page_end);
```

### Файл 2: `supabase/functions/process-document/index.ts`

**Изменения**:

1. **Извлечение PDF по страницам** (строки 1502-1555):
```typescript
// Новая структура для хранения текста со страницами
interface PageText {
  pageNum: number;
  text: string;
  startOffset: number;  // Позиция начала текста страницы в объединённом тексте
  endOffset: number;
}

const pagesData: PageText[] = [];
let fullText = '';
let currentOffset = 0;

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  const pageText = textContent.items.map((item: any) => item.str).join(' ');
  
  pagesData.push({
    pageNum,
    text: pageText,
    startOffset: currentOffset,
    endOffset: currentOffset + pageText.length
  });
  
  fullText += pageText + '\n\n';
  currentOffset = fullText.length;
}
```

2. **Функция определения страницы чанка**:
```typescript
function getPageForChunk(
  chunkContent: string, 
  fullText: string, 
  pagesData: PageText[]
): { page_start: number; page_end: number } {
  const chunkStart = fullText.indexOf(chunkContent);
  if (chunkStart === -1) return { page_start: 1, page_end: 1 };
  
  const chunkEnd = chunkStart + chunkContent.length;
  
  let pageStart = 1;
  let pageEnd = 1;
  
  for (const page of pagesData) {
    if (chunkStart >= page.startOffset && chunkStart < page.endOffset) {
      pageStart = page.pageNum;
    }
    if (chunkEnd >= page.startOffset && chunkEnd <= page.endOffset) {
      pageEnd = page.pageNum;
      break;
    }
  }
  
  return { page_start: pageStart, page_end: pageEnd };
}
```

3. **Сохранение страниц при вставке чанков**:
```typescript
// При вставке в document_chunks добавить page_start, page_end
const { error: insertError } = await supabase
  .from('document_chunks')
  .insert({
    document_id: docId,
    content: chunk.content,
    chunk_index: index,
    metadata: chunkMetadata,
    section_title: chunk.section_title,
    article_number: chunk.article_number,
    chunk_type: chunk.chunk_type,
    page_start: chunkPages.page_start,  // NEW
    page_end: chunkPages.page_end,       // NEW
  });
```

### Файл 3: `supabase/functions/chat-stream/index.ts`

Изменить запрос к `document_chunks` чтобы возвращать `page_start`:

```typescript
// В FTS запросе добавить page_start, page_end
const { data: ftsResults } = await supabase
  .from('document_chunks')
  .select('id, content, metadata, section_title, article_number, chunk_index, document_id, page_start, page_end')
  ...
```

При формировании citation использовать реальный номер страницы:

```typescript
page_start: chunk.page_start || 1,  // Реальный номер из БД
page_end: chunk.page_end || chunk.page_start || 1,
```

### Файл 4: `src/components/chat/CitationLink.tsx`

Приоритет навигации — номер страницы:

```typescript
const openPdfViewer = () => {
  setViewerState({
    isOpen: true,
    documentId: citation.document_id,
    storagePath: citation.storage_path,
    documentName: citation.document,
    // Главное изменение: использовать page_start напрямую
    pageNumber: citation.page_start || 1,
    // searchText для подсветки, но не для навигации
    searchText: extractSearchTextFromContent(
      citation.full_chunk_content,
      citation.content_preview
    ),
  });
};
```

### Файл 5: `src/components/chat/SourcesPanel.tsx`

Аналогичное изменение для источников.

---

## Ожидаемый результат

**До**:
- TextViewer: "...розовый цвет упаковки..." 
- Клик "Открыть PDF" → поиск по "розовый" → страница 12 (неверно)

**После**:
- TextViewer: "...розовый цвет упаковки..." (page_start: 50 из БД)
- Клик "Открыть PDF" → pageNumber: 50 → сразу страница 50 (верно!)
- Дополнительно: подсветка "розовый" для визуального ориентира

---

## Миграция существующих документов

Для уже загруженных документов есть два варианта:

**Вариант A**: Перезагрузить документы
- Удалить документ
- Загрузить заново
- Новый код извлечёт страницы

**Вариант B**: Использовать fallback
- Для чанков без page_start продолжать использовать поиск по ключевым словам
- Новые документы будут иметь точную навигацию

---

## Порядок реализации

| Шаг | Файл/Действие | Описание |
|-----|---------------|----------|
| 1 | Миграция SQL | Добавить колонки `page_start`, `page_end` |
| 2 | `process-document/index.ts` | Извлекать PDF по страницам + сохранять номера |
| 3 | `chat-stream/index.ts` | Возвращать `page_start`/`page_end` в citation |
| 4 | `CitationLink.tsx` | Использовать `pageNumber` для навигации |
| 5 | `SourcesPanel.tsx` | Аналогичное изменение |
| 6 | Тест | Загрузить тестовый PDF и проверить навигацию |

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| **SQL Migration** | Добавить `page_start`, `page_end` в `document_chunks` |
| `supabase/functions/process-document/index.ts` | Постраничное извлечение PDF + сохранение номеров страниц |
| `supabase/functions/chat-stream/index.ts` | Возвращать реальные номера страниц в citation |
| `src/types/chat.ts` | Добавить `page_end` в Citation (опционально) |
| `src/components/chat/CitationLink.tsx` | Использовать `page_start` для прямой навигации |
| `src/components/chat/SourcesPanel.tsx` | Аналогично для источников |

