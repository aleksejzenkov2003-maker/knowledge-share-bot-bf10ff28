

# Исправление 4 проблем: модели Anthropic, двойная генерация, производительность, Excel в RAG

## Проблема 1: Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus -- HTTP 500

**Причина**: `max_tokens: 16384` в запросе к Anthropic API. Claude 3 Opus поддерживает максимум **4096 output tokens**, а Claude 3.5 Sonnet/Haiku -- **8192**. Отправка 16384 вызывает `400 invalid_request_error`, которая в нашем коде превращается в 500.

**Решение**: Добавить маппинг `max_tokens` по модели в `chat-stream/index.ts` и `chat/index.ts`:

```text
claude-sonnet-4-20250514     -> 16384 (OK)
claude-sonnet-4-5-20250929   -> 16384 (OK)
claude-3-5-sonnet-20241022   -> 8192
claude-3-5-haiku-20241022    -> 8192
claude-3-opus-20240229       -> 4096
```

**Файлы**:
- `supabase/functions/chat-stream/index.ts` -- строки 1152-1168 (Anthropic request), добавить функцию `getAnthropicMaxTokens(model)` и использовать вместо хардкода `16384`
- `supabase/functions/chat/index.ts` -- аналогичное изменение в `callAnthropic()`

---

## Проблема 2: Двойная генерация

**Причина**: В `ChatInputEnhanced.tsx` кнопка "Отправить" и обработчик Enter обе вызывают `onSend()`. Если пользователь нажимает Enter и одновременно срабатывает `onClick`, может произойти двойной вызов. Хотя в `useOptimizedChat.ts` есть проверка `if (isLoading) return`, между двумя вызовами может быть гонка (state ещё не обновился).

**Решение**:
- В `useOptimizedChat.ts` добавить `useRef` для блокировки параллельных вызовов `sendMessage` (мьютекс через ref, не зависящий от рендера):
  ```text
  const sendingRef = useRef(false);
  // В начале sendMessage:
  if (sendingRef.current) return;
  sendingRef.current = true;
  // В finally:
  sendingRef.current = false;
  ```

**Файлы**:
- `src/hooks/useOptimizedChat.ts` -- добавить ref-мьютекс в `sendMessage`

---

## Проблема 3: Быстродействие и стабильность

**Улучшения в `chat-stream/index.ts`**:

1. **Таймаут для API-вызовов**: Обернуть `fetch` к провайдерам в `AbortController` с таймаутом 120 сек (300 сек для deep-research). Сейчас зависший запрос к провайдеру блокирует Edge Function до её таймаута.

2. **Быстрый fallback**: Если Anthropic/Perplexity возвращает ошибку (не только 401), пробовать fallback на другого провайдера. Сейчас fallback работает только при 401 от Perplexity.

3. **Уменьшить размер RAG контекста для быстрых моделей**: Для моделей с `haiku` или `flash` в названии ограничить RAG до 10 чанков вместо 20, чтобы ускорить генерацию.

**Файлы**:
- `supabase/functions/chat-stream/index.ts` -- добавить таймаут, расширить fallback, оптимизировать RAG

---

## Проблема 4: Excel файлы не воспринимаются в RAG

**Возможные причины** (нужно проверить по логам):

1. **Статус документа**: Excel мог застрять в статусе `pending` или `error` и не попадать в RAG-поиск (фильтр `status = 'ready'`).

2. **FTS не работает с табличными данными**: Формат `Заголовок: Значение` плохо индексируется через `content_tsv` (tsvector). Ключевые слова разбиваются точками/двоеточиями.

3. **Chunking issues**: Функция `chunkExcelText` может создавать чанки со слишком коротким/пустым `content`, которые не матчатся при поиске.

**Решение**:
- В `process-document/index.ts` -- убедиться что после чанкинга Excel обновляется `content_tsv` для full-text search
- Добавить логирование длины каждого Excel чанка
- Проверить что `chunkExcelText` корректно обрабатывает файлы с разделителем `---`

**Файлы**:
- `supabase/functions/process-document/index.ts` -- проверить и исправить обработку Excel чанков, добавить диагностику

---

## Порядок реализации

1. Маппинг `max_tokens` для Anthropic (критический баг)
2. Ref-мьютекс для двойной генерации
3. Таймауты и fallback для стабильности
4. Диагностика и исправление Excel в RAG

## Затронутые файлы

- `supabase/functions/chat-stream/index.ts`
- `supabase/functions/chat/index.ts`
- `src/hooks/useOptimizedChat.ts`
- `supabase/functions/process-document/index.ts`
