
# План исправления системы citations и навигации по источникам

## Выявленные критические проблемы

### Проблема 1: document_id и storage_path не заполняются в citations
**Местоположение**: `supabase/functions/chat-stream/index.ts`, строки 1269-1273

**Текущий код**:
```typescript
document_id: chunk.parent_document_id,  // null для обычных документов!
storage_path: undefined as string | undefined, // Никогда не заполняется
```

**Причина**: `parent_document_id` используется только для split-документов. Для обычных документов это поле null. Также storage_path никогда не получается из базы.

### Проблема 2: Non-streaming citations не имеют расширенных данных
**Местоположение**: строки 1117-1123

Для non-streaming ответов (Perplexity deep-research) citations формируются БЕЗ:
- content_preview
- chunk_id
- document_id
- page_start
- storage_path

### Проблема 3: extractRelevantPreview находит первое ключевое слово
Для запроса "32 класс МКТУ" функция может найти "класс" или "мкту" раньше "32", создавая нерелевантный preview.

### Проблема 4: МКТУ - это XLSX файл
DocumentViewer оптимизирован для PDF. Для Excel файлов подсветка текста не работает.

---

## Решение 1: Получить document_id и storage_path из базы

**Изменения в chat-stream/index.ts** (после строки 1250):

```typescript
// Fetch document metadata for storage_path
const chunkDocIds = rankedChunks.map(c => c.id);
const { data: chunkDocMeta } = await supabase
  .from('document_chunks')
  .select('id, document_id, documents!inner(id, storage_path)')
  .in('id', chunkDocIds);

// Create lookup map
const chunkToDoc = new Map();
for (const chunk of chunkDocMeta || []) {
  chunkToDoc.set(chunk.id, {
    document_id: chunk.document_id,
    storage_path: (chunk.documents as any)?.storage_path
  });
}
```

**Обновить формирование citations** (строки 1261-1274):

```typescript
const allCitations = rankedChunks.map((chunk, idx) => {
  const docMeta = chunkToDoc.get(chunk.id) || {};
  return {
    index: idx + 1,
    document: chunk.original_document_name || chunk.document_name,
    section: chunk.section_title,
    article: chunk.article_number,
    relevance: Math.min(chunk.relevance_score / 10, 1),
    chunk_id: chunk.id,
    document_id: docMeta.document_id || chunk.parent_document_id,
    page_start: chunk.part_number,
    content_preview: extractRelevantPreview(chunk.content, message, 300),
    storage_path: docMeta.storage_path,
  };
});
```

---

## Решение 2: Исправить non-streaming citations

**Изменения в строках 1117-1123**:

Заменить упрощенный код на полноценное формирование citations с теми же полями, что и в streaming версии.

---

## Решение 3: Улучшить extractRelevantPreview

**Изменения в функции extractRelevantPreview** (строки 269-292):

```typescript
function extractRelevantPreview(content: string, query: string, maxLen: number = 300): string {
  // Extract significant keywords (numbers and words > 4 chars)
  const queryWords = query.toLowerCase()
    .replace(/[^\wа-яё\s\d]/gi, ' ')
    .split(/\s+/)
    .filter(w => (w.length > 4 && !STOP_WORDS.has(w)) || /^\d+$/.test(w));
  
  if (queryWords.length === 0) {
    return content.slice(0, maxLen);
  }
  
  const contentLower = content.toLowerCase();
  
  // Find position with most keyword matches in a window
  let bestPos = 0;
  let bestScore = 0;
  
  for (let i = 0; i < content.length - maxLen; i += 50) {
    const window = contentLower.slice(i, i + maxLen);
    let score = 0;
    for (const word of queryWords) {
      if (window.includes(word)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPos = i;
    }
  }
  
  return content.slice(bestPos, bestPos + maxLen);
}
```

---

## Решение 4: Поддержка XLSX в SourcesPanel

**Изменения в SourcesPanel.tsx**:

Добавить проверку типа файла и альтернативное отображение для Excel:

```typescript
// В openDocumentWithHighlight:
const fileExt = storagePath.split('.').pop()?.toLowerCase();
if (fileExt === 'xlsx' || fileExt === 'xls') {
  // Show Excel preview or download link instead of PDF viewer
  toast({
    title: "Excel документ",
    description: "Для просмотра скачайте файл",
    action: <Button onClick={() => downloadFile(storagePath)}>Скачать</Button>
  });
  return;
}
```

---

## Файлы для изменения

1. **supabase/functions/chat-stream/index.ts**:
   - Добавить запрос document metadata (после строки 1250)
   - Исправить формирование citations (строки 1261-1274)
   - Исправить non-streaming citations (строки 1117-1123)
   - Улучшить extractRelevantPreview (строки 269-292)

2. **src/components/chat/SourcesPanel.tsx**:
   - Добавить обработку Excel файлов

---

## Порядок имплементации

1. Добавить запрос document metadata для получения storage_path
2. Исправить формирование streaming citations с правильным document_id
3. Исправить non-streaming citations (аналогично)
4. Улучшить extractRelevantPreview для поиска лучшего окна
5. Добавить обработку Excel файлов в SourcesPanel
6. Задеплоить и протестировать

---

## Ожидаемые результаты

| Проблема | До | После |
|----------|-----|-------|
| document_id | null (parent_document_id) | Реальный ID документа |
| storage_path | undefined | Путь к файлу |
| content_preview | Первое слово | Лучшее окно с макс. совпадениями |
| Excel файлы | Ошибка просмотра | Кнопка скачивания |

---

## Техническая секция

### Тестирование после изменений

1. Сделать запрос "32 класс МКТУ" с ролью "Отказы ТЗ"
2. Проверить что в citations есть:
   - document_id (не null)
   - storage_path (путь к файлу)
   - content_preview содержит "32" или "Класс: 32"
3. Нажать на источник и убедиться что открывается правильный документ
