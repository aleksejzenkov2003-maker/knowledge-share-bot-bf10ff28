
# План: База знаний чата + Выбор документов + Reply-to-message

## Обзор функционала

### 1. База знаний чата (Chat Knowledge Base)
Автоматическое сохранение всех документов из чата в специальную папку отдела/пользователя для повторного использования.

### 2. UI для выбора документов
Кнопка в чате для выбора документов из базы с множественным выбором — агент получит выбранные документы в контексте.

### 3. Reply-to-message (Ответ на сообщение)
Возможность ответить на конкретное сообщение (как в Telegram) — агент учтёт это сообщение при ответе.

---

## Архитектура

```text
┌─────────────────────────────────────────────────────────────────┐
│                         ИНТЕРФЕЙС ЧАТА                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [Reply Preview]  ← Ответ на: "Aleksey: На рабоферме"     │   │
│  │ ↳ Показывает превью сообщения на которое отвечаем       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [📎] [📚 База: 3 док.] [@Агент ▼]        [Отправить →]  │   │
│  │                                                         │   │
│  │  📎 - Прикрепить новый файл                             │   │
│  │  📚 - Выбрать документы из базы знаний                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Технические изменения

### Часть 1: База знаний чата

#### 1.1 Новая таблица `chat_knowledge_base`

Связывает документы с чатами/отделами для быстрого доступа:

```sql
CREATE TABLE public.chat_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Источник документа (либо чат отдела, либо личный разговор)
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Оригинальный attachment из сообщения
  source_message_id UUID, -- из какого сообщения взят документ
  
  -- Информация о файле
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- Метаданные
  description TEXT, -- Краткое описание (может быть сгенерировано AI)
  tags TEXT[], -- Теги для поиска
  
  -- Статистика
  usage_count INTEGER DEFAULT 0, -- Сколько раз использовался
  
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraint: либо department_id, либо conversation_id
  CONSTRAINT knowledge_base_scope CHECK (
    (department_id IS NOT NULL AND conversation_id IS NULL) OR
    (department_id IS NULL AND conversation_id IS NOT NULL)
  )
);

