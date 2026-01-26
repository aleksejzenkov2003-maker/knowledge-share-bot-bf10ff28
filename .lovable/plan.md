
# План исправления навигации по страницам в PDF Viewer

## Проблема
При открытии документа "Практика ППС - 1-1483-2024 (часть 2/46, стр. 51-100)" система передаёт номер страницы **51** в PDF viewer, но сам PDF-файл этой части содержит только 50 страниц (внутренняя нумерация 1-50). Это приводит к ошибке "Invalid page request".

## Причина
Функция `extractPageNumber` в `SourcesPanel.tsx` парсит название документа и извлекает первое число после "стр." — то есть 51 для диапазона "стр. 51-100". Но каждая часть PDF внутри себя нумеруется с 1.

---

## Решение

### 1. Исправить `extractPageNumber` в `SourcesPanel.tsx`

Изменить логику так, чтобы вычислять **внутреннюю страницу** файла:

```typescript
const extractPageNumber = (docInfo: string): number => {
  // Извлекаем диапазон страниц "стр. 51-100"
  const pageRangeMatch = docInfo.match(/стр\.?\s*(\d+)(?:\s*-\s*(\d+))?/i);
  
  if (pageRangeMatch) {
    const pageStart = parseInt(pageRangeMatch[1], 10);
    const pageEnd = pageRangeMatch[2] ? parseInt(pageRangeMatch[2], 10) : pageStart;
    const pagesPerPart = pageEnd - pageStart + 1; // 50 страниц на часть
    
    // Для частей: внутренняя нумерация всегда начинается с 1
    // Если это не первая часть (pageStart > 1), возвращаем 1
    if (pageStart > 1) {
      return 1; // Начинаем с первой страницы внутри части
    }
  }
  
  // Fallback для "часть X"
  const partMatch = docInfo.match(/часть\s*(\d+)/i);
  if (partMatch) {
    return 1; // Каждая часть начинается со страницы 1
  }
  
  return 1;
};
```

### 2. Улучшить поиск текста

Проблема: поиск слишком длинного/специфичного текста не даёт результатов.

**Решение в `SourcesPanel.tsx`:**

```typescript
// Ограничить searchText до первых 50-80 символов
// и убрать спецсимволы которые могут мешать поиску
const cleanSearchText = (text?: string): string | undefined => {
  if (!text) return undefined;
  
  return text
    .slice(0, 80) // Первые 80 символов
    .replace(/\s+/g, ' ') // Нормализовать пробелы
    .trim();
};
```

### 3. Добавить fallback на первую страницу в `DocumentViewer.tsx`

```typescript
useEffect(() => {
  // Если переданный pageNumber больше чем numPages, сбросить на 1
  if (numPages > 0 && currentPage > numPages) {
    console.log(`Page ${currentPage} exceeds numPages ${numPages}, resetting to 1`);
    setCurrentPage(1);
  }
}, [numPages, currentPage]);
```

### 4. Улучшить логику поиска в `DocumentViewer.tsx`

Если полный текст не найден, пробовать искать по ключевым словам:

```typescript
const performSearch = async (query: string) => {
  // ... существующий код ...
  
  // Если ничего не найдено, попробовать поиск по отдельным словам
  if (matches.length === 0 && query.length > 20) {
    const keywords = query.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
    for (const keyword of keywords) {
      // Повторить поиск по ключевому слову
    }
  }
};
```

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/components/chat/SourcesPanel.tsx` | Исправить `extractPageNumber` — всегда возвращать страницу 1 для частей документа |
| `src/components/documents/DocumentViewer.tsx` | Добавить проверку: если `currentPage > numPages`, сбросить на 1 |
| `src/components/documents/DocumentViewer.tsx` | Улучшить поиск — использовать более короткий текст и fallback на ключевые слова |

---

## Ожидаемый результат

1. При клике на "часть 2/46, стр. 51-100" откроется страница **1** (не 51)
2. Поиск будет работать по первым 50-80 символам текста
3. Если страница превышает количество страниц в документе — автоматический сброс на страницу 1
4. Если полный текст не найден — поиск по ключевым словам
