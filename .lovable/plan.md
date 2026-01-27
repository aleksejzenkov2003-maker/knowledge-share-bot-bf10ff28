
# План: Исправление веб-источников и добавление действий в чат отделов

## Обнаруженные проблемы

### Проблема 1: Perplexity API возвращает 401 (ключ недействителен)

Из логов edge function:
```
2026-01-27T07:34:19Z INFO Perplexity 401 error, attempting fallback...
2026-01-27T07:34:19Z INFO Perplexity response status: 401
```

Когда Perplexity API возвращает 401, система делает fallback на Lovable AI (Gemini) или Anthropic (Claude). Эти провайдеры **не возвращают нативные веб-источники** в формате `perplexity_citations`.

### Проблема 2: `web_search_citations` не захватываются в Department Chat

В `useOptimizedDepartmentChat.ts` (строки 419-428) парсится только `perplexity_citations`:
```typescript
metadata = {
  perplexity_citations: parsed.perplexity_citations, // ✅ есть
  // web_search_citations: parsed.web_search_citations, // ❌ ОТСУТСТВУЕТ!
};
```

Когда Claude выполняет web search через Perplexity, источники приходят в `web_search_citations`, но хук их игнорирует.

### Проблема 3: Отсутствуют кнопки Скачать/Обновить/Копировать

Компонент `DepartmentChatMessage.tsx` **не включает `MessageActions`**, в отличие от `ChatMessage.tsx` (строки 264-276).

Это означает, что в чате отделов нельзя:
- Скачать ответ (MD/DOCX/PDF)
- Обновить ответ другим агентом (regenerate)
- Удобно скопировать (без hover-кнопки)

---

## Решение

### Часть 1: Добавить захват `web_search_citations` в хук

**Файл:** `src/hooks/useOptimizedDepartmentChat.ts`

Изменить обработку metadata (строки 419-428 и 444-452):

```typescript
// Было:
metadata = {
  perplexity_citations: parsed.perplexity_citations,
  // ...
};

// Станет:
metadata = {
  perplexity_citations: parsed.perplexity_citations,
  web_search_citations: parsed.web_search_citations, // ← ДОБАВИТЬ
  web_search_used: parsed.web_search_used,           // ← ДОБАВИТЬ
  // ...
};
```

### Часть 2: Добавить MessageActions в DepartmentChatMessage

**Файл:** `src/components/chat/DepartmentChatMessage.tsx`

1. Импортировать компоненты:
```typescript
import { MessageActions } from './MessageActions';
import { DownloadDropdown } from './DownloadDropdown';
import { ChatRole } from '@/types/chat';
```

2. Добавить props для regenerate и availableAgents:
```typescript
interface DepartmentChatMessageProps {
  message: MessageType;
  currentUserId?: string;
  availableAgents?: { id: string; name: string; description?: string }[]; // ← НОВОЕ
  onRegenerateResponse?: (messageId: string, roleId?: string) => void;    // ← НОВОЕ
}
```

3. Добавить `MessageActions` в JSX после блока metadata (перед закрывающим `</div>`):
```tsx
{/* Actions: Copy, Download, Regenerate */}
{isAssistant && !isGenerating && message.content && (
  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      <Copy className="h-3 w-3 mr-1" />
      Копировать
    </Button>
    <DownloadDropdown
      content={message.content}
      ragContext={message.metadata?.rag_context}
      citations={message.metadata?.citations}
      webSearchCitations={message.metadata?.perplexity_citations || message.metadata?.web_search_citations}
    />
    {onRegenerateResponse && availableAgents && availableAgents.length > 0 && (
      // Dropdown для выбора агента при regenerate
    )}
  </div>
)}
```

### Часть 3: Реализовать `regenerateResponse` в хуке

**Файл:** `src/hooks/useOptimizedDepartmentChat.ts`

