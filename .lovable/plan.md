

# План: Досье-аналитик на Perplexity + Репутация

## Суть проблемы
Сейчас агент Досье пытается сразу парсить входные данные и вызвать Reputation API в одном шаге. Пользователь хочет другой flow:

1. **Агент-аналитик (Perplexity)** — получает входные данные (название ТЗ, компания, адрес и т.д.), ищет в интернете дополнительную информацию и выдаёт структурированную таблицу (ФИО, название, адрес, вид деятельности, ТЗ и пр.)
2. **Репутация** — берёт из результата агента название компании и адрес, делает запрос в Reputation API, создаёт резюме
3. **Проверка** — результат идёт на проверку

## Изменения

### 1. `workflow-step-execute/index.ts` — Принудительный Perplexity для досье-агента

- Если агент имеет reputation enabled, **не вызывать** reputation API сразу в Phase 1
- Вместо этого: передать в `chat-stream` параметр `force_provider: 'perplexity'` и `force_model: 'sonar-pro'`
- Убрать двухфазную логику dossier (строки ~639-722) — агент просто работает как обычный агент с Perplexity
- Агент через prompt_override должен получить инструкцию: собрать данные и выдать JSON-таблицу

### 2. `workflow-step-execute/index.ts` — Передача reputation_query из output агента

- После завершения шага досье-агента, **НЕ** вызывать reputation в этом же шаге
- Reputation вызывается на **следующем** шаге workflow через маппинг рёбер (company_name, address из output первого шага)

### 3. `chat-stream/index.ts` — Поддержка `force_provider`

- Добавить параметр `force_provider` и `force_model` в ChatRequest
- Если указаны — использовать их вместо provider из роли/настроек
- Это позволит workflow-engine принудительно отправить запрос через Perplexity для веб-поиска

### 4. Workflow Template (конфигурация)

Рекомендуемая структура шагов:
```text
[Входные данные] → [Досье-аналитик (Perplexity)] → [Репутация] → [Проверка]
```
- Шаг «Досье-аналитик»: agent с force_provider=perplexity, prompt_override с инструкцией выдать таблицу
- Шаг «Репутация»: agent с reputation enabled, маппинг company_name из предыдущего шага

## Технические детали

**workflow-step-execute/index.ts:**
- Удалить блок "TWO-PHASE DOSSIER" (строки 639-722)
- Вместо этого: проверить `scriptConfig.force_provider` или флаг в agent role
- Передать `force_provider` и `force_model` в chatBody

**chat-stream/index.ts:**
- Расширить `ChatRequest` полями `force_provider?: string`, `force_model?: string`
- В логике выбора провайдера: если `force_provider` задан, создать providerConfig из env-ключей для этого провайдера
- Для Perplexity sonar-pro: использовать web search нативно (модель сама ищет в интернете)

**Результат:** Досье-агент реально ищет информацию в интернете через Perplexity, выдаёт структурированные данные, а репутация работает отдельным шагом на основе этих данных.

