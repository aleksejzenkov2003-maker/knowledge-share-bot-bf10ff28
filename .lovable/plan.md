

# План: Исправление отображения источников в Bitrix-чатах

## Обнаруженная проблема

Edge Function `bitrix-chat-api` **не захватывает метаданные с источниками** из ответа `chat-stream`.

### Как `chat-stream` отправляет данные

```javascript
// Отдельный chunk типа 'metadata'
data: {"type":"metadata","response_time_ms":500,"rag_context":["..."],"citations":[...],"web_search_citations":[...],"web_search_used":true}
```

### Как `bitrix-chat-api` их обрабатывает (текущий код)

```typescript
// Строки 1282-1284 (personal chat) и 1527-1529 (department chat)
if (parsed.citations || parsed.response_time_ms) {
  metadata = { ...metadata, ...parsed };
}
```

Этот код **пропускает** chunk с `type: 'metadata'`, потому что:
1. Он проверяет только `citations` и `response_time_ms`
2. Но metadata chunk содержит `type`, `rag_context`, `web_search_citations`, `smart_search` и т.д.

---

## Решение

Изменить условие для захвата метаданных в 4 местах:

### Файл: `supabase/functions/bitrix-chat-api/index.ts`

| Место | Строки | Функция |
|-------|--------|---------|
| 1 | ~1282-1284 | `handleSendPersonalMessage` |
| 2 | ~1527-1529 | `handleSendDepartmentMessage` |
| 3 | ~1835-1837 | `handleRegeneratePersonalMessage` |
| 4 | ~1885-1887 | `handleRegenerateDepartmentMessage` |

### Изменение кода

**Было:**
```typescript
if (parsed.citations || parsed.response_time_ms) {
  metadata = { ...metadata, ...parsed };
}
```

**Станет:**
```typescript
// Захватываем metadata chunk ИЛИ отдельные поля
if (parsed.type === 'metadata' || 
    parsed.citations || 
    parsed.response_time_ms || 
    parsed.rag_context || 
    parsed.web_search_citations) {
  // Не копируем поля type и content в metadata
  const { type, content, ...metaFields } = parsed;
  metadata = { ...metadata, ...metaFields };
}
```

---

## Дополнительная проверка

Убедимся, что фронтенд правильно обрабатывает данные. В `BitrixPersonalChat.tsx` (строки 546-550) логика уже корректная:

```typescript
if (parsed.citations) metadata.citations = parsed.citations;
if (parsed.response_time_ms) metadata.responseTime = parsed.response_time_ms;
if (parsed.web_search_citations) metadata.webSearchCitations = parsed.web_search_citations;
if (parsed.web_search_used) metadata.webSearchUsed = parsed.web_search_used;
if (parsed.rag_context) metadata.ragContext = parsed.rag_context;
```

Этот код работает, но данные не доходят из-за проблемы в Edge Function.

---

## Порядок реализации

1. Обновить `handleSendPersonalMessage` (строки ~1282-1284)
2. Обновить `handleSendDepartmentMessage` (строки ~1527-1529)
3. Обновить `handleRegeneratePersonalMessage` (строки ~1835-1837)
4. Обновить `handleRegenerateDepartmentMessage` (строки ~1885-1887)
5. Деплой Edge Function `bitrix-chat-api`

---

## Ожидаемый результат

После исправления:
- В ответах появятся badges "X источников", "X цитат", "X веб"
- При клике откроется Sheet с SourcesPanel
- Источники будут кликабельными для навигации

