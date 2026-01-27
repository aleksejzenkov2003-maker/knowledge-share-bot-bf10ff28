

# Комплексный план решения проблем Bitrix-чатов

## Обзор текущего состояния

### Что уже реализовано:
| Функция | Личный чат | Общий чат |
|---------|------------|-----------|
| Фильтр чатов/поиск | ✅ | ✅ |
| Выбор агента | ✅ dropdown | ✅ dropdown + @mention |
| Остановить генерацию | ✅ | ✅ |
| Переписать другой ролью | ✅ | ✅ |
| Удалить сообщение | ✅ | ✅ |
| Копировать/Скачать | ✅ | ✅ |
| Источники (SourcesPanel) | ✅ | ✅ |
| **Загрузка файлов** | ❌ Нет UI | ❌ Нет UI |

### Что нужно добавить/исправить:
1. **Загрузка документов** (PDF, DOCX, MD, изображения) - отсутствует UI и логика
2. **Скачивание** - уже есть MD/DOCX/PDF через DownloadDropdown
3. **Контекст между сообщениями** - возможно недостаточно истории передаётся
4. **Форматирование** - возможны проблемы с таблицами и пробелами

---

## Этап 1: Загрузка документов (Frontend)

### 1.1 Добавить UI для загрузки файлов

**BitrixPersonalChat.tsx** - добавить в область ввода:

```typescript
// Состояние вложений
const [attachments, setAttachments] = useState<Attachment[]>([]);
const fileInputRef = useRef<HTMLInputElement>(null);

// Константы
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/webp'
];

// Валидация файлов
const handleFileSelect = (files: File[]) => {
  const validFiles = files.filter(file => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Неподдерживаемый формат", variant: "destructive" });
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "Файл слишком большой (макс 10MB)", variant: "destructive" });
      return false;
    }
    return true;
  });
  
  if (attachments.length + validFiles.length > MAX_FILES) {
    toast({ title: `Максимум ${MAX_FILES} файлов`, variant: "destructive" });
    return;
  }
  
  const newAttachments = validFiles.map(file => ({
    id: crypto.randomUUID(),
    file,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    status: 'pending' as const,
    preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
  }));
  
  setAttachments(prev => [...prev, ...newAttachments]);
};
```

### 1.2 UI компонент AttachmentPreview

Переиспользовать существующий `src/components/chat/AttachmentPreview.tsx` или создать упрощённую версию для Bitrix:

```tsx
{/* В области ввода, перед Textarea */}
{attachments.length > 0 && (
  <div className="flex flex-wrap gap-2 p-2 border-b border-border">
    {attachments.map(att => (
      <div key={att.id} className="relative group">
        {att.preview_url ? (
          <img src={att.preview_url} className="h-16 w-16 rounded object-cover" />
        ) : (
          <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <Button
          size="icon"
          variant="destructive"
          className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100"
          onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
        >
          <X className="h-3 w-3" />
        </Button>
        {att.status === 'uploading' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        )}
      </div>
    ))}
  </div>
)}

{/* Кнопка загрузки рядом с Send */}
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8"
  onClick={() => fileInputRef.current?.click()}
  disabled={isLoading || attachments.length >= MAX_FILES}
>
  <Paperclip className="h-4 w-4" />
</Button>
<input
  ref={fileInputRef}
  type="file"
  multiple
  accept=".pdf,.docx,.md,image/jpeg,image/png,image/webp"
  className="hidden"
  onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
/>
```

### 1.3 Обновить handleSend для отправки файлов

```typescript
const handleSend = useCallback(async () => {
  if (!token || (!inputValue.trim() && attachments.length === 0) || isLoading) return;

  // Конвертация файлов в base64
  const attachmentsForApi = await Promise.all(
    attachments.map(async (att) => {
      if (!att.file) return null;
      
      setAttachments(prev => prev.map(a => 
        a.id === att.id ? { ...a, status: 'uploading' } : a
      ));
      
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove data URL prefix
        };
        reader.readAsDataURL(att.file!);
      });
      
      return {
        file_name: att.file_name,
        file_type: att.file_type,
        file_base64: base64
      };
    })
  );

  // ... создание сообщения

  const response = await fetch(`${apiBaseUrl}/personal/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: inputValue,
      role_id: selectedRoleId || null,
      attachments: attachmentsForApi.filter(Boolean), // Новое поле
    }),
  });

  // После успеха очистить attachments
  setAttachments([]);
});
```

---

## Этап 2: Backend - Улучшение передачи контекста

### 2.1 Проблема с контекстом

В `bitrix-chat-api/index.ts` при вызове `chat-stream` передаётся только 20 последних сообщений:

```typescript
// Текущий код (строки 1140-1145)
const { data: history } = await supabase
  .from('messages')
  .select('role, content')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true })
  .limit(20);
