
# План: Исправление навигации PDF viewer на страницу цитаты

## Проблема

PDF viewer открывается на странице 1 вместо страницы из цитаты (например, стр. 3), несмотря на корректные данные `page_start` в базе.

**Причина**: Автоматический поиск `performSearch()` перезаписывает `currentPage`:

```text
1. setCurrentPage(3)        ← pageNumber из цитаты
2. performSearch("Продмаш") ← автопоиск после загрузки PDF
3. setCurrentPage(1)        ← поиск находит "Продмаш" на стр. 1 и переключает туда
```

## Решение

Изменить логику `performSearch` чтобы приоритизировать страницу из `pageNumber`:

1. Если задан `pageNumber` и эта страница содержит ключевые слова — оставаться на ней
2. Только если целевая страница НЕ содержит совпадений — переходить на лучшую альтернативу

## Изменения в файле

**`src/components/documents/DocumentViewer.tsx`**:

### 1. Добавить состояние для начальной страницы

```typescript
// Около строки 71
const [initialTargetPage, setInitialTargetPage] = useState(pageNumber);

// Около строки 92
useEffect(() => {
  setCurrentPage(pageNumber);
  setInitialTargetPage(pageNumber); // Track initial target
}, [pageNumber]);
```

### 2. Модифицировать performSearch (строки 273-296)

```typescript
if (pageScores.length > 0) {
  // Priority: Stay on initial target page if it has matches
  const targetPageScore = pageScores.find(ps => ps.pageNum === initialTargetPage);
  
  if (targetPageScore && targetPageScore.score > 0) {
    // Target page has matches - stay on it
    console.log(`Keeping target page ${initialTargetPage} (score: ${targetPageScore.score})`);
    setCurrentPage(initialTargetPage);
  } else {
    // Target page has no matches - navigate to best matching page
    setCurrentPage(pageScores[0].pageNum);
  }
  
  // Highlight the most specific keyword
  const highlightWord = keywords.find(k => /^\d+$/.test(k)) || 
                       [...keywords].sort((a, b) => b.length - a.length)[0];
  setHighlightedText(highlightWord);
  
  // ... rest of the code
}
```

### 3. Модифицировать fallback-поиск (около строки 350)

```typescript
if (matches.length > 0) {
  // Priority: Stay on initial target if it has matches
  const targetMatch = matches.find(m => m.pageIndex === initialTargetPage);
  if (targetMatch) {
    setCurrentPage(initialTargetPage);
    setCurrentMatchIndex(matches.indexOf(targetMatch));
  } else {
    setCurrentPage(matches[0].pageIndex);
    setCurrentMatchIndex(0);
  }
  // ...
}
```

## Диаграмма потока

```text
БЫЛО:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ pageNumber = 3  │ ──▶ │ performSearch() │ ──▶ │ currentPage = 1 │
│                 │     │ finds match p.1 │     │ (WRONG!)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘

СТАНЕТ:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ pageNumber = 3  │ ──▶ │ performSearch() │ ──▶ │ currentPage = 3 │
│                 │     │ p.3 has match?  │     │ (CORRECT!)      │
│                 │     │ YES → keep p.3  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Результат

После исправления:
- PDF viewer откроется на странице 3 (из цитаты)
- Поиск подсветит ключевые слова на этой странице
- Навигация "Next/Prev" позволит перейти к другим совпадениям
- Если целевая страница не содержит совпадений — fallback на первую найденную
