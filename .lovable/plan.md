
# План улучшения подсветки текста в PDF Viewer

## Проблема
При открытии документа с цитатой, найденный текст должен быть подсвечен желтым цветом, но это не работает корректно.

## Причины

1. **Текст разбит между span'ами** — PDF.js разбивает текст на множество элементов `<span>`, и искомая фраза часто распределена между несколькими span. Текущий код ищет совпадение только внутри одного span.

2. **Низкая видимость** — CSS правило `opacity: 0.4` делает весь текстовый слой почти невидимым, включая подсветку.

3. **Недостаточное время ожидания** — 500мс может быть мало для отрисовки текстового слоя.

---

## Решение

### 1. Улучшить алгоритм подсветки (DocumentViewer.tsx)

Использовать поиск по всему тексту страницы и подсвечивать отдельные слова:

```typescript
useEffect(() => {
  if (!highlightedText || !containerRef.current) return;

  const timeoutId = setTimeout(() => {
    const textLayer = containerRef.current?.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return;

    const spans = textLayer.querySelectorAll('span');
    
    // Разбиваем искомый текст на слова для более надежного поиска
    const searchWords = highlightedText
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3); // Слова длиннее 3 символов
    
    if (searchWords.length === 0) return;

    spans.forEach((span) => {
      const text = span.textContent || '';
      const textLower = text.toLowerCase();
      
      // Проверяем, содержит ли span любое из ключевых слов
      const matchingWord = searchWords.find(word => textLower.includes(word));
      
      if (matchingWord) {
        // Подсвечиваем найденное слово
        const regex = new RegExp(`(${matchingWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        span.innerHTML = text.replace(regex, '<mark class="pdf-highlight">$1</mark>');
      }
    });

    // Прокрутка к первому совпадению
    const firstHighlight = textLayer.querySelector('.pdf-highlight');
    if (firstHighlight) {
      firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 800); // Увеличить задержку для надежности

  return () => clearTimeout(timeoutId);
}, [highlightedText, currentPage, numPages]);
```

### 2. Улучшить CSS для видимости подсветки (index.css)

```css
/* Сделать текстовый слой более прозрачным, но подсветку яркой */
.react-pdf__Page__textContent {
  opacity: 0.2; /* Еще прозрачнее для обычного текста */
}

.react-pdf__Page__textContent .pdf-highlight {
  opacity: 1 !important;
  background-color: hsl(50 100% 50% / 0.9) !important; /* Ярче */
  color: hsl(0 0% 0%) !important;
  padding: 2px 4px;
  border-radius: 3px;
  box-shadow: 0 0 8px hsl(50 100% 50% / 0.6); /* Свечение */
  animation: highlight-pulse 1.5s ease-in-out 2; /* Анимация пульсации */
  position: relative;
  z-index: 100;
}

@keyframes highlight-pulse {
  0%, 100% { box-shadow: 0 0 8px hsl(50 100% 50% / 0.6); }
  50% { box-shadow: 0 0 20px hsl(50 100% 50% / 1); }
}
```

### 3. Добавить автопрокрутку к найденному тексту

Добавить `scrollIntoView` после применения подсветки, чтобы пользователь сразу видел результат.

---

## Итоговые изменения

| Файл | Изменение |
|------|-----------|
| `src/components/documents/DocumentViewer.tsx` | Улучшить алгоритм подсветки — искать по отдельным словам, добавить автопрокрутку к первому совпадению |
| `src/index.css` | Усилить визуальный эффект подсветки — добавить свечение и анимацию пульсации |

---

## Ожидаемый результат

1. При открытии документа ключевые слова из цитаты будут подсвечены желтым
2. Подсветка будет яркой и заметной благодаря свечению
3. Страница автоматически прокрутится к первому найденному слову
4. Анимация пульсации привлечет внимание к подсвеченному тексту