```

### 2.2 Исправление - передавать metadata с role_id

```typescript
const { data: history } = await supabase
  .from('messages')
  .select('role, content, metadata')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true })
  .limit(30); // Увеличить лимит

const messages = (history || []).map((m: any) => ({
  role: m.role,
  content: m.content,
  agent_name: m.metadata?.agent_name || null, // Для department chat
  attachments: m.metadata?.attachments || undefined,
}));

const chatRequest = {
  message: body.message,
  role_id: roleId,
  department_id: departmentId,
  messages: messages,
  message_history: messages, // Добавить для совместимости с chat-stream
  attachments: attachments.map(a => ({
    file_name: a.file_name,
    file_type: a.file_type,
    file_path: a.file_path
  }))
};
```

### 2.3 Аналогичное исправление для department chat (handleSendMessage)

Строки 1376-1386 - то же самое: увеличить limit и добавить metadata.

---

## Этап 3: Улучшение форматирования сообщений

### 3.1 Проверить BitrixChatMessage.tsx

Убедиться что используется правильный ReactMarkdown с remarkGfm:

```tsx
// src/components/chat/BitrixChatMessage.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    // Таблицы
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted/50">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-semibold border-b border-border">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 border-b border-border/50">{children}</td>
    ),
    tr: ({ children, ...props }) => (
      <tr className="even:bg-muted/20">{children}</tr>
    ),
    // Параграфы с отступами
    p: ({ children }) => (
      <p className="mb-3 leading-relaxed">{children}</p>
    ),
    // Списки
    ul: ({ children }) => (
      <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
    ),
  }}
>
  {content}
</ReactMarkdown>
```

### 3.2 CSS для prose

Добавить класс `prose prose-sm` к контейнеру сообщения:

```tsx
<div className={cn(
  "prose prose-sm max-w-none",
  "prose-headings:mb-2 prose-headings:mt-4",
  "prose-p:mb-2 prose-p:leading-relaxed",
  "prose-ul:mb-2 prose-ol:mb-2",
  role === "assistant" ? "prose-invert" : ""
)}>
```

---

## Этап 4: Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/BitrixPersonalChat.tsx` | Добавить UI загрузки файлов, attachments state, обновить handleSend |
| `src/pages/BitrixDepartmentChat.tsx` | То же самое для department chat |
| `supabase/functions/bitrix-chat-api/index.ts` | Увеличить лимит истории с 20 до 30, добавить message_history, исправить передачу metadata |
| `src/components/chat/BitrixChatMessage.tsx` | Проверить/улучшить remarkGfm и CSS для таблиц |

---

## Этап 5: Детальные изменения кода

### 5.1 BitrixPersonalChat.tsx

**Добавить импорты:**
```typescript
import { Paperclip, X, FileText } from "lucide-react";
import type { Attachment } from "@/types/chat";
```

**Добавить state (после строки ~91):**
```typescript
const [attachments, setAttachments] = useState<Attachment[]>([]);
const fileInputRef = useRef<HTMLInputElement>(null);
```

