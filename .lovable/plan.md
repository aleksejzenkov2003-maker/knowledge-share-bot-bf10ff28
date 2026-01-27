
# План: Исправление проблем Bitrix-чата

## Обнаруженные проблемы

### 1. Двойной `@@` у агентов в меню
**Причина:** API возвращает агентов с полем `mention` уже содержащим `@`:
```typescript
// supabase/functions/bitrix-chat-api/index.ts:1653
mention: a.mention_trigger ? `@${a.mention_trigger}` : null
```
При этом в интерфейсе отображается `agent.mention` как есть, но значение `mention_trigger` в БД уже содержит `@` (например, `@поисковик`), что приводит к `@@поисковик`.

### 2. Агенты не видят контекст при перегенерации
**Причина:** В функциях `handleRegeneratePersonalMessage` и `handleRegenerateDepartmentMessage` история передаётся как `messages`, но `chat-stream` ожидает параметр `message_history`:
```typescript
// Строка 1856 и 2126
const chatRequest = {
  messages: messages,  // ❌ Неверное имя параметра!
  // Должно быть: message_history: messages
};
```

### 3. Отсутствуют источники в ответах
**Причина:** Возможно, проблема с тем, что при перегенерации не передаётся `message_history`, что мешает RAG корректно работать.

### 4. Документы не открываются
**Причина:** Уже исправлено ранее (синтаксис `.or()` с кавычками). Нужно проверить, что исправление задеплоено.

---

## Решение

### Изменение 1: Исправить формирование mention в API

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`
**Строка:** ~1653

**Было:**
```typescript
mention: a.mention_trigger ? `@${a.mention_trigger}` : null
```

**Станет:**
```typescript
// mention_trigger уже содержит @, не добавляем второй
mention: a.mention_trigger || null
```

### Изменение 2: Исправить передачу истории при перегенерации (Personal)

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`
**Строка:** ~1852-1862

**Было:**
```typescript
const chatRequest = {
  message: userMessage.content,
  role_id: effectiveRoleId,
  department_id: departmentId,
  messages: messages,  // ❌
  attachments: ...
};
```

**Станет:**
```typescript
const chatRequest = {
  message: userMessage.content,
  role_id: effectiveRoleId,
  department_id: departmentId,
  message_history: messages,  // ✓ Правильное имя параметра
  attachments: ...
};
```

### Изменение 3: Исправить передачу истории при перегенерации (Department)

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`
**Строка:** ~2122-2132

**Было:**
```typescript
const chatRequest = {
  message: userMessage.content,
  role_id: effectiveRoleId,
  department_id: departmentId,
  messages: messages,  // ❌
  attachments: ...
};
```

**Станет:**
```typescript
const chatRequest = {
  message: userMessage.content,
  role_id: effectiveRoleId,
  department_id: departmentId,
  message_history: messages,  // ✓ Правильное имя параметра
  is_department_chat: true,   // Добавляем флаг для правильной обработки
  attachments: ...
};
```

---

## Порядок реализации

1. Исправить формирование `mention` в `handleGetDepartmentAgents` (убрать лишний `@`)
2. Исправить `handleRegeneratePersonalMessage` — заменить `messages` на `message_history`
3. Исправить `handleRegenerateDepartmentMessage` — заменить `messages` на `message_history` и добавить `is_department_chat: true`
4. Деплой Edge Function `bitrix-chat-api`

---

## Ожидаемый результат

После исправления:
- Агенты отображаются с одним `@` (`@поисковик` вместо `@@поисковик`)
- Фильтрация по агентам работает корректно
- При перегенерации другим агентом он видит всю историю чата
- Источники появляются в ответах (т.к. RAG получает правильный контекст)
- Документы открываются при клике (уже исправлено в предыдущем изменении)
