
# Исправление трех проблем: Поисковик, Юрист, создание ролей Gemini/Claude

## Обнаруженные проблемы

### 1. Поисковик (Perplexity) не выдает веб-ссылки

**Причина**: Персональный чат (`useOptimizedChat.ts`) при получении метаданных из стрима сохраняет только `web_search_citations`, но НЕ сохраняет `perplexity_citations`. При этом edge-функция `chat-stream` для Perplexity отправляет цитаты именно в поле `perplexity_citations`.

В итоге ссылки от Perplexity API приходят, но теряются при обработке в клиенте.

**Решение**: В `useOptimizedChat.ts` добавить чтение `perplexity_citations` из метаданных и объединить с `web_search_citations`:

```typescript
// В обработке metadata:
web_search_citations: parsed.perplexity_citations || parsed.web_search_citations,
```

Также нужно обновить `DBMessage` в `src/types/chat.ts` чтобы `perplexity_citations` сохранялись при записи в БД.

### 2. Юрист не ищет в RAG-документах

**Причина**: Роль "Юрист" настроена с `strict_rag_mode: true` и имеет 21 папку в `folder_ids`. Из них большинство **пустые** (нет документов со статусом `ready`). Документы есть только в нескольких папках.

Однако FTS-поиск работает корректно (по логам видно "RAG: Final context has 10 chunks"). Проблема в том, что русский текст через `websearch_to_tsquery('russian', ...)` может не находить результатов для определенных запросов, и тогда система переключается на keyword fallback, который работает медленнее.

Фактически RAG РАБОТАЕТ для роли Юрист (по логам видно 10 чанков). Если у пользователя не работает - нужно проверить конкретный запрос. Но дополнительно стоит убедиться, что model `claude-sonnet-4-5-20250929` корректно обрабатывается.

**Дополнительная проблема**: Модель `claude-sonnet-4-5-20250929` используется для Юриста, но она **НЕ входит в список валидных моделей** Anthropic в edge-функции (строка 1122-1127). Система автоматически заменяет ее на `claude-sonnet-4-20250514`, что может вызывать путаницу.

**Решение**: Добавить `claude-sonnet-4-5-20250929` в список валидных моделей:

```typescript
const validAnthropicModels = [
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929',  // Добавить!
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
];
```

### 3. Ошибки при создании ролей для Gemini и Claude

**Причина**: В `ChatRoles.tsx` список `providerModels` содержит модели для типов `perplexity`, `openai`, `anthropic`, `lovable`, но **НЕТ типа `gemini`**. Когда администратор выбирает провайдер типа `gemini` (например "Gemini 2.5 Flash", "Gemini 2.5 Pro"), функция `getAvailableModels()` возвращает пустой массив, и список моделей не отображается.

Также модель `claude-sonnet-4-5-20250929` указана в списке UI, но edge-функция ее отбрасывает как невалидную.

**Решение**: Добавить `gemini` и `gigachat` в `providerModels`:

```typescript
gemini: [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
],
gigachat: [
  { value: 'GigaChat-Max', label: 'GigaChat Max' },
  { value: 'GigaChat-Pro', label: 'GigaChat Pro' },
  { value: 'GigaChat-Plus', label: 'GigaChat Plus' },
],
```

## Файлы для изменения

1. **`src/hooks/useOptimizedChat.ts`** -- добавить `perplexity_citations` в обработку метаданных
2. **`src/types/chat.ts`** -- добавить `perplexity_citations` в `DBMessage.metadata`
3. **`src/pages/ChatRoles.tsx`** -- добавить `gemini` и `gigachat` в `providerModels`
4. **`supabase/functions/chat-stream/index.ts`** -- добавить `claude-sonnet-4-5-20250929` в список валидных моделей Anthropic
