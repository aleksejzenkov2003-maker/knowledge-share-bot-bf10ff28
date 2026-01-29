
# План: Унификация поля ввода в чатах отдела и личных чатах

## Проблема

На скриншотах видно два совершенно разных дизайна полей ввода:

**Личные чаты** (Chat.tsx, ChatFullscreen.tsx):
- Используют `ChatInputEnhanced` — ChatGPT-стиль
- Toolbar внутри поля, кнопки скрыты в контейнере
- Всегда по центру viewport

**Чаты отдела** (DepartmentChat.tsx, DepartmentChatFullscreen.tsx):
- Используют `MentionInput` — другой стиль
- Кнопки сбоку (BookOpen, Paperclip, Send) снаружи текстового поля
- Центрировано внутри main, не viewport

Это выглядит как две разные системы.

---

## Решение

Заменить `MentionInput` на `ChatInputEnhanced` в чатах отдела, добавив поддержку @-упоминаний в `ChatInputEnhanced`.

### Что нужно добавить в ChatInputEnhanced:

1. **@-mentions** — автокомплит агентов при вводе @
2. **Reply-to preview** — уже есть в ChatInputEnhanced
3. **Knowledge Base selector** — уже есть в ChatInputEnhanced

### Структура единого компонента:

```
┌─────────────────────────────────────────────────────┐
│ [Attachments preview если есть]                     │
│ [Knowledge docs preview если есть]                  │
│ [Reply preview если есть]                           │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ Textarea с автокомплитом @mentions              │ │
│ │                                                 │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 📎 📚 [Agent selector ▼]            [Stop/Send] │ │
│ └─────────────────────────────────────────────────┘ │
│ PDF, JPG, PNG... • Enter для отправки               │
└─────────────────────────────────────────────────────┘
```

---

## Изменения

### Файл 1: `src/components/chat/ChatInputEnhanced.tsx`

Добавить поддержку @-mentions:

```tsx
interface ChatInputEnhancedProps {
  // ...existing props
  
  // Mention support for department chats
  availableAgents?: AgentMention[];
  onMentionSend?: (text: string, attachments?: Attachment[], selectedDocs?: KnowledgeBaseDocument[], replyTo?: Message | null) => void;
}
```

**Новая логика:**
1. При вводе `@` — показывать dropdown с агентами
2. Фильтрация агентов по введённому тексту после `@`
3. Вставка `@trigger` при выборе агента
4. Стилизация dropdown как в MentionInput

### Файл 2: `src/pages/DepartmentChat.tsx`

Заменить:
```tsx
// БЫЛО:
import { MentionInput } from "@/components/chat/MentionInput";

// Внизу страницы:
<MentionInput
  availableAgents={availableAgents}
  onSend={handleSend}
  ...
/>
```

На:
```tsx
// СТАЛО:
import { ChatInputEnhanced } from "@/components/chat/ChatInputEnhanced";

// Fixed input как в Chat.tsx:
<div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
  <div className="pointer-events-auto bg-background border-t py-4">
    <ChatInputEnhanced
      value={inputValue}
      onChange={setInputValue}
      onSend={handleSend}
      isLoading={isGenerating}
      onStop={stopGeneration}
      attachments={attachments}
      onAttach={handleAttach}
      onRemoveAttachment={removeAttachment}
      // Department-specific
      availableAgents={availableAgents}
      departmentId={activeDepartmentId}
      conversationId={activeChatId}
      selectedKnowledgeDocs={selectedKnowledgeDocs}
      onKnowledgeDocsChange={setSelectedKnowledgeDocs}
      replyTo={replyToMessage}
      onClearReply={() => setReplyToMessage(null)}
      placeholder="Напишите @агент и ваш вопрос..."
    />
  </div>
</div>
```

### Файл 3: `src/pages/DepartmentChatFullscreen.tsx`

Аналогичная замена MentionInput → ChatInputEnhanced с fixed positioning.

---

## Детали реализации @-mentions в ChatInputEnhanced

```tsx
// Состояние для mentions
const [showMentions, setShowMentions] = useState(false);
const [mentionSearch, setMentionSearch] = useState("");
const [mentionStart, setMentionStart] = useState<number | null>(null);
const [mentionIndex, setMentionIndex] = useState(0);

// Фильтрация агентов
const filteredAgents = useMemo(() => {
  if (!availableAgents || !mentionSearch) return availableAgents || [];
  const search = mentionSearch.toLowerCase();
  return availableAgents.filter(a => 
    a.name.toLowerCase().includes(search) ||
    a.mention_trigger?.toLowerCase().includes(search)
  );
}, [availableAgents, mentionSearch]);

// В handleChange textarea:
const handleInputChange = (newValue: string) => {
  onChange(newValue);
  
  // Detect @ for mentions
  const cursorPos = textareaRef.current?.selectionStart || 0;
  const textBefore = newValue.slice(0, cursorPos);
  const atIndex = textBefore.lastIndexOf('@');
  
  if (atIndex !== -1) {
    const afterAt = textBefore.slice(atIndex + 1);
    if (!afterAt.includes(' ')) {
      setMentionStart(atIndex);
      setMentionSearch(afterAt);
      setShowMentions(true);
      return;
    }
  }
  setShowMentions(false);
};

// Dropdown UI (абсолютно позиционирован над textarea):
{showMentions && filteredAgents.length > 0 && (
  <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
    {filteredAgents.map((agent, i) => (
      <button
        key={agent.id}
        className={cn(
          "w-full text-left px-3 py-2 flex items-center gap-2",
          i === mentionIndex ? "bg-accent" : "hover:bg-muted"
        )}
        onClick={() => insertMention(agent)}
      >
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          {agent.name.charAt(0)}
        </div>
        <div>
          <div className="font-medium">{agent.name}</div>
          <div className="text-xs text-muted-foreground">@{agent.mention_trigger}</div>
        </div>
      </button>
    ))}
  </div>
)}
```

---

## Позиционирование — центр viewport

Для обоих типов чатов поле ввода будет fixed внизу экрана:

```tsx
<div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
  <div className="pointer-events-auto bg-background border-t py-4">
    <ChatInputEnhanced ... />
  </div>
</div>
```

`ChatInputEnhanced` уже имеет `max-w-3xl mx-auto` — это обеспечивает центрирование.

Для ScrollArea добавить `pb-36` чтобы контент не перекрывался.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/chat/ChatInputEnhanced.tsx` | Добавить @-mentions dropdown, props для агентов |
| `src/pages/DepartmentChat.tsx` | Заменить MentionInput на ChatInputEnhanced, fixed positioning |
| `src/pages/DepartmentChatFullscreen.tsx` | Аналогично |
| `src/types/departmentChat.ts` | Возможно потребуется экспорт AgentMention |

---

## Результат

**До:**
- Два разных компонента ввода
- Разный дизайн, разное позиционирование
- Поле сдвигается при открытии сайдбара

**После:**
- Единый `ChatInputEnhanced` везде
- Одинаковый ChatGPT-стиль дизайн
- Поле всегда по центру viewport
- @-mentions работают в чатах отдела

---

## Порядок реализации

1. Добавить поддержку @-mentions в `ChatInputEnhanced`
2. Обновить `DepartmentChat.tsx` — заменить MentionInput
3. Обновить `DepartmentChatFullscreen.tsx` — аналогично
4. Тестирование: проверить оба типа чатов
