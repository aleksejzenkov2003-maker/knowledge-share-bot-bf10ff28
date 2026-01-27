
# План: Персистентный контекст документов в чатах

## Проблема
Сейчас когда вы отправляете документ агенту, а потом обращаетесь к другому агенту в том же чате, новый агент не видит ранее загруженные документы. Каждое обращение к агенту — как "с чистого листа".

## Решение
Реализовать автоматическую передачу всех документов из истории чата в контекст каждого нового запроса.

## Архитектура

```text
┌─────────────────────────────────────────────────────────┐
│                     ЧАТ / ДИАЛОГ                        │
├─────────────────────────────────────────────────────────┤
│ Сообщение 1: [PDF документ] @агент1 проанализируй       │
│ Ответ агента1: "Анализ документа..."                    │
│                                                         │
│ Сообщение 2: @агент2 что скажешь по этому документу?    │
│     ↓                                                   │
│ [Система автоматически находит PDF из сообщения 1]      │
│     ↓                                                   │
│ Агент2 получает: текст + PDF документ в контексте       │
└─────────────────────────────────────────────────────────┘
```

## Технические изменения

### 1. Модификация хуков (Frontend)

**Файлы**: `useOptimizedChat.ts`, `useOptimizedDepartmentChat.ts`

При формировании `message_history` добавить информацию об attachments:

```typescript
const messageHistory = [...messages, userMessage].map(m => ({
  role: m.role,
  content: m.content,
  // НОВОЕ: передаём metadata.attachments из каждого сообщения
  attachments: m.metadata?.attachments || m.attachments?.map(a => ({
    file_path: a.file_path,
    file_name: a.file_name,
    file_type: a.file_type,
    file_size: a.file_size
  }))
}));
```

### 2. Модификация Edge Function

**Файл**: `supabase/functions/chat-stream/index.ts`

Расширить логику обработки attachments:

```typescript
// Собираем все attachments из истории чата
const allAttachments: AttachmentInput[] = [];

// Attachments из текущего запроса
if (attachments && attachments.length > 0) {
  allAttachments.push(...attachments);
}

// Attachments из истории сообщений
if (message_history) {
  for (const msg of message_history) {
    if (msg.attachments && Array.isArray(msg.attachments)) {
      allAttachments.push(...msg.attachments);
    }
  }
}

// Дедупликация по file_path
const uniqueAttachments = Array.from(
  new Map(allAttachments.map(a => [a.file_path, a])).values()
);
```

Затем использовать `uniqueAttachments` вместо `attachments` при загрузке файлов.

### 3. Расширение ChatRequest интерфейса

```typescript
interface ChatRequest {
  message: string;
  role_id?: string;
  // ...existing fields...
  message_history?: { 
    role: string; 
    content: string; 
    agent_name?: string;
    attachments?: AttachmentInput[];  // НОВОЕ
  }[];
  attachments?: AttachmentInput[];
}
```

### 4. Оптимизация контекста (ограничение размера)

Для предотвращения превышения лимитов модели:

- Ограничить количество документов из истории (например, последние 5 PDF)
- Добавить лимит по суммарному размеру файлов (например, 20MB)
- Приоритет: более свежие документы важнее

```typescript
// Сортировка по времени (более новые первыми)
const sortedAttachments = uniqueAttachments.slice().reverse();

// Ограничение: макс 5 документов или 20MB
let totalSize = 0;
const limitedAttachments = sortedAttachments.filter(a => {
  if (totalSize + a.file_size > 20 * 1024 * 1024) return false;
  totalSize += a.file_size;
  return true;
}).slice(0, 5);
```

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/hooks/useOptimizedChat.ts` | Добавить attachments в message_history |
| `src/hooks/useOptimizedDepartmentChat.ts` | Добавить attachments в message_history |
| `supabase/functions/chat-stream/index.ts` | Собирать attachments из истории |

## Преимущества

1. **Автоматический контекст** — агенты всегда видят ранее загруженные документы
2. **Без UI изменений** — работает прозрачно для пользователя
3. **Дедупликация** — один и тот же файл не загружается повторно
4. **Оптимизация** — лимиты предотвращают перегрузку модели

## Ограничения

- Работает только для PDF и изображений (поддерживаемые Claude форматы)
- Документы из разных чатов не пересекаются
- При очень длинных диалогах старые документы могут не попасть в контекст из-за лимитов
