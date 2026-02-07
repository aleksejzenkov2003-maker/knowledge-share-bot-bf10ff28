

## План: Заменить Lovable AI на прямой Gemini API + добавить Gemini как провайдера

### Что делаем
Отказываемся от Lovable AI gateway (`ai.gateway.lovable.dev`) и переходим на прямой вызов Google Gemini API (`generativelanguage.googleapis.com`) с вашим собственным ключом. Также добавляем Gemini как отдельный тип провайдера для создания агентов.

### Шаг 1: Добавить секрет GEMINI_API_KEY
Запросим ваш ключ Gemini через систему секретов.

### Шаг 2: Обновить edge-функции

#### 2.1 `process-document/index.ts` — OCR через Gemini напрямую
- Заменить `tryLovableAiOcr()` на `tryGeminiOcr()` 
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Использовать `GEMINI_API_KEY` вместо `LOVABLE_API_KEY`
- Gemini напрямую поддерживает PDF через `inlineData` с `mimeType: application/pdf`
- Это будет **основной OCR** (дешевый и быстрый), Anthropic останется как резерв

#### 2.2 `chat-stream/index.ts` — стриминг через Gemini
- Добавить новый `case 'gemini'` в switch провайдеров
- URL для стриминга: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={API_KEY}`
- Gemini SSE формат отличается от OpenAI — парсить `candidates[0].content.parts[0].text`
- Обновить fallback-логику: заменить `lovable` на `gemini`
- Обновить `getEffectiveApiKey`: добавить `case 'gemini'` с `GEMINI_API_KEY`

#### 2.3 `chat/index.ts` — не-стриминговые вызовы
- Заменить `callLovableAI()` на `callGemini()` 
- URL: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}`
- Обновить `generateQueryEmbedding()` — использовать Gemini для генерации эмбеддингов
- Обновить fallback-цепочку провайдеров

#### 2.4 `rerank-chunks/index.ts` — опционально
- Можно переключить с Anthropic на Gemini для экономии (reranking использует Claude Sonnet 4)
- Или оставить на Anthropic если качество важнее

### Шаг 3: Обновить UI провайдеров (`src/pages/Providers.tsx`)
- Добавить `gemini` в `providerModels` со списком моделей:
  - `gemini-2.5-flash` (быстрый, дешёвый)
  - `gemini-2.5-pro` (мощный)
  - `gemini-2.5-flash-lite` (самый дешёвый)
  - `gemini-2.0-flash` (предыдущее поколение)
- Добавить `gemini` в `providerLabels`: `'Google Gemini'`
- Добавить `gemini` в `envConfiguredProviders` (ключ из env)
- Добавить `SelectItem value="gemini"` в форму создания
- Обновить плейсхолдер API ключа: `'AIza... (опционально)'`

### Шаг 4: Обновить `init-system/index.ts`
- Заменить дефолтный провайдер `lovable` на `gemini` при инициализации системы

### Технические детали

**Формат вызова Gemini API (не-стриминг):**
```text
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
{
  "contents": [
    {"role": "user", "parts": [{"text": "..."}]}
  ],
  "systemInstruction": {"parts": [{"text": "..."}]}
}
```

**Формат вызова Gemini API (стриминг):**
```text
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={API_KEY}
```
SSE формат: `data: {"candidates":[{"content":{"parts":[{"text":"chunk"}]}}]}`

**OCR с PDF:**
```text
"contents": [{
  "parts": [
    {"text": "Извлеки текст..."},
    {"inlineData": {"mimeType": "application/pdf", "data": "base64..."}}
  ]
}]
```

### Какие файлы меняются
1. `supabase/functions/process-document/index.ts` — OCR
2. `supabase/functions/chat-stream/index.ts` — стриминг чата
3. `supabase/functions/chat/index.ts` — не-стриминговый чат + эмбеддинги
4. `supabase/functions/init-system/index.ts` — дефолтный провайдер
5. `src/pages/Providers.tsx` — UI управления провайдерами

### Что НЕ меняется
- Anthropic остаётся как резервный OCR и как отдельный провайдер для агентов
- Perplexity остаётся для веб-поиска
- Структура БД не меняется (provider_type — текстовое поле)
- `rerank-chunks` оставляем на Anthropic (качество reranking критично)

### Ожидаемый результат
- Расходы на OCR снижаются в 10-20 раз (Gemini Flash вместо Claude Sonnet)
- Полная независимость от Lovable AI gateway
- Gemini доступен как провайдер для создания агентов в UI
- Anthropic/Perplexity продолжают работать как раньше
