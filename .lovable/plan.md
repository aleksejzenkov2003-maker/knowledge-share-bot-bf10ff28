

# План: Исправление Anthropic OCR fallback

## Проблема

Документы застряли в статусе "Обработка" потому что:
1. Lovable AI возвращает **402 Payment Required** (закончились кредиты)
2. Anthropic OCR fallback **зависает** потому что:
   - Указана несуществующая модель `claude-sonnet-4-20250514`
   - PDF обработка в Anthropic требует бета-заголовок `anthropic-beta: pdfs-2024-09-25`

Из логов:
```
ERROR Lovable AI OCR error: 402 - {"type":"payment_required","message":"Not enough credits"}
INFO Attempting OCR via Anthropic Claude...
(затем тишина - функция зависает)
```

## Решение

### 1. Исправить модель Anthropic
```
Было: claude-sonnet-4-20250514 (не существует!)
Стало: claude-sonnet-4-20250514 → claude-3-5-sonnet-latest
```

### 2. Добавить бета-заголовок для PDF
```typescript
headers: {
  'anthropic-beta': 'pdfs-2024-09-25',  // ОБЯЗАТЕЛЬНО для PDF
  'anthropic-version': '2023-06-01',
}
```

### 3. Добавить таймаут для OCR запросов
Edge Functions имеют ограничение ~60 секунд. Добавим AbortController:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 сек

try {
  const response = await fetch(url, { signal: controller.signal, ... });
} finally {
  clearTimeout(timeoutId);
}
```

### 4. Сбросить застрявшие документы
Запустить SQL чтобы сбросить статус документов, которые висят в processing более 10 минут.

## Техническая реализация

```typescript
// ИСПРАВЛЕННЫЙ Anthropic OCR
async function tryAnthropicOcr(pdfData: Uint8Array): Promise<OcrResult> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not configured');
    return { success: false, text: '', errorCode: 0 };
  }
  
  // Таймаут 55 секунд (Edge Functions имеют лимит ~60с)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  
  try {
    console.log('Attempting OCR via Anthropic Claude...');
    const base64Pdf = uint8ArrayToBase64(pdfData);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',  // <-- ДОБАВИТЬ!
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',    // <-- ИСПРАВИТЬ!
        max_tokens: 16000,
        messages: [/* ... */],
      }),
    });
    
    // ... обработка ответа
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Anthropic OCR timeout (55s exceeded)');
      return { success: false, text: '', errorCode: 408 };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Порядок выполнения

1. **Исправить функцию `tryAnthropicOcr()`**
   - Заменить модель на `claude-3-5-sonnet-latest`
   - Добавить заголовок `anthropic-beta: pdfs-2024-09-25`
   - Добавить AbortController с таймаутом 55 секунд

2. **Развернуть edge function**

3. **Сбросить застрявшие документы** - запустить SQL:
   ```sql
   UPDATE documents 
   SET status = 'pending' 
   WHERE status = 'processing' 
     AND created_at < NOW() - INTERVAL '10 minutes';
   ```

4. **Протестировать** - загрузить документ и проверить логи

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/process-document/index.ts` | Исправить модель, добавить бета-заголовок и таймаут |

## Результат

- Документы будут обрабатываться через Anthropic Claude когда Lovable AI недоступен
- Функция не будет зависать бесконечно благодаря таймауту
- Застрявшие документы можно будет переобработать