Добавить функцию regenerate:
```typescript
const regenerateResponse = useCallback(async (messageId: string, roleId?: string) => {
  // Найти сообщение по ID
  const messageIndex = localMessages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) return;
  
  const targetMessage = localMessages[messageIndex];
  
  // Для assistant сообщения - найти предыдущее user сообщение
  if (targetMessage.message_role === 'assistant') {
    const prevUserMessage = localMessages.slice(0, messageIndex).reverse()
      .find(m => m.message_role === 'user');
    
    if (prevUserMessage) {
      // Удалить все сообщения после user message
      setLocalMessages(prev => prev.slice(0, localMessages.indexOf(prevUserMessage) + 1));
      
      // Переотправить с новым агентом
      const agentToUse = roleId || targetMessage.role_id;
      const agent = availableAgents.find(a => a.id === agentToUse);
      const mentionPrefix = agent ? `@${agent.mention_trigger || agent.slug} ` : '';
      
      await sendMessage(mentionPrefix + prevUserMessage.content);
    }
  }
}, [localMessages, availableAgents, sendMessage]);
```

Вернуть функцию из хука:
```typescript
return {
  // ... existing
  regenerateResponse, // ← НОВОЕ
};
```

### Часть 4: Обновить типы метаданных

**Файл:** `src/types/departmentChat.ts`

Убедиться что все поля присутствуют:
```typescript
interface DepartmentChatMessage {
  metadata: {
    // ... existing
    perplexity_citations?: string[];
    web_search_citations?: string[];  // ← ПРОВЕРИТЬ
    web_search_used?: boolean;        // ← ПРОВЕРИТЬ
  } | null;
}
```

### Часть 5: Передать props в DepartmentChatMessage

**Файлы:** `src/pages/DepartmentChat.tsx`, `src/pages/DepartmentChatFullscreen.tsx`

1. Получить `regenerateResponse` из хука
2. Передать props в компонент:
```tsx
<DepartmentChatMessage
  key={message.id}
  message={message}
  currentUserId={user?.id}
  availableAgents={availableAgents}              // ← НОВОЕ
  onRegenerateResponse={regenerateResponse}      // ← НОВОЕ
/>
```

---

## Дополнительно: Проверить Perplexity API ключ

Ошибка 401 означает недействительный API ключ. Рекомендации:
1. Проверить значение `PERPLEXITY_API_KEY` в Supabase Secrets
2. Убедиться, что ключ активен в Perplexity Dashboard
3. При необходимости обновить ключ

---

## Итоговые изменения

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Файлы для изменения:                                                 │
├──────────────────────────────────────────────────────────────────────┤
│ 1. src/hooks/useOptimizedDepartmentChat.ts                          │
│    - Добавить web_search_citations в metadata parsing               │
│    - Реализовать regenerateResponse                                  │
│                                                                       │
│ 2. src/components/chat/DepartmentChatMessage.tsx                    │
│    - Добавить props: availableAgents, onRegenerateResponse         │
│    - Добавить кнопки Copy/Download/Regenerate                       │
│    - Добавить className="group" для hover эффекта                   │
│                                                                       │
│ 3. src/types/departmentChat.ts                                      │
│    - Проверить/добавить web_search_citations в metadata             │
│                                                                       │
│ 4. src/pages/DepartmentChat.tsx                                     │
│    - Получить regenerateResponse из хука                            │
│    - Передать новые props в DepartmentChatMessage                   │
│                                                                       │
│ 5. src/pages/DepartmentChatFullscreen.tsx                           │
│    - Аналогичные изменения                                           │
└──────────────────────────────────────────────────────────────────────┘
```

## Результат после изменений

1. **Веб-источники отображаются** — даже при fallback на Claude с web search
2. **Кнопка "Скачать"** — MD/DOCX/PDF экспорт ответов
3. **Кнопка "Обновить"** — regenerate с текущим или другим агентом
4. **Кнопка "Копировать"** — быстрое копирование текста

```text
┌─────────────────────────────────────────────────────────────┐
│ 👥 Юридический  │ 🔍 │ [Все агенты ▼]                    🔲│
├─────────────────────────────────────────────────────────────┤
│ 🤖 @поисковик                                     12:45    │
│                                                              │
│ [Ответ агента с источниками...]                             │
│                                                              │
│ ⏱ 7691ms  📄 0 источников  🌐 5 веб                        │
│ ─────────────────────────────────────────────────────────── │
│ [📋 Копировать] [⬇ Скачать ▼] [🔄 Обновить ▼]  ← НОВОЕ!   │
└─────────────────────────────────────────────────────────────┘
```
