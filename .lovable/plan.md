

# План: Единый Text Viewer для источников + улучшение поиска PDF

## Диагностика проблем

### Проблема 1: Источники не показывают TextViewer
На скриншоте видно, что при клике на источник из вкладки "Документы" сразу открывается PDF. У цитат есть TextContentViewer с полным текстом фрагмента, но у источников — нет.

**Код сейчас** (строки 527-563 в SourcesPanel.tsx):
```tsx
<div onClick={() => openDocumentWithHighlight(docInfo, content)}>
  ...
</div>
```

Функция `openDocumentWithHighlight` сразу открывает PDF Viewer, пропуская текстовый просмотр.

### Проблема 2: PDF поиск не находит текст
Поисковый запрос "доверься пятен соот" не находит текст в PDF, хотя он визуально есть (стр. 50). Причины:
- PDF.js text layer может иметь OCR-артефакты
- Извлечённые ключевые слова могут не совпадать с текстом в слое

---

## Решение

### 1. Добавить TextViewer для вкладки "Документы"

Изменить обработчик клика в Sources tab — открывать сначала TextContentViewer с текстом `content`, как для цитат.

**Изменения в SourcesPanel.tsx**:

```tsx
// Вместо прямого вызова openDocumentWithHighlight для Sources
// Открывать TextContentViewer

const openSourceTextViewer = (docInfo: string, content: string) => {
  // Найти storage_path для этого документа через ragContext/citations
  const matchingCitation = usedCitations.find(c => 
    docInfo.includes(c.document) || c.document.includes(docInfo.split(' | ')[0])
  );
  
  setTextViewerState({
    isOpen: true,
    documentName: docInfo.split(' | ')[0], // Только имя документа
    chunkContent: content,
    highlightText: undefined, // Весь текст важен
    storagePath: matchingCitation?.storage_path,
  });
};
```

Обновить onClick:
```tsx
<div onClick={() => openSourceTextViewer(docInfo, content)}>
```

### 2. Улучшить извлечение ключевых слов для PDF

Текущая функция `extractSearchTextFromContent` берёт первые 6 слов. Для лучшего поиска:
- Приоритет уникальным терминам (имена собственные, числа, редкие слова)
- Исключить ещё больше стоп-слов
- Если текст содержит кавычки — искать закавыченные фразы

```tsx
function extractSearchTextFromContent(
  fullContent?: string,
  preview?: string
): string | undefined {
  const text = fullContent || preview;
  if (!text) return undefined;
  
  // 1. Попробовать найти закавыченные фразы (наиболее специфичные)
  const quotedMatch = text.match(/[«"]([^»"]+)[»"]/);
  if (quotedMatch && quotedMatch[1].length > 10) {
    return quotedMatch[1].slice(0, 40); // Первые 40 символов закавыченной фразы
  }
  
  // 2. Расширенный список стоп-слов
  const stopWords = new Set([
    'который', 'которая', 'которое', 'которые', 'также', 'однако',
    'после', 'перед', 'между', 'через', 'более', 'менее', 'очень',
    'этот', 'этого', 'этому', 'этим', 'этой', 'этих', 'этом',
    'того', 'тому', 'того', 'той', 'тех', 'такой', 'таких',
    'было', 'были', 'будет', 'будут', 'быть', 'может', 'могут',
    'когда', 'если', 'чтобы', 'потому', 'поэтому', 'таким', 'образом',
    'является', 'являются', 'данный', 'данная', 'данные',
    'необходимо', 'следует', 'должен', 'должна', 'должны',
    'указанный', 'указанная', 'указанные', 'соответствующий'
  ]);
  
  // 3. Извлечь слова, приоритет длинным и уникальным
  const words = text
    .replace(/[^\wа-яёА-ЯЁ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()));
  
  // 4. Отсортировать по длине (длинные слова = более специфичные)
  const sorted = [...new Set(words)].sort((a, b) => b.length - a.length);
  
  // 5. Взять первые 5 уникальных слов
  const unique = sorted.slice(0, 5);
  
  return unique.length > 0 ? unique.join(' ') : undefined;
}
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/chat/SourcesPanel.tsx` | 1) Добавить `openSourceTextViewer` функцию. 2) Изменить onClick во вкладке Sources для вызова TextViewer вместо прямого PDF. 3) Улучшить `extractSearchTextFromContent` |
| `src/components/chat/CitationLink.tsx` | Синхронизировать улучшенную `extractSearchTextFromContent` |

---

## Визуальный результат

**До**:
- Клик на источник → сразу PDF → поиск не работает → неверная страница

**После**:
- Клик на источник → TextContentViewer с полным текстом фрагмента
- Кнопка "Открыть PDF" → переход в PDF с ключевыми словами из текста
- Поиск использует длинные уникальные слова или закавыченные фразы

---

## Порядок имплементации

1. Добавить функцию `openSourceTextViewer` в SourcesPanel
2. Обновить onClick для вкладки "Документы"
3. Улучшить `extractSearchTextFromContent` в обоих файлах
4. Обновить `openPdfFromTextViewer` для поддержки источников (не только цитат)

