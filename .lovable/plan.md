
# План: Fallback OCR через Anthropic Claude

## Проблема

При обработке отсканированных PDF документов основной OCR через Lovable AI Gateway возвращает ошибку **402 Payment Required** (закончились кредиты). В результате документы записываются с сообщением "Не удалось извлечь текст".

Пример из логов:
```
OCR API error: 402 - {"type":"payment_required","message":"Not enough credits","details":""}
```

## Решение

Добавить **Anthropic Claude** как fallback OCR провайдер. При ошибке 402 от Lovable AI автоматически переключаться на Claude Vision.

## Архитектура

```text
┌────────────────────────────────────────────────────────────────┐
│                    PDF без текстового слоя                     │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│        Lovable AI Gateway (google/gemini-2.5-flash)            │
│                   ↓ Ответ 402? ↓                               │
└────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼ OK                            ▼ 402/429
┌─────────────────────┐          ┌─────────────────────────────┐
│   Продолжить        │          │   Anthropic Claude Vision   │
│   обработку         │          │   claude-sonnet-4-20250514  │
└─────────────────────┘          └─────────────────────────────┘
                                              │
                                              ▼
                              ┌─────────────────────────────────┐
                              │       OCR результат или        │
                              │       сообщение об ошибке      │
                              └─────────────────────────────────┘
```

## Техническая реализация

### Изменения в `supabase/functions/process-document/index.ts`

```typescript
// ============= OCR FALLBACK FOR SCANNED PDFs =============
if (text.length < 200 && pdfData.length > 10000) {
  console.log(`PDF appears to be scanned (text length: ${text.length}). Attempting OCR...`);
  
  // Try Lovable AI first
  const lovableOcrResult = await tryLovableAiOcr(pdfData);
  
  if (lovableOcrResult.success) {
    text = lovableOcrResult.text;
    // ... parse page markers
  } else if (lovableOcrResult.errorCode === 402 || lovableOcrResult.errorCode === 429) {
    // Fallback to Anthropic Claude
    console.log('Lovable AI OCR unavailable (credits/rate limit). Trying Anthropic Claude...');
    
    const anthropicOcrResult = await tryAnthropicOcr(pdfData);
    
    if (anthropicOcrResult.success) {
      text = anthropicOcrResult.text;
      // ... parse page markers
    } else {
      console.error('Both OCR providers failed');
    }
  }
}
```

### Новая функция: `tryAnthropicOcr()`

```typescript
async function tryAnthropicOcr(pdfData: Uint8Array): Promise<{
  success: boolean;
  text: string;
  errorCode?: number;
}> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not configured, skipping fallback OCR');
    return { success: false, text: '', errorCode: 0 };
  }
  
  try {
    const base64Pdf = uint8ArrayToBase64(pdfData);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: `Извлеки ВЕСЬ текст из этого PDF документа.

КРИТИЧЕСКИ ВАЖНО:
- В НАЧАЛЕ каждой страницы добавь маркер: [СТРАНИЦА N]
- Например: [СТРАНИЦА 1] текст первой страницы... [СТРАНИЦА 2] текст второй...
- Сохрани структуру: абзацы, списки, заголовки
- Таблицы представь в текстовом виде
- Язык документа сохрани без изменений

Верни ТОЛЬКО извлечённый текст с маркерами страниц.`,
              },
            ],
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API error: ${response.status} - ${errorText}`);
      return { success: false, text: '', errorCode: response.status };
    }
    
    const result = await response.json();
    const ocrText = result.content?.[0]?.text || '';
    
    if (ocrText.length > 100) {
      console.log(`Anthropic OCR successful! Extracted ${ocrText.length} characters`);
      return { success: true, text: ocrText };
    }
    
    return { success: false, text: '', errorCode: 0 };
  } catch (error) {
    console.error('Anthropic OCR error:', error);
    return { success: false, text: '', errorCode: 0 };
  }
}
```

### Улучшенное сообщение об ошибке

При неудаче обоих провайдеров показывать причину:

```typescript
if (text.length < 100) {
  const reason = lovableError === 402 
    ? 'Исчерпан лимит OCR кредитов' 
    : 'Не удалось распознать текст';
  
  text = `[PDF Document: ${doc.file_name}] - ${reason}. ` +
         `Документ может быть отсканирован без текстового слоя.`;
}
```

## Порядок выполнения

1. Извлечь текущую OCR-логику в отдельную функцию `tryLovableAiOcr()`
2. Добавить функцию `tryAnthropicOcr()` с поддержкой Claude Vision API
3. Модифицировать основной OCR блок для каскадного вызова провайдеров
4. Улучшить текст ошибки с указанием причины
5. Протестировать на отсканированном PDF

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/process-document/index.ts` | Добавить fallback OCR через Anthropic |

## Результат

- Документы будут успешно обрабатываться даже при исчерпании кредитов Lovable AI
- Пользователи получат понятное сообщение о причине ошибки, если оба провайдера недоступны
- Система автоматически восстановит работу при пополнении кредитов Lovable AI (будет использоваться как основной провайдер)
