
# План: Исправление OCR fallback в process-document

## Проблема

Загрузка PDF файла `cbg.pdf` (17 страниц, 262KB) падает с ошибкой:
```
Maximum call stack size exceeded
```

**Причина**: Код конвертации в base64 использует spread оператор:
```typescript
const base64Pdf = btoa(String.fromCharCode(...pdfData));
```

Для файла 262KB это создаёт ~262,795 аргументов функции — JavaScript падает.

**Вторая проблема**: Неправильный URL API.

---

## Решение

### 1. Безопасная конвертация в Base64

Добавить функцию chunk-обработки:

```typescript
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32768; // 32KB чанки
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}
```

### 2. Исправить URL API

```typescript
// БЫЛО:
'https://ai.lovable.dev/api/chat'

// СТАЛО:
'https://ai.gateway.lovable.dev/v1/chat/completions'
```

### 3. Исправить формат запроса

Lovable AI Gateway использует формат OpenAI:

```typescript
body: JSON.stringify({
  model: 'google/gemini-2.5-flash',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: `Извлеки текст из PDF...` },
        { 
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${base64Pdf}`
          }
        }
      ]
    }
  ],
  max_tokens: 16000,
}),
```

---

## Изменения в файле

**`supabase/functions/process-document/index.ts`**:

| Строка | Изменение |
|--------|-----------|
| ~1645 | Добавить функцию `uint8ArrayToBase64()` |
| 1660 | Заменить spread на вызов новой функции |
| 1663 | Исправить URL на Gateway |
| 1669-1700 | Исправить формат body (image_url вместо file) |

---

## Результат

После исправления:
- PDF любого размера корректно конвертируется в base64
- OCR запрос идёт на правильный endpoint
- Gemini извлекает текст из PDF без текстового слоя
- Документ индексируется в RAG системе
