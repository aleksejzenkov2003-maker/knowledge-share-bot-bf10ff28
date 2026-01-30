
# План: Исправление передачи page_start из TextViewer в PDF viewer

## Проблема

При клике "Открыть PDF" из Text Viewer, документ всегда открывается на странице 1, хотя цитата указывает на страницу 3.

**Причина**: Функция `openPdfFromTextViewer` ищет citation по `storage_path`:

```typescript
const citation = usedCitations.find(c => c.storage_path === textViewerState.storagePath);
```

Но у документа cbg все 17 чанков имеют **одинаковый** `storage_path`, поэтому `find()` возвращает **первый** chunk (page_start: 1) вместо нужного (page_start: 3).

---

## Решение

### Изменения в `src/components/chat/SourcesPanel.tsx`

**1. Добавить `pageStart` в состояние textViewerState** (строки 49-56):

```typescript
const [textViewerState, setTextViewerState] = useState<{
  isOpen: boolean;
  documentName: string;
  chunkContent: string;
  highlightText?: string;
  chunkIndex?: number;
  storagePath?: string;
  pageStart?: number;  // <-- ДОБАВИТЬ
}>({ isOpen: false, documentName: '', chunkContent: '' });
```

**2. Сохранять pageStart при открытии citation** (функция `openCitation`, строки 427-437):

```typescript
const openCitation = async (citation: Citation) => {
  if (citation.full_chunk_content) {
    setTextViewerState({
      isOpen: true,
      documentName: citation.document,
      chunkContent: citation.full_chunk_content,
      highlightText: citation.content_preview,
      chunkIndex: citation.index,
      storagePath: citation.storage_path,
      pageStart: citation.page_start,  // <-- ДОБАВИТЬ
    });
  } else {
    // ...
  }
};
```

**3. Использовать сохранённый pageStart напрямую** (функция `openPdfFromTextViewer`, строки 448-478):

```typescript
const openPdfFromTextViewer = async () => {
  if (!textViewerState.storagePath) return;
  
  const searchTextFromContent = extractSearchTextFromContent(
    textViewerState.chunkContent
  );
  
  setTextViewerState(prev => ({ ...prev, isOpen: false }));
  
  // Find citation for additional metadata, but use stored pageStart
  const citation = usedCitations.find(c => 
    c.storage_path === textViewerState.storagePath && 
    c.index === textViewerState.chunkIndex  // <-- Match by index too!
  );
  
  // Use stored pageStart directly, not from found citation
  const pageNumber = textViewerState.pageStart || citation?.page_start || 1;
  
  // For Bitrix context, pre-fetch signed URL
  if (isBitrixContext && bitrixApiBaseUrl && bitrixToken && textViewerState.storagePath) {
    const signedUrl = await getSignedUrlViaApi(textViewerState.storagePath);
    if (signedUrl) {
      setPreSignedUrl(signedUrl);
    }
  }
  
  setViewerState({
    isOpen: true,
    documentId: citation?.document_id,
    storagePath: textViewerState.storagePath,
    documentName: textViewerState.documentName,
    searchText: searchTextFromContent,
    pageNumber: pageNumber,  // <-- Use stored value
  });
};
```

---

## Диаграмма потока

```text
БЫЛО:
Click citation [3] (page_start: 3)
        ↓
textViewerState = { storagePath: "cbg.pdf", chunkIndex: 3 }  // NO pageStart!
        ↓
Click "Open PDF"
        ↓
find(c => c.storage_path === "cbg.pdf")  // Returns FIRST match
        ↓
citation.page_start = 1  // WRONG!

СТАНЕТ:
Click citation [3] (page_start: 3)
        ↓
textViewerState = { storagePath: "cbg.pdf", chunkIndex: 3, pageStart: 3 }
        ↓
Click "Open PDF"
        ↓
pageNumber = textViewerState.pageStart = 3  // CORRECT!
```

---

## Результат

После исправления:
- При клике на цитату сохраняется `page_start` в `textViewerState`
- При переходе в PDF viewer используется сохранённый `pageStart` напрямую
- PDF viewer откроется на правильной странице (3), а не на странице 1
