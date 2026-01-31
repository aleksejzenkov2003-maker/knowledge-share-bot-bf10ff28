
# План: Устранение проблем исчезновения и прерывания чат-запросов

## Выявленные проблемы

### 1. Таймауты Edge Functions (ОСНОВНАЯ ПРИЧИНА)
Edge Functions на Supabase имеют жёсткие лимиты:
- **150 секунд** (wall-clock) на free tier
- **400 секунд** на Pro tier
- **2 секунды** CPU time

При длинных запросах (RAG-поиск + re-ranking + AI-генерация) функция может превысить лимит и прерваться.

**Текущий flow:**
```text
bitrix-chat-api (150s лимит)
     ↓ внутренний fetch
chat-stream (ещё 150s лимит, но уже внутри первого)
     ↓
Anthropic/Perplexity API (может занять 30-120+ сек)
```

### 2. Отсутствие буферизации SSE на клиенте
В `BitrixPersonalChat.tsx` (строки 583-620) обработка SSE не учитывает:
- Фрагментированные JSON-чанки (может разорваться на середине JSON)
- Нет накопления буфера между итерациями
- При обрыве соединения теряется весь контент

```typescript
// ПРОБЛЕМА: buffer не сохраняется между чанками
const chunk = decoder.decode(value);
const lines = chunk.split('\n');  // JSON может быть разорван!
```

### 3. Bitrix iframe перезагрузки
Bitrix24 агрессивно управляет iframe:
- Переключение вкладок/окон
- Изменение размера
- Переход в fullscreen

При этом:
- Соединение SSE обрывается
- Сообщение пользователя уже сохранено в БД
- Ответ ассистента теряется (не сохраняется)

### 4. Отсутствие retry/recovery логики
При сетевой ошибке:
- Сообщение пользователя сохранено
- Ответа AI нет
- Нет автоматического повтора запроса
- Пользователь видит "пустой" чат

### 5. Нет индикации проблем
- Пользователь не видит что запрос прервался
- Нет возможности "продолжить генерацию"
- Сообщение просто исчезает из UI

---

## План исправлений

### Часть 1: Защита от потери данных (Критично)

**1.1. Добавить буферизацию SSE в BitrixPersonalChat.tsx**

```typescript
// Было:
while (true) {
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  // ...
}

// Станет:
let buffer = '';  // Персистентный буфер

while (true) {
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';  // Сохраняем неполную строку
  // ...
}
```

**1.2. Сохранение частичного ответа при обрыве**

При любой ошибке (кроме AbortError) сохранять накопленный контент:

```typescript
} catch (error) {
  // Сохранить частичный ответ
  if (streamingContentRef.current && streamingContentRef.current.trim()) {
    const partialContent = streamingContentRef.current + '\n\n[Ответ прерван]';
    setMessages(prev => prev.map(m => 
      m.id === assistantMessage.id 
        ? { ...m, content: partialContent, isStreaming: false }
        : m
    ));
    // Важно: сохранить в БД тоже
    await savePartialResponse(conversationId, partialContent);
  }
}
```

### Часть 2: Keep-Alive и таймауты

**2.1. Добавить keep-alive heartbeat в chat-stream**

Отправлять пустые SSE события каждые 15 секунд чтобы соединение не закрывалось:

```typescript
// В chat-stream/index.ts
const stream = new ReadableStream({
  async start(controller) {
    // Heartbeat interval
    const heartbeatInterval = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      } catch { clearInterval(heartbeatInterval); }
    }, 15000);
    
    // ... основная логика ...
    
    clearInterval(heartbeatInterval);
  }
});
```

**2.2. Увеличить timeout на клиенте**

Добавить явный AbortController timeout:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 минуты