**Добавить константы:**
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp'
];
```

**Добавить handleFileSelect:**
```typescript
const handleFileSelect = useCallback((files: File[]) => {
  const validFiles: File[] = [];
  
  for (const file of files) {
    if (attachments.length + validFiles.length >= MAX_FILES) {
      toast({ title: `Максимум ${MAX_FILES} файлов`, variant: "destructive" });
      break;
    }
    
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ 
        title: "Неподдерживаемый формат", 
        description: file.name,
        variant: "destructive" 
      });
      continue;
    }
    
    if (file.size > MAX_FILE_SIZE) {
      toast({ 
        title: "Файл слишком большой", 
        description: "Максимум 10MB",
        variant: "destructive" 
      });
      continue;
    }
    
    validFiles.push(file);
  }
  
  const newAttachments: Attachment[] = validFiles.map(file => ({
    id: crypto.randomUUID(),
    file,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    status: 'pending',
    preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
  }));
  
  setAttachments(prev => [...prev, ...newAttachments]);
}, [attachments.length, toast]);
```

**Обновить handleSend (добавить обработку attachments):**
```typescript
const handleSend = useCallback(async () => {
  if (!token || (!inputValue.trim() && attachments.length === 0) || isLoading) return;

  // ... существующий код создания conversation

  // Конвертация файлов в base64
  const attachmentsForApi: Array<{
    file_name: string;
    file_type: string;
    file_base64: string;
  }> = [];

  for (const att of attachments) {
    if (!att.file) continue;
    
    setAttachments(prev => prev.map(a => 
      a.id === att.id ? { ...a, status: 'uploading' as const } : a
    ));

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(att.file!);
      });

      attachmentsForApi.push({
        file_name: att.file_name,
        file_type: att.file_type,
        file_base64: base64
      });

      setAttachments(prev => prev.map(a => 
        a.id === att.id ? { ...a, status: 'uploaded' as const } : a
      ));
    } catch (error) {
      console.error('Error reading file:', error);
      setAttachments(prev => prev.map(a => 
        a.id === att.id ? { ...a, status: 'error' as const } : a
      ));
    }
  }

  // ... userMessage создание, добавить attachments в metadata

  const response = await fetch(`${apiBaseUrl}/personal/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: userMessage.content,
      role_id: selectedRoleId || null,
      attachments: attachmentsForApi.length > 0 ? attachmentsForApi : undefined,
    }),
    signal: abortControllerRef.current.signal,
  });

  // ... после успеха
  setAttachments([]);
});
```

**UI - добавить превью вложений и кнопку (в область ввода ~строка 880):**
```tsx
{/* Attachments Preview */}
{attachments.length > 0 && (
  <div className="flex flex-wrap gap-2 p-2 border-b border-border bg-muted/30">
    {attachments.map(att => (
      <div key={att.id} className="relative group">
        {att.preview_url ? (
          <img 
            src={att.preview_url} 
            alt={att.file_name}
            className="h-14 w-14 rounded-lg object-cover border"
          />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-muted border flex flex-col items-center justify-center p-1">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="text-[8px] text-muted-foreground truncate w-full text-center">
              {att.file_name.split('.').pop()?.toUpperCase()}
            </span>
          </div>
        )}
        <Button
          size="icon"
          variant="destructive"
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
        >
          <X className="h-3 w-3" />
        </Button>
        {att.status === 'uploading' && (
          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        )}
      </div>
    ))}
  </div>
)}

{/* File Input */}
<input
  ref={fileInputRef}
  type="file"
  multiple
  accept=".pdf,.docx,.md,.txt,image/jpeg,image/png,image/webp"
  className="hidden"
  onChange={(e) => {
    handleFileSelect(Array.from(e.target.files || []));
    e.target.value = '';
  }}
/>

{/* В toolbar рядом с кнопкой отправки */}
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 rounded-lg"
  onClick={() => fileInputRef.current?.click()}
  disabled={isLoading || attachments.length >= MAX_FILES}
>
  <Paperclip className="h-4 w-4" />
</Button>
```

### 5.2 bitrix-chat-api/index.ts

**handleSendPersonalMessage (строки ~1140-1160):**
```typescript
// Увеличить лимит и добавить metadata
const { data: history } = await supabase
  .from('messages')
  .select('role, content, metadata')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true })
  .limit(30); // Было 20

const messages = (history || []).map((m: any) => ({
  role: m.role,
  content: m.content,
  attachments: m.metadata?.attachments,
}));

const chatRequest = {
  message: body.message,
  role_id: roleId,
  department_id: departmentId,
  messages: messages,
  message_history: messages, // Добавить для chat-stream совместимости
  attachments: attachments.map(a => ({
    file_name: a.file_name,
    file_type: a.file_type,
    file_path: a.file_path
  }))
};
```

**handleSendMessage для department (строки ~1376-1398):**
```typescript
// То же самое: увеличить лимит и добавить metadata
const { data: history } = await supabase
  .from('department_chat_messages')
  .select('message_role, content, metadata, role_id')
  .eq('chat_id', chatId)
  .order('created_at', { ascending: true })
  .limit(30); // Было 20

const messages = (history || []).map((m: any) => ({
  role: m.message_role,
  content: m.content,
  agent_name: m.metadata?.agent_name,
  attachments: m.metadata?.attachments,
}));

const chatRequest = {
  message: body.message,
  role_id: roleId,
  department_id: departmentId,
  messages: messages,
  message_history: messages, // Критически важно для контекста
  is_department_chat: true,
  attachments: attachments.map(a => ({
    file_name: a.file_name,
    file_type: a.file_type,
    file_path: a.file_path
  }))
};
```

---

## Порядок реализации

1. **BitrixPersonalChat.tsx** - добавить загрузку файлов (state, UI, handleFileSelect, обновить handleSend)
2. **BitrixDepartmentChat.tsx** - аналогичные изменения
3. **bitrix-chat-api/index.ts** - улучшить передачу контекста (увеличить лимит, добавить message_history)
4. **BitrixChatMessage.tsx** - проверить/улучшить форматирование таблиц
5. **Деплой edge function**
6. **Тестирование**

---

## Ожидаемый результат

После реализации:
- Пользователи смогут прикреплять PDF, DOCX, MD, изображения к сообщениям
- Файлы будут загружаться в Supabase Storage и передаваться агентам
- Агенты будут видеть полный контекст диалога (30 сообщений вместо 20)
- Таблицы и форматирование будут отображаться корректно
- Скачивание в MD/DOCX/PDF уже работает через DownloadDropdown