-- Индексы
CREATE INDEX idx_kb_department ON chat_knowledge_base(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX idx_kb_conversation ON chat_knowledge_base(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_kb_file_path ON chat_knowledge_base(file_path);
```

#### 1.2 Автоматическое добавление документов в базу

При отправке сообщения с вложениями — автоматически копировать в базу знаний:

```typescript
// В useOptimizedDepartmentChat.ts после успешной отправки
const addToKnowledgeBase = async (attachments: Attachment[], messageId: string) => {
  for (const att of attachments) {
    await supabase.from('chat_knowledge_base').upsert({
      department_id: departmentId,
      source_message_id: messageId,
      file_path: att.file_path,
      file_name: att.file_name,
      file_type: att.file_type,
      file_size: att.file_size,
      created_by: userId,
    }, { onConflict: 'file_path' });
  }
};
```

---

### Часть 2: UI для выбора документов

#### 2.1 Новый компонент `KnowledgeBaseSelector`

```text
┌─────────────────────────────────────────────┐
│ 📚 База знаний отдела                    ✕  │
├─────────────────────────────────────────────┤
│ 🔍 Поиск документов...                      │
├─────────────────────────────────────────────┤
│ ☑ Договор аренды.pdf          2.3 MB   3д  │
│ ☐ Техническое задание.docx    1.1 MB   5д  │
│ ☑ Требования к проекту.pdf    4.5 MB   1н  │
│ ☐ Презентация Q4.pptx         8.2 MB   2н  │
├─────────────────────────────────────────────┤
│ Выбрано: 2 документа (6.8 MB)               │
│                          [Отмена] [Добавить]│
└─────────────────────────────────────────────┘
```

**Компонент**: `src/components/chat/KnowledgeBaseSelector.tsx`

Функционал:
- Список документов из базы знаний отдела/чата
- Чекбоксы для множественного выбора
- Поиск по названию
- Сортировка по дате/использованию
- Лимиты (макс. 5 документов, 20MB)

#### 2.2 Интеграция в `ChatInputEnhanced`

Добавить кнопку рядом с Paperclip:

```tsx
// После кнопки Paperclip
<Button onClick={() => setKnowledgeBaseOpen(true)}>
  <BookOpen className="h-4 w-4" />
  {selectedKnowledgeDocs.length > 0 && (
    <Badge>{selectedKnowledgeDocs.length}</Badge>
  )}
</Button>

<Dialog open={knowledgeBaseOpen}>
  <KnowledgeBaseSelector
    departmentId={departmentId}
    selectedDocs={selectedKnowledgeDocs}
    onSelect={setSelectedKnowledgeDocs}
    onClose={() => setKnowledgeBaseOpen(false)}
  />
</Dialog>
```

#### 2.3 Передача выбранных документов в контекст

Модифицировать `sendMessage`:

```typescript
const sendMessage = async (content: string) => {
  // Объединяем: новые attachments + выбранные из базы знаний
  const allAttachments = [
    ...attachments,
    ...selectedKnowledgeDocs.map(doc => ({
      file_path: doc.file_path,
      file_name: doc.file_name,
      file_type: doc.file_type,
      file_size: doc.file_size,
    }))
  ];
  
  // Отправляем с объединённым списком
  await sendToAgent(content, allAttachments);
};
```

---

### Часть 3: Reply-to-message (Ответ на сообщение)

#### 3.1 Расширение схемы сообщений

```sql
-- Для department_chat_messages
ALTER TABLE department_chat_messages 
ADD COLUMN reply_to_message_id UUID REFERENCES department_chat_messages(id) ON DELETE SET NULL;

-- Для messages (личные чаты)
ALTER TABLE messages 
ADD COLUMN reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Индексы
CREATE INDEX idx_dcm_reply_to ON department_chat_messages(reply_to_message_id);
CREATE INDEX idx_msg_reply_to ON messages(reply_to_message_id);
```

#### 3.2 UI компонент для ответа

При hover на сообщение — кнопка "Ответить":

```text
┌──────────────────────────────────────────────────┐
│ 👤 Aleksey Zenkov                     12:34   ↩️ │  ← Кнопка "Ответить"
│ На рабоферме работают следующие...               │
└──────────────────────────────────────────────────┘
```

При нажатии — над полем ввода появляется превью:

```text
┌──────────────────────────────────────────────────┐
│ ↩️ Ответ на: Aleksey Zenkov                   ✕ │
│ "На рабоферме работают следующие..."             │
└──────────────────────────────────────────────────┘
│ [📎] [@Агент ▼] Введите сообщение...    [→]     │
```

#### 3.3 Компонент `ReplyPreview`

```tsx
// src/components/chat/ReplyPreview.tsx
interface ReplyPreviewProps {
  replyTo: DepartmentChatMessage | null;
  onClear: () => void;
}

export function ReplyPreview({ replyTo, onClear }: ReplyPreviewProps) {
  if (!replyTo) return null;
  
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-l-2 border-primary">
      <Reply className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">
          Ответ на: {replyTo.metadata?.user_name || 'Сообщение'}
        </span>
        <p className="text-xs text-muted-foreground truncate">
          {replyTo.content.slice(0, 100)}...
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={onClear}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
```

#### 3.4 Отображение Reply в сообщении

При рендере сообщения — показать на что отвечает:

```tsx
// В DepartmentChatMessage.tsx
{message.reply_to_message_id && replyToMessage && (
  <div className="mb-2 p-2 bg-muted/30 rounded border-l-2 border-primary/50 text-xs">
    <span className="font-medium">{replyToMessage.metadata?.user_name}</span>
    <p className="text-muted-foreground truncate">{replyToMessage.content.slice(0, 80)}...</p>
  </div>
)}
```

#### 3.5 Включение reply в контекст агента

При отправке сообщения с reply_to:

```typescript
// В edge function или хуке
if (replyToMessageId) {
  // Загружаем сообщение на которое отвечаем
  const { data: replyToMsg } = await supabase
    .from('department_chat_messages')
    .select('*')
    .eq('id', replyToMessageId)
    .single();
  
  // Добавляем в контекст
  const contextMessage = `
[Это ответ на предыдущее сообщение:]
${replyToMsg.metadata?.user_name || 'Пользователь'}: ${replyToMsg.content}

[Новый вопрос:]
${message}
`;
}
```

---

## Файлы для создания/изменения

| Файл | Действие | Описание |
|------|----------|----------|
| `supabase/migrations/...` | Создать | Таблица chat_knowledge_base, колонки reply_to |
| `src/types/departmentChat.ts` | Изменить | Добавить reply_to_message_id |
| `src/types/chat.ts` | Изменить | Добавить типы для KnowledgeBase |
| `src/components/chat/KnowledgeBaseSelector.tsx` | Создать | UI выбора документов |
| `src/components/chat/ReplyPreview.tsx` | Создать | Превью ответа |
| `src/components/chat/ChatInputEnhanced.tsx` | Изменить | Добавить кнопку базы знаний + reply |
| `src/components/chat/DepartmentChatMessage.tsx` | Изменить | Кнопка "Ответить" + отображение reply |
| `src/hooks/useOptimizedDepartmentChat.ts` | Изменить | Логика reply + knowledge base |
| `src/hooks/useOptimizedChat.ts` | Изменить | Аналогичные изменения для личного чата |
| `supabase/functions/chat-stream/index.ts` | Изменить | Обработка reply контекста |

---

## Ожидаемый результат

1. **База знаний**: Все документы из чата автоматически сохраняются и доступны для повторного использования
2. **Выбор документов**: Кнопка 📚 открывает модалку с чекбоксами для выбора документов из базы
3. **Reply-to-message**: Кнопка ↩️ на сообщении позволяет ответить на конкретное сообщение — агент учтёт его при ответе

## Приоритет реализации

1. **Reply-to-message** — самый востребованный функционал, минимум изменений
2. **База знаний + UI выбора** — комплексное решение для работы с документами
