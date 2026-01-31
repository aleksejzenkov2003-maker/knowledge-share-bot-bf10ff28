

# Анализ расхода Perplexity API и план оптимизации

## Выявленные точки расхода API

### 1. Hybrid Web Search — КАЖДЫЙ запрос к Claude (строки 659-702 в chat-stream)
**ГЛАВНАЯ ПРОБЛЕМА:** При каждом запросе с `providerConfig.provider_type === 'anthropic'` система ВСЕГДА вызывает Perplexity для web-поиска:

```typescript
if (
  allowWebSearch && // Даже если документы нашлись!
  providerConfig.provider_type === 'anthropic' && 
  PERPLEXITY_API_KEY &&
  message
) {
  // Вызов Perplexity sonar — КАЖДЫЙ раз
  const webSearchResponse = await fetch('https://api.perplexity.ai/chat/completions', {
    model: 'sonar',
    messages: [...]
  });
}
```

**Расход:** 1 запрос Perplexity на КАЖДОЕ сообщение пользователя, даже если RAG нашёл релевантные документы.

### 2. Perplexity как основной провайдер (строки 218-223)
Если агент настроен с `provider_type: 'perplexity'`, каждый запрос идёт через их API:

```typescript
} else if (PERPLEXITY_API_KEY) {
  providerConfig = {
    provider_type: 'perplexity',
    api_key: PERPLEXITY_API_KEY,
    default_model: 'sonar-pro',  // Дороже чем sonar!
  };
}
```

### 3. chat/index.ts — дублирующая функция
Функция `supabase/functions/chat/index.ts` тоже использует Perplexity как fallback провайдер.

---

## Текущий flow расхода на 1 сообщение

```text
Пользователь отправляет сообщение
          ↓
┌─────────────────────────────────────┐
│ 1. RAG поиск (FTS) — бесплатно     │
│ 2. Re-ranking (Claude) — 1 запрос   │
│ 3. Golden responses — бесплатно     │
│ 4. Web Search (Perplexity) — ПЛАТНО │ ← Всегда, даже если RAG нашёл!
│ 5. Генерация (Claude) — 1 запрос    │
└─────────────────────────────────────┘
          ↓
ИТОГО: 1 Anthropic + 1-2 Perplexity
```

---

## План оптимизации

### Стратегия 1: Условный web search (Высокий приоритет)

Вызывать Perplexity **ТОЛЬКО если RAG не нашёл достаточно контекста:**

```typescript
// БЫЛО: allowWebSearch && providerConfig.provider_type === 'anthropic' && ...

// СТАНЕТ:
const ragInsufficient = rankedChunks.length < 2 || 
  (rankedChunks.length > 0 && rankedChunks[0].relevance_score < 7);

if (
  allowWebSearch && 
  !strictRagMode &&
  ragInsufficient &&  // ← ТОЛЬКО если RAG слабый
  providerConfig.provider_type === 'anthropic' && 
  PERPLEXITY_API_KEY
) {
  // Web search
}
```

**Ожидаемая экономия:** 60-80% запросов к Perplexity

### Стратегия 2: Использовать sonar вместо sonar-pro

В fallback конфигурации используется дорогой `sonar-pro`:

```typescript
// БЫЛО:
default_model: 'sonar-pro'

// СТАНЕТ:
default_model: 'sonar'  // Дешевле в ~2 раза
```

### Стратегия 3: Кэширование web search результатов

Добавить таблицу кэша для повторяющихся запросов:

```sql
CREATE TABLE web_search_cache (
  id UUID PRIMARY KEY,
  query_hash TEXT UNIQUE,  -- MD5 от нормализованного запроса
  response TEXT,
  citations JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours'
);
```

Перед вызовом Perplexity проверять кэш:
```typescript
const queryHash = await hashQuery(message);
const cached = await supabase
  .from('web_search_cache')
  .select('response, citations')
  .eq('query_hash', queryHash)
  .gt('expires_at', new Date().toISOString())
  .single();

if (cached.data) {
  // Использовать кэш
} else {
  // Вызвать Perplexity и сохранить в кэш
}
```

**Ожидаемая экономия:** 20-40% на повторяющихся вопросах

### Стратегия 4: Rate limiting per user/department

Добавить лимиты на web search:
- Макс. 10 web search в час на пользователя
- Макс. 50 web search в день на отдел

```typescript
const { count } = await supabase
  .from('web_search_usage')
  .select('*', { count: 'exact' })
  .eq('user_id', userId)
  .gte('created_at', oneHourAgo);

if (count >= 10) {
  console.log('Web search rate limit hit, skipping');
  // Skip web search
}
```

### Стратегия 5: Настройка на уровне агента

У нас уже есть `allow_web_search` и `strict_rag_mode` в `chat_roles`, но они не полностью используются. Нужно:

1. **strict_rag_mode = true** → Никогда не вызывать web search
2. **allow_web_search = false** → Никогда не вызывать web search
3. **allow_web_search = true** → Вызывать ТОЛЬКО если RAG недостаточен

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/chat-stream/index.ts` | Условный web search, кэширование |
| `supabase/functions/chat/index.ts` | Аналогичные изменения |
| Миграция БД (опционально) | Таблица кэша + usage tracking |

---

## Быстрые wins (можно сделать сразу)

1. **Изменить условие web search** — добавить проверку `ragInsufficient`
2. **Сменить sonar-pro на sonar** в fallback конфигурации
3. **Логировать расход** — добавить метрики для понимания паттернов

## Ожидаемый эффект

| Оптимизация | Экономия |
|-------------|----------|
| Условный web search | 60-80% |
| sonar вместо sonar-pro | 50% на запрос |
| Кэширование | 20-40% |
| **Суммарно** | **~70-90%** |

---

## Рекомендуемый порядок реализации

1. **Сначала:** Условный web search (быстро, высокий эффект)
2. **Затем:** Замена sonar-pro на sonar
3. **Потом:** Кэширование (требует миграцию БД)
4. **Опционально:** Rate limiting и usage tracking

