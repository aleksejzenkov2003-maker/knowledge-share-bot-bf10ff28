

# ✅ Оптимизация расхода Perplexity API — ВЫПОЛНЕНО

## Реализованные изменения

### 1. Условный web search (chat-stream) ✅
Web search теперь вызывается **ТОЛЬКО если RAG недостаточен**:

```typescript
const ragInsufficient = rankedChunks.length < 2 || 
  (rankedChunks.length > 0 && rankedChunks[0].relevance_score < 7);

if (
  allowWebSearch && 
  !strictRagMode &&         // Никогда в strict режиме
  ragInsufficient &&        // ТОЛЬКО если RAG слабый
  providerConfig.provider_type === 'anthropic' && 
  PERPLEXITY_API_KEY
) {
  // Web search
}
```

**Ожидаемая экономия:** 60-80% запросов к Perplexity

### 2. Замена sonar-pro на sonar ✅
- В fallback конфигурации `chat-stream`: `sonar-pro` → `sonar`
- В `chat/index.ts`: уже использовался `sonar`

**Экономия:** ~50% на каждый запрос

### 3. Изменение приоритета провайдеров (chat/index.ts) ✅
Было: Perplexity → Anthropic → Lovable
Стало: Anthropic → Lovable → Perplexity

Perplexity теперь используется только как последний резерв.

### 4. Улучшенное логирование ✅
Добавлены логи для отслеживания:
- Причина вызова/пропуска web search
- Количество RAG чанков и их score
- Решение системы (skipping vs performing)

---

## Итоговый flow

```text
Пользователь отправляет сообщение
          ↓
┌─────────────────────────────────────────┐
│ 1. RAG поиск (FTS) — бесплатно          │
│ 2. Re-ranking (Claude) — 1 запрос       │
│ 3. Golden responses — бесплатно         │
│ 4. ПРОВЕРКА: RAG достаточен?            │
│    ├─ ДА → пропустить web search        │ ← ЭКОНОМИЯ
│    └─ НЕТ → Web Search (Perplexity)     │
│ 5. Генерация (Claude) — 1 запрос        │
└─────────────────────────────────────────┘
```

---

## Ожидаемый эффект

| Оптимизация | Экономия |
|-------------|----------|
| Условный web search | 60-80% вызовов |
| sonar вместо sonar-pro | 50% на запрос |
| **Суммарно** | **~70-90%** |

---

## Будущие улучшения (опционально)

1. **Кэширование** — таблица `web_search_cache` с TTL 24 часа
2. **Rate limiting** — лимиты на пользователя/отдел
3. **Метрики** — dashboard с расходом API по агентам/отделам
