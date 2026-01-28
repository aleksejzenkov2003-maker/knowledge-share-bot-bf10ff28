

# План исправления системы поиска по источникам и RAG

## Диагностика текущих проблем

### Выявленные баги:

1. **Re-ranking не вызывается для keyword fallback**
   - FTS часто не находит результаты (по логам: "FTS returned no results")
   - Keyword fallback находит чанки, но re-ranking вызывается ТОЛЬКО внутри блока FTS
   - В результате `smart_search: false` и низкокачественные результаты

2. **Keyword search использует примитивную экстракцию ключевых слов**
   - Текущий код: `message.split(/\s+/).filter(w => w.length > 3)`
   - Включает служебные слова, предлоги, частицы
   - Приводит к ложным совпадениям

3. **Content preview для поиска в документе берётся некорректно**
   - `cleanSearchText()` обрезает до 80 символов
   - Эти 80 символов могут не содержать ключевую информацию
   - При открытии документа поиск находит нерелевантное место

4. **Отсутствует контроль качества для keyword результатов**
   - `MIN_RELEVANCE_SCORE = 5` применяется только после rerank
   - Keyword search возвращает результаты с `keyword_matches = 2`, которые проходят в ответ

---

## Решение 1: Добавить re-ranking для keyword fallback

**Проблема**: Re-ranking вызывается только когда FTS успешен.

**Решение**: Вынести re-ranking в отдельный шаг после получения любых результатов.

**Изменения в `chat-stream/index.ts`**:

```typescript
// После блока keyword search (строка 408), добавить:

// STEP 3.5: Re-rank keyword results if FTS didn't work but keywords did
if (rankedChunks.length >= TOP_K_FINAL && ANTHROPIC_API_KEY && !usedSmartSearch) {
  console.log('RAG: Re-ranking keyword fallback results');
  try {
    const chunksForRerank = rankedChunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      document_name: chunk.document_name,
      section_title: chunk.section_title,
      article_number: chunk.article_number,
      fts_rank: chunk.relevance_score,
    }));

    const rerankResponse = await fetch(`${supabaseUrl}/functions/v1/rerank-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        query: message,
        chunks: chunksForRerank,
        top_k: TOP_K_FINAL,
      }),
    });

    if (rerankResponse.ok) {
      const rerankData = await rerankResponse.json();
      if (rerankData.ranked_chunks?.length > 0) {
        rankedChunks = rerankData.ranked_chunks.filter(
          (c: RankedChunk) => c.relevance_score >= MIN_RELEVANCE_SCORE
        );
        usedSmartSearch = true;
        console.log(`RAG: Re-ranked keyword results to ${rankedChunks.length} chunks`);
      }
    }
  } catch (err) {
    console.error('Keyword rerank error:', err);
  }
}
```

---

## Решение 2: Улучшить экстракцию ключевых слов

**Проблема**: Слишком простая логика `split(/\s+/).filter(w => w.length > 3)`.

**Решение**: Фильтровать стоп-слова и нормализовать запрос.

**Изменения**:

```typescript
// Вместо:
const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);

// Использовать:
const STOP_WORDS = new Set([
  'этот', 'который', 'какой', 'такой', 'каждый', 'весь', 'всего',
  'если', 'когда', 'чтобы', 'также', 'однако', 'потому', 'поэтому',
  'можно', 'нужно', 'будет', 'было', 'быть', 'есть', 'более', 'менее',
  'очень', 'только', 'уже', 'еще', 'что', 'как', 'для', 'при',
]);

const keywords = message
  .toLowerCase()
  .replace(/[^\wа-яё\s]/gi, ' ') // Remove punctuation
  .split(/\s+/)
  .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  .slice(0, 10); // Limit to 10 keywords
```

---

## Решение 3: Улучшить content_preview для навигации

**Проблема**: 80 символов из начала чанка не содержат ключевую информацию.

**Решение**: Найти фрагмент, содержащий ключевые слова запроса.

**Изменения в формировании citations**:

```typescript
// Функция для поиска релевантного фрагмента
function extractRelevantPreview(content: string, query: string, maxLen: number = 200): string {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  
  if (queryWords.length === 0) {
    return content.slice(0, maxLen);
  }
  
  // Find the position of the first keyword match
  const contentLower = content.toLowerCase();
  let bestPos = 0;
  
  for (const word of queryWords) {
    const pos = contentLower.indexOf(word);
    if (pos !== -1) {
      bestPos = Math.max(0, pos - 50); // Start 50 chars before match
      break;
    }
  }
  
  return content.slice(bestPos, bestPos + maxLen);
}

// В формировании citations (строка 1169):
content_preview: extractRelevantPreview(chunk.content, message, 300),
```

---

## Решение 4: Увеличить минимальный порог и добавить fallback

**Проблема**: Результаты с низкой оценкой попадают в ответ.

**Решение**: 
- Увеличить `MIN_RELEVANCE_SCORE` до 6
- Если после фильтрации не осталось результатов — вернуть топ-3 с пометкой о низкой уверенности

```typescript
const MIN_RELEVANCE_SCORE = 6; // Было 5

// После фильтрации:
if (rankedChunks.length === 0 && allRankedChunks.length > 0) {
  // Fallback: use top 3 even if below threshold, but mark as low confidence
  rankedChunks = allRankedChunks.slice(0, 3);
  console.log('RAG: Using low-confidence fallback (top 3 below threshold)');
}
```

---

## Решение 5: Улучшить поиск в DocumentViewer

**Проблема**: Поиск по 80 символам часто не находит совпадений.

**Решение**: Увеличить длину и использовать более умный keyword fallback.

**Изменения в `SourcesPanel.tsx`**:

```typescript
// Функция cleanSearchText - увеличить до 150 символов
const cleanSearchText = (text?: string): string | undefined => {
  if (!text) return undefined;
  
  return text
    .slice(0, 150) // Увеличить с 80 до 150
    .replace(/\s+/g, ' ')
    .trim();
};
```

---

## Файлы для изменения

1. **`supabase/functions/chat-stream/index.ts`**:
   - Добавить re-ranking для keyword fallback (~строка 408)
   - Улучшить экстракцию ключевых слов (~строка 372)
   - Добавить функцию `extractRelevantPreview`
   - Использовать её в формировании citations (~строка 1169)
   - Увеличить `MIN_RELEVANCE_SCORE` до 6

2. **`src/components/chat/SourcesPanel.tsx`**:
   - Увеличить `cleanSearchText` до 150 символов
   - Улучшить отображение документа-источника

---

## Ожидаемые результаты

| Проблема | До | После |
|----------|-----|-------|
| Re-ranking | Только для FTS | Для FTS и keyword fallback |
| smart_search | false (всегда) | true (когда rerank успешен) |
| Ключевые слова | Все слова > 3 символов | Фильтрация стоп-слов |
| Content preview | 80 символов с начала | 150 символов с ключевыми словами |
| Релевантность | 0.2 (нерелевантно) | 0.6+ (только качественные) |

---

## Техническая секция

### Порядок имплементации

1. Добавить re-ranking для keyword fallback
2. Улучшить экстракцию ключевых слов  
3. Добавить функцию extractRelevantPreview
4. Обновить формирование content_preview
5. Увеличить MIN_RELEVANCE_SCORE
6. Увеличить cleanSearchText в UI
7. Задеплоить и протестировать

### Оценка времени

- Изменения в chat-stream: 2-3 часа
- UI исправления: 30 минут
- Тестирование: 1 час

**Общее время**: ~4 часа

