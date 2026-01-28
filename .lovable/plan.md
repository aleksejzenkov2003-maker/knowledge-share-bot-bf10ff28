
# План исправления проблем с выдачей источников и цитат

## Резюме выявленных проблем

Анализ показал несколько критических проблем в работе RAG-системы:

1. **FTS функция не возвращает метаданные родительского документа** — для разбитых PDF не показывается оригинальное имя
2. **Re-ranking не срабатывает** — все записи в логах имеют `smart_search: false` 
3. **Нет фильтрации по релевантности** — все 10 чанков попадают в citations без порога качества
4. **Нет фильтрации по фактическому использованию** — модель не всегда использует все предоставленные источники

---

## Решение 1: Обновить FTS функцию для включения parent document info

**Проблема**: Функция `smart_fts_search` не возвращает `parent_document_id`, `original_document_name`, `part_number`, `total_parts`.

**Решение**: Модифицировать функцию для JOIN с parent documents и возврата оригинального имени.

**SQL миграция**:
```sql
CREATE OR REPLACE FUNCTION public.smart_fts_search(
  query_text text, 
  p_folder_ids uuid[] DEFAULT NULL::uuid[], 
  match_count integer DEFAULT 50
)
RETURNS TABLE(
  id uuid, 
  document_id uuid, 
  content text, 
  chunk_index integer, 
  section_title text, 
  article_number text, 
  chunk_type text, 
  document_name text, 
  fts_rank real,
  -- NEW: parent document fields
  parent_document_id uuid,
  original_document_name text,
  part_number integer,
  total_parts integer
)
```

---

## Решение 2: Добавить логирование и исправить re-ranking flow

**Проблема**: Re-ranking не срабатывает или результаты теряются.

**Решение**: 
- Добавить детальное логирование в `chat-stream`
- Проверить условие вызова (ftsResults.length > TOP_K_FINAL)
- Добавить fallback с сохранением статуса

**Изменения в chat-stream/index.ts**:
```typescript
// Логировать условие
console.log(`RAG: FTS results: ${ftsResults.length}, TOP_K_FINAL: ${TOP_K_FINAL}, ANTHROPIC_KEY: ${!!ANTHROPIC_API_KEY}`);

// Изменить условие — вызывать rerank даже если результатов = TOP_K_FINAL
if (ANTHROPIC_API_KEY && ftsResults.length >= TOP_K_FINAL) {
  // ... rerank logic
}
```

---

## Решение 3: Добавить фильтрацию по порогу релевантности

**Проблема**: Чанки с низкой оценкой (1-4) попадают в ответ.

**Решение**: Добавить минимальный порог `MIN_RELEVANCE_SCORE = 5`.

**Изменения**:
```typescript
const MIN_RELEVANCE_SCORE = 5;

// После re-ranking — фильтровать
rankedChunks = rerankData.ranked_chunks.filter(
  (c: RankedChunk) => c.relevance_score >= MIN_RELEVANCE_SCORE
);
```

---

## Решение 4: Фильтрация citations по фактическому использованию

**Проблема**: Все 10 источников добавляются в citations, даже если модель их не цитировала.

**Решение**: Парсить ответ модели на наличие ссылок [1], [2], etc. и включать только использованные.

**Изменения в формировании citations**:
```typescript
// После получения fullContent — извлечь упомянутые индексы
const usedIndices = new Set<number>();
const citationMatches = fullContent.matchAll(/\[(\d+)\]/g);
for (const match of citationMatches) {
  usedIndices.add(parseInt(match[1], 10));
}

// Фильтровать citations
const citations = rankedChunks
  .map((chunk, idx) => ({ ... }))
  .filter((c) => usedIndices.size === 0 || usedIndices.has(c.index));
```

---

## Решение 5: Улучшить отображение relevance в UI

**Проблема**: UI показывает "Релевантность: 10%" вместо правильного значения.

**Текущий код в SourcesPanel** (строка 443):
```typescript
<span>Релевантность: {(citation.relevance * 10).toFixed(0)}%</span>
```

**Проблема**: `relevance` уже в шкале 0-10, умножение на 10 дает 0-100, но FTS fallback дает 0.1-1.0, что после умножения = 1-10%.

**Решение**: Нормализовать relevance в edge function ДО отправки:
```typescript
// В chat-stream при формировании citations
relevance: Math.min(chunk.relevance_score / 10, 1), // Normalize to 0-1
```

**UI изменение**:
```typescript
<span>Релевантность: {Math.round(citation.relevance * 100)}%</span>
```

---

## Файлы для изменения

1. **SQL миграция** — обновить `smart_fts_search` функцию
2. **supabase/functions/chat-stream/index.ts**:
   - Улучшить логирование
   - Изменить условие вызова rerank
   - Добавить фильтрацию по MIN_RELEVANCE_SCORE
   - Добавить парсинг фактически использованных citations
   - Нормализовать relevance score
3. **src/components/chat/SourcesPanel.tsx**:
   - Исправить отображение процента релевантности

---

## Ожидаемые результаты

| Проблема | До | После |
|----------|-----|-------|
| Имя документа | "Практика ППС (часть 17/52)" | "Практика ППС -1-1483" + "(часть 17)" |
| Re-ranking | Не работает (fallback на FTS) | Работает, оценки 0-10 |
| Релевантность | "10%" (некорректно) | "85%" (корректно) |
| Лишние источники | 10 из 10 всегда | Только фактически использованные |
| Нерелевантные | Показываются все | Скрыты (score < 5) |

---

## Техническая секция

### Порядок имплементации

1. **SQL миграция** (smart_fts_search) — добавить parent document fields
2. **chat-stream** — все изменения логики
3. **SourcesPanel** — UI исправление
4. **Деплой и тест**

### Оценка времени

- SQL миграция: 30 минут
- chat-stream изменения: 1-2 часа  
- UI исправление: 15 минут
- Тестирование: 1 час

**Общее время**: ~3-4 часа