try {
  const response = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeoutId);
}
```

### Часть 3: Recovery механизм для Bitrix

**3.1. Сохранение pending-запроса в sessionStorage**

Перед отправкой запроса сохранять его ID:

```typescript
const pendingRequest = {
  conversationId,
  userMessageId: userMessage.id,
  timestamp: Date.now(),
};
sessionStorage.setItem(`${storageKey}_pending`, JSON.stringify(pendingRequest));
```

**3.2. Восстановление после перезагрузки**

При инициализации проверять наличие незавершённых запросов:

```typescript
useEffect(() => {
  const pending = sessionStorage.getItem(`${storageKey}_pending`);
  if (pending) {
    const { conversationId, userMessageId, timestamp } = JSON.parse(pending);
    // Если прошло < 5 минут, попытаться восстановить
    if (Date.now() - timestamp < 300000) {
      // Загрузить сообщения и показать уведомление
      showRecoveryNotification(conversationId);
    }
    sessionStorage.removeItem(`${storageKey}_pending`);
  }
}, []);
```

### Часть 4: UI индикация

**4.1. Добавить состояние "генерация прервана"**

```typescript
interface Message {
  // ...
  interrupted?: boolean;
  interruptedAt?: Date;
}
```

**4.2. Кнопка "Повторить генерацию"**

Для прерванных сообщений показывать кнопку retry:

```typescript
{message.interrupted && (
  <Button size="sm" onClick={() => handleRetryGeneration(message.id)}>
    <RefreshCw className="h-4 w-4 mr-2" />
    Повторить
  </Button>
)}
```

### Часть 5: Серверная устойчивость

**5.1. Queue-based архитектура (опционально, для сложных случаев)**

Если проблема остаётся критичной, перейти на очередь:

```text
1. Клиент отправляет сообщение → получает job_id
2. Сервер обрабатывает в фоне
3. Клиент опрашивает статус или подписывается на realtime
```

Это потребует:
- Новая таблица `chat_jobs`
- Фоновый worker (Supabase Cron или отдельный сервис)
- Изменение UI на polling

---

## Приоритет реализации

| Этап | Изменения | Сложность | Эффект |
|------|-----------|-----------|--------|
| 1 | Буферизация SSE + сохранение частичного ответа | Низкая | Высокий |
| 2 | Keep-alive heartbeat | Низкая | Средний |
| 3 | Recovery из sessionStorage | Средняя | Высокий |
| 4 | UI для прерванных сообщений | Низкая | Средний |
| 5 | Queue архитектура | Высокая | Высокий |

---

## Файлы для изменения

1. **src/pages/BitrixPersonalChat.tsx**
   - Добавить буферизацию SSE
   - Сохранение частичного ответа при ошибке
   - Recovery после перезагрузки
   - UI для прерванных сообщений

2. **src/pages/BitrixDepartmentChat.tsx**
   - Аналогичные изменения

3. **supabase/functions/chat-stream/index.ts**
   - Keep-alive heartbeat

4. **supabase/functions/bitrix-chat-api/index.ts**
   - Keep-alive для proxied stream
   - Обработка ошибок upstream

5. **src/components/chat/BitrixChatMessage.tsx**
   - UI для "прерванных" сообщений

---

## Технические детали

### SSE Buffering Pattern

```typescript
// Правильная обработка SSE с буфером
const processSSE = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Разбиваем только по полным строкам
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Последняя строка может быть неполной
    
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          fullContent += parsed.content;
        }
      } catch {
        // JSON parsing failed - данные разорваны, подождём следующий чанк
      }
    }
  }
  
  // Обработать остаток буфера
  if (buffer.startsWith('data: ')) {
    // ... финальная обработка
  }
  
  return fullContent;
};
```

### Heartbeat Implementation

```typescript
// В edge function
const HEARTBEAT_INTERVAL = 15000; // 15 секунд

const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder();
    
    // Heartbeat keeps connection alive
    const heartbeat = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      } catch {
        clearInterval(heartbeat);
      }
    }, HEARTBEAT_INTERVAL);
    
    try {
      // ... обработка AI stream ...
    } finally {
      clearInterval(heartbeat);
      controller.close();
    }
  }
});
```
