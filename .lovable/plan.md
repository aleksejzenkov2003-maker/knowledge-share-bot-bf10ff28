

# Интеграция API Reputation.ru как агента "Бренд Поиск"

## Что такое API Reputation.ru

Reputation.ru -- сервис проверки контрагентов с 40+ источниками данных. Базовый URL: `https://api.reputation.ru`. Авторизация: заголовок `Authorization: {ApiKey}`.

Ключевые эндпоинты (из документации и Swagger):

| Эндпоинт | Метод | Что возвращает |
|---|---|---|
| `/api/v1/entities/search` | POST | Поиск по названию/ИНН/ОГРН, результат: Id, Type, Inn, Ogrn, Name, Address |
| `/api/v1/entities/id?inn=...` | GET | Получение EntityId по ИНН/ОГРН (бесплатно) |
| `/api/v1/entities/company?id=...` | GET | Карточка компании: ИНН, ОГРН, КПП, наименования, состояние, ОКВЭД, уставной капитал |
| `/api/v1/entities/entrepreneur?id=...` | GET | Карточка ИП |
| `/api/v1/entities/person?id=...` | GET | Карточка физлица |

По маркетинговой странице reputation.ru/api также доступны (но точные URL эндпоинтов потребуют проверки с тестовым ключом):
- Арбитражные дела
- Бухгалтерская отчетность
- Скоринг и проверка контрагента
- Товарные знаки/интеллектуальная собственность
- Аффилированные лица
- Госзакупки
- Банкротство
- Блокировка счетов

## Что мы сможем доставать для агента "Бренд Поиск"

1. **Базовые сведения о компании**: название, ИНН, ОГРН, адрес, статус, ОКВЭД, уставной капитал
2. **Арбитражная практика**: судебные дела с участием компании (важно для оценки рисков)
3. **Финансовые данные**: бухгалтерская отчетность, выручка, прибыль
4. **Связанные лица**: учредители, руководители, аффилированные структуры
5. **Интеллектуальная собственность**: товарные знаки, патенты (если доступно в API)
6. **Скоринг**: автоматическая оценка надежности контрагента

## Архитектура решения

### Фаза 1 (сейчас) -- Edge Function + интеграция в chat-stream

```text
Пользователь: "@Поиск бренда Компания ООО Ромашка"
       |
       v
  chat-stream (определяет role = "Поиск бренда")
       |
       v
  Вызов edge function "reputation-api"
    -> POST /api/v1/entities/search { QueryText: "ООО Ромашка" }
    -> GET /api/v1/entities/company?id=<entityId>
    -> (опционально) другие эндпоинты
       |
       v
  Данные добавляются в RAG-контекст как "ДАННЫЕ ИЗ REPUTATION API"
       |
       v
  LLM формирует структурированный отчет-досье
```

### Компоненты

**1. Новая Edge Function: `reputation-api`**

Файл: `supabase/functions/reputation-api/index.ts`

Принимает:
- `query` -- текст запроса (название компании, ИНН, ОГРН)
- `action` -- тип действия: `search`, `company`, `entrepreneur`, `person`
- `entity_id` -- для запроса карточки

Возвращает: структурированный JSON с данными компании.

Логика:
1. Поиск: `POST /api/v1/entities/search` с переданным запросом
2. Получение EntityId из результатов
3. Запрос карточки: `GET /api/v1/entities/company?id=...`
4. Возврат объединенных данных

**2. Интеграция в `chat-stream/index.ts`**

Для роли "Поиск бренда" (или любой роли с новым флагом `use_reputation_api`):
- Перед вызовом LLM, если в сообщении обнаружено название компании / ИНН / ОГРН
- Вызвать `reputation-api` edge function
- Форматировать полученные данные как блок контекста
- Добавить в `systemPrompt` инструкцию: "Используй данные из Reputation API как основной источник фактов о компании"

**3. Секрет `REPUTATION_API_KEY`**

Необходимо сохранить тестовый API-ключ как секрет Lovable Cloud.

**4. Обновление таблицы `chat_roles`**

Добавить поле `external_apis` (JSONB) в таблицу `chat_roles` для хранения конфигурации внешних API:
```text
{
  "reputation": {
    "enabled": true,
    "auto_search": true  // автоматически искать компании по ИНН/названию в сообщении
  }
}
```

## Детали реализации

### Edge Function `reputation-api/index.ts`

```text
1. Получить REPUTATION_API_KEY из env
2. Принять { query, action, entity_id } из тела запроса
3. Если action = "search":
   - POST https://api.reputation.ru/api/v1/entities/search
     Body: { QueryText: query, Filter: { EntityTypes: ["Company", "Entrepreneur"] } }
   - Вернуть массив результатов
4. Если action = "full_report":
   - Сначала поиск по query
   - Взять первый результат, получить EntityId
   - GET /api/v1/entities/company?id=EntityId (или entrepreneur/person по Type)
   - Вернуть полную карточку
5. Обработка ошибок: таймауты, недостаточно средств, невалидный ключ
```

### Интеграция в chat-stream

В секции RAG-поиска (после строки ~415), добавить:

```text
// Reputation API integration for brand search roles
if (role has external_apis.reputation.enabled) {
  // Извлечь ИНН/ОГРН из сообщения (regex: /\b\d{10,13}\b/)
  // Или использовать название компании из сообщения
  // Вызвать reputation-api edge function
  // Добавить результат в контекст как "ДАННЫЕ REPUTATION API"
}
```

### SQL миграция

```text
ALTER TABLE chat_roles ADD COLUMN external_apis JSONB DEFAULT '{}';
-- Обновить роль "Поиск бренда" с конфигурацией Reputation API
UPDATE chat_roles SET external_apis = '{"reputation": {"enabled": true, "auto_search": true}}'
WHERE name = 'Поиск бренда';
```

## Порядок реализации

1. Запросить и сохранить секрет `REPUTATION_API_KEY`
2. SQL миграция -- добавить `external_apis` в `chat_roles`
3. Создать edge function `reputation-api/index.ts`
4. Интегрировать вызов в `chat-stream/index.ts`
5. Протестировать с тестовым ключом

## Затронутые файлы

- **Новый**: `supabase/functions/reputation-api/index.ts`
- **Изменение**: `supabase/functions/chat-stream/index.ts` -- добавить вызов Reputation API для ролей с `external_apis.reputation`
- **Миграция**: добавить колонку `external_apis` в `chat_roles`
- **Конфигурация**: `supabase/config.toml` -- добавить `verify_jwt = false` для новой функции

