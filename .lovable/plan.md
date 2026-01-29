

# План исправления проблемы обрезания ответов на полуслове

## Диагностика проблемы

На скриншоте виден ответ, обрезанный на "(номер вход" с индикатором "Генерирую ответ..." внизу. Это происходит когда Claude достигает лимита `max_tokens` (8192 токенов).

### Корневые причины

1. **`useOptimizedChat.ts` не захватывает `stop_reason`** из метаданных SSE
2. **Тип `Message` не содержит поле `stopReason`** для хранения информации об обрезании
3. **`ChatMessage.tsx` не отображает предупреждение** об обрезанном ответе (в отличие от `DepartmentChatMessage.tsx`)
4. **UI зависает в состоянии загрузки** когда стрим закрывается без `[DONE]` с полными данными

### Текущий поток (проблемный)

```text
Claude API → stop_reason: "max_tokens" → SSE metadata
                                            ↓
useOptimizedChat.ts → НЕ ЧИТАЕТ stop_reason
                                            ↓
ChatMessage.tsx → НЕТ ПРЕДУПРЕЖДЕНИЯ
                                            ↓
Пользователь видит обрезанный текст без объяснения
```

---

## Решение

### 1. Добавить `stopReason` в тип Message

**Файл**: `src/types/chat.ts`

Добавить поле в интерфейс:
```typescript
export interface Message {
  // ... existing fields ...
  stopReason?: string | null; // 'max_tokens' if response was truncated, 'end_turn' for normal completion
}
```

### 2. Захватить stop_reason в useOptimizedChat.ts

**Файл**: `src/hooks/useOptimizedChat.ts`

В двух местах где парсится metadata (streaming и buffer):

```typescript
metadata = {
  response_time_ms: parsed.response_time_ms,
  rag_context: parsed.rag_context,
  citations: parsed.citations,
  smart_search: parsed.smart_search,
  web_search_citations: parsed.web_search_citations,
  web_search_used: parsed.web_search_used,
  stop_reason: parsed.stop_reason,  // ADD THIS
};
```

И передать в финальное обновление сообщения:
```typescript
setLocalMessages(prev => prev.map(m =>
  m.id === assistantMessageId
    ? {
        ...m,
        content: finalContent,
        isStreaming: false,
        stopReason: metadata.stop_reason,  // ADD THIS
        // ... other fields ...
      }
    : m
));
```

### 3. Отобразить предупреждение в ChatMessage.tsx

**Файл**: `src/components/chat/ChatMessage.tsx`

Добавить предупреждение аналогично `DepartmentChatMessage.tsx`:

```typescript
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// В JSX (после badges с источниками):
{message.stopReason === 'max_tokens' && (
  <Tooltip>
    <TooltipTrigger asChild>
      <Badge variant="destructive" className="text-xs cursor-help">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Обрезано
      </Badge>
    </TooltipTrigger>
    <TooltipContent>
      Ответ был обрезан из-за ограничения длины. Попросите продолжить.
    </TooltipContent>
  </Tooltip>
)}
```

---

## Дополнительно: Увеличить max_tokens для длинных ответов

**Файл**: `supabase/functions/chat-stream/index.ts`

Anthropic Claude поддерживает до 8192 output токенов (уже установлено). Но можно добавить логику автоматического продолжения или предупреждение в системном промпте:

```typescript
// В enhancedSystemPrompt добавить:
enhancedSystemPrompt += "\n\nЕсли ответ получается длинным, завершай его логично и предлагай пользователю попросить продолжение.";
```

---

## Файлы для изменения

1. **src/types/chat.ts**
   - Добавить `stopReason?: string | null` в интерфейс Message

2. **src/hooks/useOptimizedChat.ts**
   - Захватить `stop_reason` из metadata (2 места)
   - Передать `stopReason` в финальное обновление сообщения

3. **src/components/chat/ChatMessage.tsx**
   - Добавить импорты AlertTriangle, Tooltip
   - Добавить Badge с предупреждением "Обрезано" если `stopReason === 'max_tokens'`

---

## Ожидаемые результаты

| До | После |
|----|-------|
| Ответ обрезается молча | Показывается бейдж "Обрезано" |
| Пользователь не понимает что произошло | Понятное сообщение + подсказка "попросите продолжить" |
| Индикатор загрузки может зависнуть | Корректное завершение стрима |

---

## Техническая секция

### Порядок имплементации

1. Добавить `stopReason` в тип Message
2. Обновить useOptimizedChat.ts для захвата stop_reason
3. Добавить UI предупреждение в ChatMessage.tsx
4. Задеплоить и протестировать с длинным запросом

### Тестирование

Попросить ассистента сгенерировать очень длинный ответ (например, "напиши подробный чеклист на 100 пунктов") и убедиться что:
1. Появляется бейдж "Обрезано"
2. При наведении показывается подсказка
3. Пользователь может попросить "продолжи" и получить остаток

