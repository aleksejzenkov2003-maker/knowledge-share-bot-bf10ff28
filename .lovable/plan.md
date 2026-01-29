

# План: Показ реального фрагмента цитаты с альтернативным Text Viewer

## Диагностика проблемы

На скриншотах видно:
1. **Цитата [2]** показывает текст: "словарях явно не исключает «обувь», но в МКТУ она значится как отдельный объект того же 25 класса..."
2. **PDF Viewer** ищет "25" (или "словарях явно не исключает") — и показывает страницу 1 (оглавление)
3. **Текст в документе существует**, но PDF.js не может его найти (возможно OCR-текст отличается от визуального)

### Корневые причины

1. **`content_preview`** формируется из `extractRelevantPreview()` — это sliding window по ИСХОДНОМУ запросу, а не по конкретной цитате Claude
2. **`search_keywords`** — ключевые слова из запроса пользователя, не из цитаты
3. **PDF.js text layer** может иметь другой текст чем визуально виден (OCR артефакты)
4. **Нет связи** между тем что Claude написал в ответе и конкретным chunk.content

---

## Решение: Dual-Mode Document Viewer (PDF + Text)

### Концепция

Вместо попытки найти текст в PDF через text layer (что ненадёжно) — показывать ОРИГИНАЛЬНЫЙ текст чанка напрямую с подсветкой цитаты:

```text
┌─────────────────────────────────────────────────┐
│  Ruk_tz_rospatent  (часть 2/46)                 │
│  ┌─────────┬──────────────┐                     │
│  │ 📄 PDF  │ 📝 Текст     │  ← Переключатель    │
│  └─────────┴──────────────┘                     │
│                                                 │
│  Контент чанка с подсветкой:                   │
│  ...В международных словарях явно не           │
│  исключает [«обувь», но в МКТУ она            │
│  значится как отдельный объект того же         │
│  25 класса. Вместе с тем «одежда» и            │
│  «обувь» не тождественны...] ← ПОДСВЕТКА      │
│                                                 │
│  [Открыть полный PDF]                          │
└─────────────────────────────────────────────────┘
```

---

## Изменения

### 1. Добавить полный `chunk_content` в Citation

**Файл**: `supabase/functions/chat-stream/index.ts`

Сейчас:
```typescript
content_preview: extractRelevantPreview(chunk.content, message, 300),
```

Добавить:
```typescript
content_preview: extractRelevantPreview(chunk.content, message, 300),
full_chunk_content: chunk.content, // Полный текст чанка для Text Viewer
```

### 2. Обновить тип Citation

**Файл**: `src/types/chat.ts`

```typescript
export interface Citation {
  // ... existing fields ...
  content_preview?: string;
  full_chunk_content?: string;  // NEW: полный текст чанка для text viewer
  storage_path?: string;
  search_keywords?: string[];
}
```

### 3. Создать новый компонент TextContentViewer

**Файл**: `src/components/documents/TextContentViewer.tsx`

```typescript
// Dialog с текстом чанка и подсветкой цитаты
// - Отображает full_chunk_content 
// - Подсвечивает content_preview (или конкретную фразу)
// - Кнопка "Открыть полный PDF" для перехода в DocumentViewer
```

### 4. Обновить CitationLink — режим Text по умолчанию

**Файл**: `src/components/chat/CitationLink.tsx`

При клике на цитату:
1. Если есть `full_chunk_content` → открыть TextContentViewer
2. Если нет → fallback на PDF Viewer (как сейчас)
3. Из TextContentViewer можно открыть полный PDF

### 5. Добавить вкладку "Текст" в SourcesPanel

**Файл**: `src/components/chat/SourcesPanel.tsx`

Для каждой цитаты показывать:
- Полный текст чанка (сворачиваемый)
- Кнопка "Открыть в PDF"

---

## Детали реализации

### TextContentViewer.tsx

```tsx
interface TextContentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  chunkContent: string;
  highlightText?: string;  // Фраза для подсветки
  onOpenPdf?: () => void;  // Переход в PDF
}

export function TextContentViewer({
  isOpen,
  onClose,
  documentName,
  chunkContent,
  highlightText,
  onOpenPdf,
}: TextContentViewerProps) {
  // Подсветить highlightText в chunkContent
  const highlightedContent = useMemo(() => {
    if (!highlightText) return chunkContent;
    
    const escaped = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return chunkContent.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
  }, [chunkContent, highlightText]);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {documentName}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/30">
          <div 
            className="prose prose-sm max-w-none whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: highlightedContent }}
          />
        </ScrollArea>
        
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
          {onOpenPdf && (
            <Button onClick={onOpenPdf}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Открыть PDF
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### CitationLink.tsx — обновлённая логика

```tsx
const handleClick = async (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  if (!citation) {
    toast({ title: "Источник не найден", variant: "destructive" });
    return;
  }

  // Приоритет 1: Text Viewer (если есть полный контент чанка)
  if (citation.full_chunk_content) {
    setTextViewerState({
      isOpen: true,
      documentName: citation.document,
      chunkContent: citation.full_chunk_content,
      highlightText: citation.content_preview,
    });
    return;
  }

  // Приоритет 2: PDF Viewer (fallback)
  // ... existing PDF logic ...
};
```

---

## Преимущества решения

| Проблема | Текущее | После |
|----------|---------|-------|
| Текст не найден в PDF | Показывает оглавление | Показывает реальный текст чанка |
| OCR артефакты в PDF | Поиск не работает | Используем исходный текст |
| Непонятно что цитируется | 150 символов preview | Полный контекст с подсветкой |
| Навигация в PDF | Часто неточная | Text по умолчанию + PDF опционально |

---

## Порядок имплементации

1. **Обновить тип Citation** — добавить `full_chunk_content`
2. **Обновить chat-stream** — передавать `full_chunk_content: chunk.content`
3. **Создать TextContentViewer** — компонент просмотра текста
4. **Обновить CitationLink** — использовать TextContentViewer как primary mode
5. **Обновить SourcesPanel** — показывать полный текст сворачиваемыми блоками

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/types/chat.ts` | Добавить `full_chunk_content?: string` |
| `supabase/functions/chat-stream/index.ts` | Передавать `full_chunk_content: chunk.content` |
| `src/components/documents/TextContentViewer.tsx` | Новый компонент |
| `src/components/chat/CitationLink.tsx` | Text Viewer как primary mode |
| `src/components/chat/SourcesPanel.tsx` | Показывать полный текст цитат |

