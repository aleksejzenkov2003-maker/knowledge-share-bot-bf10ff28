

# План: Точная навигация из TextViewer в PDF

## Диагностика проблемы

На скриншотах видно:
1. **TextViewer** корректно показывает фрагмент про Vanish, розовый цвет упаковки
2. **PDF Viewer** ищет "25 знак мкту" (из оригинального запроса пользователя)
3. В результате открывается страница 12-13 с совсем другим содержанием

### Корневая причина

В `CitationLink.tsx` и `SourcesPanel.tsx` при переходе в PDF:

```typescript
// Строки 107-109 в CitationLink.tsx
searchText: citation.search_keywords?.length 
  ? citation.search_keywords.join(' ')  // ← Использует keywords из ЗАПРОСА
  : citation.content_preview?.slice(0, 150),
```

`search_keywords` формируется в backend из пересечения:
- Ключевые слова **запроса пользователя** ("25 знак мкту")
- Контент чанка

Но если пользователь спрашивал про классы МКТУ, а чанк про Vanish — пересечение даёт неверные ключевые слова.

---

## Решение

При переходе из TextViewer в PDF использовать **уникальные слова из САМОГО контента чанка**, а не из запроса.

### Логика выбора searchText для PDF

```text
Приоритет поиска в PDF:
1. Первые 3-5 уникальных слов из full_chunk_content (наиболее специфичные)
2. content_preview (первые 100 символов)
3. search_keywords (fallback — может не работать)
```

---

## Изменения

### 1. CitationLink.tsx — использовать контент чанка

**Строки 102-111**: Изменить логику `openPdfViewer`:

```typescript
// Вместо:
searchText: citation.search_keywords?.length 
  ? citation.search_keywords.join(' ')
  : citation.content_preview?.slice(0, 150),

// Использовать:
searchText: extractSearchTextFromChunk(
  citation.full_chunk_content,
  citation.content_preview
),
```

Добавить функцию извлечения ключевых слов из контента:

```typescript
function extractSearchTextFromChunk(
  fullContent?: string,
  preview?: string
): string | undefined {
  const text = fullContent || preview;
  if (!text) return undefined;
  
  // Извлечь первые 5 уникальных слов длиной > 4 символов
  const words = text
    .replace(/[^\wа-яё\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 100); // Первые 100 слов
  
  // Взять 5 уникальных слов
  const unique = [...new Set(words)].slice(0, 5);
  return unique.join(' ');
}
```

### 2. SourcesPanel.tsx — аналогичное исправление

**Строки 240-243** (`openDocumentWithHighlight`):

```typescript
// Вместо:
searchText: citationData.search_keywords?.length 
  ? citationData.search_keywords.join(' ')
  : cleanSearchText(citationData.content_preview || contentPreview),

// Использовать:
searchText: extractSearchTextFromContent(
  citationData.full_chunk_content, 
  citationData.content_preview || contentPreview
),
```

### 3. SourcesPanel.tsx — openPdfFromTextViewer

**Строки 390-404**: Передавать контент чанка вместо search_keywords:

```typescript
const openPdfFromTextViewer = async () => {
  if (!textViewerState.storagePath) return;
  
  // Извлечь поисковый текст из самого чанка
  const searchTextFromContent = extractSearchTextFromContent(
    textViewerState.chunkContent
  );
  
  setTextViewerState(prev => ({ ...prev, isOpen: false }));
  
  const citation = usedCitations.find(c => c.storage_path === textViewerState.storagePath);
  if (citation) {
    setViewerState({
      isOpen: true,
      documentId: citation.document_id,
      storagePath: citation.storage_path,
      documentName: citation.document,
      searchText: searchTextFromContent,  // ← Из контента, не из keywords
      pageNumber: citation.page_start || 1,
    });
  }
};
```

---

## Алгоритм extractSearchTextFromContent

```typescript
function extractSearchTextFromContent(
  fullContent?: string,
  preview?: string
): string | undefined {
  const text = fullContent || preview;
  if (!text) return undefined;
  
  // Русские стоп-слова
  const stopWords = new Set([
    'который', 'которая', 'которое', 'которые', 'также', 'однако',
    'после', 'перед', 'между', 'через', 'более', 'менее', 'очень',
    'этот', 'этого', 'этому', 'этим', 'этой', 'этих', 'этом',
    'того', 'тому', 'тем', 'той', 'тех', 'том', 'такой', 'таких',
    'было', 'были', 'будет', 'будут', 'быть', 'может', 'могут'
  ]);
  
  // Извлечь слова длиной > 4 символов, не стоп-слова
  const words = text
    .replace(/[^\wа-яёА-ЯЁ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()));
  
  // Взять первые 5-7 уникальных слов из начала текста
  const unique = [...new Set(words.slice(0, 50))].slice(0, 6);
  
  return unique.length > 0 ? unique.join(' ') : undefined;
}
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/chat/CitationLink.tsx` | Добавить `extractSearchTextFromContent`, использовать в `openPdfViewer` |
| `src/components/chat/SourcesPanel.tsx` | Добавить `extractSearchTextFromContent`, обновить `openDocumentWithHighlight` и `openPdfFromTextViewer` |

---

## Ожидаемый результат

**До**:
- TextViewer показывает: "...Vanish, розовый цвет упаковки рекламируемого товара..."
- PDF ищет: "25 знак мкту" → страница 12 (неверная)

**После**:
- TextViewer показывает: "...Vanish, розовый цвет упаковки рекламируемого товара..."
- PDF ищет: "Vanish розовый упаковки рекламируемого товара" → правильная страница

