
# План: API endpoints для удаления сообщений и перегенерации ответов в Bitrix-чатах

## Обзор задачи

Добавить в `bitrix-chat-api` edge function новые endpoints для:
1. Удаления отдельных сообщений (personal и department)
2. Перегенерации ответов с возможностью смены агента

Это обеспечит идентичный функционал с основными чатами в админке.

## Новые API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/personal/messages/:id` | DELETE | Удалить сообщение из личного чата |
| `/department/messages/:id` | DELETE | Удалить сообщение из общего чата |
| `/personal/conversations/:id/regenerate` | POST | Перегенерировать ответ в личном чате |
| `/department/regenerate` | POST | Перегенерировать ответ в общем чате |

---

## Технические детали

### 1. DELETE /personal/messages/:id

**Логика:**
- Проверить принадлежность сообщения пользователю через conversation
- Если удаляется user message, найти и удалить следующий assistant message
- Если удаляется assistant message, удалить только его

```typescript
async function handleDeletePersonalMessage(
  supabase: any,
  userId: string,
  messageId: string
): Promise<Response> {
  // Получаем сообщение с проверкой ownership через conversation
  const { data: message } = await supabase
    .from('messages')
    .select('id, role, conversation_id, conversations!inner(user_id)')
    .eq('id', messageId)
    .single();

  if (!message || message.conversations.user_id !== userId) {
    return 404 'Message not found';
  }

  // Если user message - удаляем и следующий assistant ответ
  if (message.role === 'user') {
    const { data: nextMessage } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', message.conversation_id)
      .gt('created_at', message.created_at)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    
    if (nextMessage) {
      await supabase.from('messages').delete().eq('id', nextMessage.id);
    }
  }

  await supabase.from('messages').delete().eq('id', messageId);
  return { success: true };
}
```

### 2. DELETE /department/messages/:id

**Логика аналогична:**
- Проверить что сообщение в чате отдела пользователя (или user is admin)
- Удалить пару user+assistant если это user message

```typescript
async function handleDeleteDepartmentMessage(
  supabase: any,
  userId: string,
  departmentId: string,
  messageId: string,
  userRole: string
): Promise<Response> {
  const { data: message } = await supabase
    .from('department_chat_messages')
    .select('id, message_role, chat_id, created_at, department_chats!inner(department_id)')
    .eq('id', messageId)
    .single();

  // Проверка доступа: admin может удалять всё, остальные - только свои
  if (!message) return 404;
  if (userRole !== 'admin' && message.department_chats.department_id !== departmentId) {
    return 403;
  }

  // Удаление пары если user message
  if (message.message_role === 'user') {
    // Находим следующий assistant message
    const { data: nextMsg } = await supabase
      .from('department_chat_messages')
      .select('id')
      .eq('chat_id', message.chat_id)
      .eq('message_role', 'assistant')
      .gt('created_at', message.created_at)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    
    if (nextMsg) {
      await supabase.from('department_chat_messages').delete().eq('id', nextMsg.id);
    }
  }

  await supabase.from('department_chat_messages').delete().eq('id', messageId);
  return { success: true };
}
```

### 3. POST /personal/conversations/:id/regenerate

**Request Body:**
```json
{
  "message_id": "uuid-of-assistant-message-to-regenerate",
  "role_id": "optional-new-role-id"
}
```

**Логика:**
1. Найти сообщение assistant и предыдущее user сообщение
2. Удалить текущий assistant ответ
3. Получить историю до этого момента
4. Отправить запрос в chat-stream с новой ролью (если указана)
5. Стримить ответ обратно

```typescript
async function handleRegeneratePersonalMessage(
  req: Request,
  supabase: any,
  userId: string,
  conversationId: string,
  departmentId: string
): Promise<Response> {
  const body = await req.json();
  const { message_id, role_id } = body;

  // Verify ownership
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, role_id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (!conversation) return 404;

  // Get message to regenerate
  const { data: targetMessage } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('id', message_id)
    .eq('conversation_id', conversationId)
    .single();

  if (!targetMessage || targetMessage.role !== 'assistant') {
    return { error: 'Can only regenerate assistant messages' };
  }

  // Find previous user message
  const { data: userMessage } = await supabase
    .from('messages')
    .select('id, content, metadata')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .lt('created_at', targetMessage.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!userMessage) return { error: 'No user message found' };

  // Delete the assistant message
  await supabase.from('messages').delete().eq('id', message_id);

  // Get history before deleted message
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .lt('created_at', targetMessage.created_at)
    .order('created_at', { ascending: true });

  // Call chat-stream with new role
  const effectiveRoleId = role_id || conversation.role_id;
  // ... stream response back (same logic as handleSendPersonalMessage)
}
```

