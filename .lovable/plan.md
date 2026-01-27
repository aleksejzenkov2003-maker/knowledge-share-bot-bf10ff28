
# План: Исправление Bitrix-чата (Источники, Перегенерация, Таблицы)

## Обнаруженные проблемы

### 1. Источники не отображаются в ответах

**Корневая причина:** При отправке сообщений в Department Chat и перегенерации metadata корректно парсится из стрима и сохраняется в БД, но на фронтенде есть несколько мест, где источники теряются:

1. **BitrixDepartmentChat**: При загрузке сообщений из API (`handleGetMessages`), данные не маппятся в формат, который использует `BitrixChatMessage`
2. **API endpoint `/department/messages`** (строка ~1601-1621): Возвращает `messages.reverse()`, но не включает все необходимые поля metadata для отображения

**Проверка API-ответа:**
```typescript
// Текущий возврат:
return new Response(JSON.stringify({
  messages: messages.reverse(),
  chat_id: chatId,
  user_id: userId
}), { ... });
```

Сообщения возвращаются, но фронтенд их не конвертирует в нужный формат.

**Место проблемы на фронтенде:**
```typescript
// BitrixDepartmentChat.tsx линии 246-248
const messagesResponse = await fetch(`${apiBaseUrl}/department/messages?limit=100`, ...);
if (messagesResponse.ok) {
  const messagesData = await messagesResponse.json();
  setMessages(messagesData.messages || []); // ← Нет маппинга metadata!
}
```

### 2. Перегенерация вызывает того же агента

**Корневая причина:** В Personal Chat отсутствует флаг `is_department_chat: true` при перегенерации, что приводит к неправильной работе RAG.

Смотрим на строки 1852-1862:
```typescript
const chatRequest = {
  message: userMessage.content,
  role_id: effectiveRoleId,
  department_id: departmentId,
  message_history: messages,
  // НЕТ is_department_chat для Personal Chat (возможно, это ожидаемо)
  attachments: ...
};
```

Но более важная проблема - в Personal Chat сохранение метаданных в сообщение не включает `role_id`, поэтому последующие запросы не знают, какой агент использовался.

### 3. Таблицы отображаются некорректно

**Корневая причина:** LLM генерирует ASCII-таблицы (с `|------|`), которые не являются валидными GFM (GitHub Flavored Markdown) таблицами.

Пример невалидной таблицы от LLM:
```
| Компы МКТУ | Оценка полноты |------------|---------------|
```

Валидная GFM таблица требует:
```
| Компы МКТУ | Оценка полноты |
|------------|---------------|
```

**ReactMarkdown с remark-gfm** строго следует GFM спецификации и не может парсить нестандартные ASCII-таблицы.

---

## Решение

### Изменение 1: Исправить загрузку сообщений в BitrixDepartmentChat

**Файл:** `src/pages/BitrixDepartmentChat.tsx`
**Строки:** ~242-252

Добавить правильный маппинг при загрузке сообщений:

```typescript
const messagesResponse = await fetch(`${apiBaseUrl}/department/messages?limit=100`, {
  headers: { 'Authorization': `Bearer ${token}` },
});
if (messagesResponse.ok) {
  const messagesData = await messagesResponse.json();
  // Маппим сообщения в правильный формат с metadata
  const mappedMessages: DepartmentMessage[] = (messagesData.messages || []).map((m: any) => ({
    id: m.id,
    message_role: m.message_role,
    content: m.content,
    created_at: m.created_at,
    role_id: m.role_id,
    metadata: m.metadata || {},
  }));
  setMessages(mappedMessages);
}
```

### Изменение 2: Добавить role_id в сохраняемые метаданные Personal Chat

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`

В функции `handleSendPersonalMessage` (строка ~1287-1295) и `handleRegeneratePersonalMessage` (строка ~1903-1910) добавить `role_id` в метаданные:

```typescript
// При сохранении сообщения ассистента
await supabase
  .from('messages')
  .insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: fullResponse,
    metadata: {
      ...metadata,
      role_id: roleId,  // ← Добавить!
    }
  });
```

### Изменение 3: Улучшить парсинг ASCII-таблиц

**Файл:** `src/components/chat/BitrixChatMessage.tsx`

Добавить препроцессор Markdown перед рендерингом для конвертации ASCII-таблиц в GFM формат:

```typescript
// Функция для нормализации таблиц
const normalizeMarkdownTables = (content: string): string => {
  // Паттерн для поиска строк с разделителями в середине вместо отдельной строки
  // Например: "| Cell1 | Cell2 |------|------|"
  const malformedTablePattern = /(\|[^\n|]+\|)(-+\|)+\s*\n/g;
  
  return content.replace(malformedTablePattern, (match, header) => {
    // Подсчитываем количество колонок в заголовке
    const columns = (header.match(/\|/g) || []).length - 1;
    const separator = '|' + Array(columns).fill('---').join('|') + '|\n';
    return header + '\n' + separator;
  });
};

// В рендере:
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  ...
>
  {normalizeMarkdownTables(message.content)}
</ReactMarkdown>
```

### Изменение 4: Исправить передачу roleId при рендере сообщений

**Файл:** `src/pages/BitrixDepartmentChat.tsx`

В функции `convertToMessage` добавить `roleId`:

```typescript
const convertToMessage = (msg: DepartmentMessage): Message => ({
  id: msg.id,
  role: msg.message_role,
  content: msg.content,
  timestamp: new Date(msg.created_at),
  responseTime: msg.metadata?.response_time_ms,
  ragContext: msg.metadata?.rag_context,
  citations: msg.metadata?.citations,
  webSearchCitations: msg.metadata?.web_search_citations,
  webSearchUsed: msg.metadata?.web_search_used,
  roleId: msg.role_id || msg.metadata?.role_id,  // ← Добавить!
});
```

И передать `currentRoleId` в `BitrixChatMessage`:

```typescript
<BitrixChatMessage
  message={convertToMessage(message)}
  currentRoleId={message.role_id}  // ← Добавить!
  ...
/>
```

---

## Порядок реализации

1. Исправить маппинг сообщений при загрузке в `BitrixDepartmentChat.tsx`
2. Добавить `role_id` в метаданные при сохранении в `bitrix-chat-api`
3. Добавить нормализацию таблиц в `BitrixChatMessage.tsx`
4. Передать `currentRoleId` в компонент для корректной подсветки текущего агента
5. Деплой Edge Function
6. Тестирование

---

## Ожидаемый результат

После реализации:
- Источники будут отображаться в Bitrix-чатах (badges "X источников", "X цитат", "X веб")
- При перегенерации другим агентом будет вызван выбранный агент
- Таблицы будут корректно отображаться в большинстве случаев (GFM-совместимые)
- В dropdown перегенерации будет подсвечен текущий агент
