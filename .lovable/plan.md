

## Диагноз

Проблема состоит из двух частей:

### 1. Reputation API зависает на больших запросах (основная причина)
Лог показывает: `Reputation: Searching for "ПАО Газпром"` — и **ничего после**. Функция убивается по wall-time (~150с). При этом запрос с опечаткой `"ПАО Гаизпром"` вернул 0 результатов за 683ms — API работает, но для популярных запросов (Газпром = сотни результатов) `api.reputation.ru` отвечает слишком долго.

**Решение:** Добавить `AbortSignal.timeout(25000)` на все fetch к `api.reputation.ru` внутри `chat-stream`, чтобы при зависании API через 25 секунд возвращать пользователю сообщение "API не ответил, попробуйте уточнить запрос".

### 2. В чате нет нормализации запроса (как на странице /reputation)
Страница `/reputation` нормализует запрос через `normalizeSearchQuery()` — извлекает ИНН/ОГРН из текста, удаляет организационно-правовые формы ("Общество с ограниченной ответственностью"), парсит адреса. В `chat-stream` — запрос идёт как есть.

**Решение:** Портировать `normalizeSearchQuery` в `chat-stream/index.ts`.

### 3. Другие чаты тоже сломаны
Если reputation-запрос зависает, весь edge function instance занят на 150 секунд и убивается. Это может блокировать новые запросы. Timeout в 25с решит и эту проблему.

## План изменений

### Файл: `supabase/functions/chat-stream/index.ts`

**Изменение 1: Добавить функцию normalizeSearchQuery (перед блоком reputation)**

Портировать из `src/pages/Reputation.tsx` (строки 190-231) логику нормализации:
- Извлечение ИНН (10/12 цифр), ОГРН (13/15 цифр)
- Удаление организационно-правовых форм
- Парсинг адресов с кавычками
- Очистка мусора

**Изменение 2: Нормализовать запрос перед поиском (строка ~827)**

```text
БЫЛО:
console.log(`Reputation: Searching for "${message}"`);

БУДЕТ:
const normalizedQuery = normalizeRepQuery(message);
console.log(`Reputation: Searching for "${message}" → "${normalizedQuery}"`);
```

**Изменение 3: Добавить timeout 25s на все fetch к api.reputation.ru**

Каждый `fetch(REPUTATION_API_BASE/...)` получает `{ signal: AbortSignal.timeout(25000) }`:

- Поиск (строка ~830): `fetch(...entities/search, { signal: AbortSignal.timeout(25000), ... })`
- Карточка компании (строки ~785, ~852): `fetch(...entities/${type}?id=..., { signal: AbortSignal.timeout(25000), ... })`
- FIPS patents/applications (строки ~797, ~861): `fetch(...fips/${ep}?..., { signal: AbortSignal.timeout(15000), ... })`

При timeout — ловить ошибку в catch и возвращать пользователю сообщение вместо бесконечной загрузки.

**Изменение 4: Использовать нормализованный запрос в QueryText (строка ~833)**

```text
БЫЛО:
body: JSON.stringify({ QueryText: message, ... })

БУДЕТ:
body: JSON.stringify({ QueryText: normalizedQuery, ... })
```

```text
Поток данных после изменений:

Пользователь вводит: "ПАО Газпром"
→ normalizeRepQuery → "Газпром" (без орг-правовой формы)
→ fetch api.reputation.ru с timeout 25s
→ Результат за ~5s (вместо зависания на 150s)
→ Карусель или досье в чате
```

### Итого файлов: 1
- `supabase/functions/chat-stream/index.ts` — 4 точечных изменения