### 4. POST /department/regenerate

**Request Body:**
```json
{
  "message_id": "uuid-of-assistant-message",
  "role_id": "optional-new-agent-role-id"
}
```

Аналогичная логика для department_chat_messages.

---

## Изменения в routing (строки 265-378)

Добавить новые routes в главный switch/case:

```typescript
// DELETE /personal/messages/:id
if (path.match(/^personal\/messages\/[^/]+$/) && req.method === 'DELETE') {
  const messageId = path.split('/')[2];
  return await handleDeletePersonalMessage(supabase, userId, messageId);
}

// DELETE /department/messages/:id
if (path.match(/^department\/messages\/[^/]+$/) && req.method === 'DELETE') {
  const messageId = path.split('/')[2];
  return await handleDeleteDepartmentMessage(supabase, userId, departmentId, messageId, userRole);
}

// POST /personal/conversations/:id/regenerate
if (path.match(/^personal\/conversations\/[^/]+\/regenerate$/) && req.method === 'POST') {
  const conversationId = path.split('/')[2];
  return await handleRegeneratePersonalMessage(req, supabase, userId, conversationId, departmentId);
}

// POST /department/regenerate
if (path === 'department/regenerate' && req.method === 'POST') {
  return await handleRegenerateDepartmentMessage(req, supabase, userId, departmentId, userRole);
}
```

---

## Обновления фронтенда (BitrixPersonalChat.tsx, BitrixDepartmentChat.tsx)

### handleDeleteMessage - добавить API вызов:

```typescript
const handleDeleteMessage = useCallback(async (messageId: string) => {
  if (!token) return;

  try {
    const response = await fetch(`${apiBaseUrl}/personal/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete');

    // Update local state
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      if (prev[idx].role === 'user' && prev[idx + 1]?.role === 'assistant') {
        return [...prev.slice(0, idx), ...prev.slice(idx + 2)];
      }
      return prev.filter(m => m.id !== messageId);
    });

    toast({ title: "Сообщение удалено" });
  } catch (error) {
    toast({ title: "Ошибка", description: "Не удалось удалить сообщение", variant: "destructive" });
  }
}, [token, apiBaseUrl, toast]);
```

### handleRegenerate - реализовать:

```typescript
const handleRegenerate = useCallback(async (messageId: string, newRoleId?: string) => {
  if (!token || !activeConversationId) return;

  setIsLoading(true);

  try {
    const response = await fetch(
      `${apiBaseUrl}/personal/conversations/${activeConversationId}/regenerate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message_id: messageId, role_id: newRoleId })
      }
    );

    if (!response.ok || !response.body) throw new Error('Failed to regenerate');

    // Remove old message and start streaming new one
    setMessages(prev => prev.filter(m => m.id !== messageId));
    
    // Stream handling (same as sendMessage)
    const reader = response.body.getReader();
    // ... process stream
  } catch (error) {
    toast({ title: "Ошибка", variant: "destructive" });
  } finally {
    setIsLoading(false);
  }
}, [token, activeConversationId, apiBaseUrl, toast]);
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/bitrix-chat-api/index.ts` | Добавить 4 новые handler-функции + обновить routing |
| `src/pages/BitrixPersonalChat.tsx` | Добавить API вызовы в handleDeleteMessage и handleRegenerate |
| `src/pages/BitrixDepartmentChat.tsx` | Аналогичные изменения для department чата |

---

## Обновление списка endpoints в error response

Добавить в блок `available_endpoints` (строки 357-374):

```typescript
'DELETE /personal/messages/:id',
'POST /personal/conversations/:id/regenerate',
'DELETE /department/messages/:id',
'POST /department/regenerate',
```

---

## Порядок реализации

1. Добавить handler-функции в edge function
2. Обновить routing в главном serve()
3. Обновить фронтенд (BitrixPersonalChat)
4. Обновить фронтенд (BitrixDepartmentChat)
5. Задеплоить edge function
6. Протестировать все endpoints
