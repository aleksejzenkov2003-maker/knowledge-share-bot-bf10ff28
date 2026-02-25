

## Проблема

Два бага в агенте Reputation в чате:

1. **504 при выборе компании** — `chat-stream` вызывает `reputation-api` edge function (вложенный вызов edge function → edge function), что приводит к таймауту 150 секунд. На странице Reputation (`/reputation`) это работает, потому что браузер вызывает `reputation-api` напрямую — без вложенности.

2. **Карусель рендерится, но только текстом** — данные `reputationResults` передаются в metadata и карусель отображается, но при клике на "Выбрать эту компанию" происходит таймаут из пункта 1.

## Решение

Заменить вызовы `reputation-api` edge function внутри `chat-stream` на **прямые HTTP-запросы к `api.reputation.ru`** — точно так же, как делает страница `/reputation` через `reputation-api`. Логика уже есть в коде (`reputation-api/index.ts`), нужно просто перенести её inline.

### Изменения в `supabase/functions/chat-stream/index.ts`

**Поиск (строки ~816-860):**
- Вместо `fetch(supabaseUrl/functions/v1/reputation-api, { body: { action: 'full_report' } })` — прямой POST на `https://api.reputation.ru/api/v1/entities/search` с `Authorization: REPUTATION_API_KEY`
- Парсить ответ: если 1 результат — получить карточку; если > 1 — вернуть для карусели

**Выбор компании (строки ~777-813):**
- Вместо `fetch(supabaseUrl/functions/v1/reputation-api, { action: entityType })` — прямой GET на `api.reputation.ru/api/v1/entities/{entityType}?id={entityId}`
- Вместо `fetch(supabaseUrl/functions/v1/reputation-api, { action: 'trademarks' })` — прямой GET на `api.reputation.ru/api/v1/fips/patents?entityId=...&entityType=...` + `fips/applications`
- Оба запроса параллельно через `Promise.all`

### Техническая деталь

```text
БЫЛО (504 timeout):
Browser → chat-stream (edge fn) → reputation-api (edge fn) → api.reputation.ru
                                   ↑ вложенный вызов = таймаут

БУДЕТ (прямой вызов):
Browser → chat-stream (edge fn) → api.reputation.ru
                                   ↑ прямой HTTP = быстро
```

### Файлы для изменения

1. **`supabase/functions/chat-stream/index.ts`** — заменить 2 блока (search + select) с вызовов `reputation-api` на прямые запросы к `api.reputation.ru`, скопировав логику из `reputation-api/index.ts`

