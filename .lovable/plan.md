

# Поддержка нескольких отделов на одном портале Bitrix24

## Текущее ограничение

Сейчас архитектура работает по принципу **1 портал = 1 отдел**:

```text
+--------------------------+
|  bitrix.artpatent.ru     |
|  (portal_domain)         |
+-----------+--------------+
            |
            | UNIQUE INDEX
            v
+-----------+--------------+
|  department_api_keys     |
|  department_id: "юристы" |
+--------------------------+
```

Это ограничение создано уникальным индексом `idx_department_api_keys_portal_domain`.

---

## Новая архитектура: 1 портал = N отделов

```text
+---------------------------+
|   bitrix.artpatent.ru     |
|   (portal_domain)         |
+-----------+---------------+
            |
            | (без UNIQUE)
            v
+-----------+------------------------------+
|  department_api_keys                     |
|------------------------------------------|
|  portal: bitrix.artpatent.ru             |
|  department_id: "юристы"                 |
|  department_slug: "legal"                |
|------------------------------------------|
|  portal: bitrix.artpatent.ru             |
|  department_id: "бухгалтерия"            |
|  department_slug: "accounting"           |
|------------------------------------------|
|  portal: bitrix.artpatent.ru             |
|  department_id: "маркетинг"              |
|  department_slug: "marketing"            |
+------------------------------------------+
```

---

## Изменения

### 1. База данных

- **Удалить уникальный индекс** на `portal_domain`
- **Добавить составной уникальный индекс** на `(portal_domain, department_id)` — чтобы избежать дублей
- **Добавить колонку `department_slug`** для идентификации отдела в URL (опционально, можно использовать существующий slug из таблицы departments)

### 2. Widget SDK (bitrix-chat-widget-v3.js)

Добавить новый параметр `departmentSlug`:

```javascript
KnowledgeChat.init({
  containerId: 'knowledge-chat',
  portal: 'bitrix.artpatent.ru',
  bitrixUserId: user.ID,
  userName: '...',
  chatType: 'department',
  departmentSlug: 'legal',  // <-- НОВЫЙ параметр
});
```

### 3. HTML-шаблоны для Bitrix24

Создать отдельные HTML-файлы для каждого отдела или один универсальный с параметром:

- `department-legal.html` — для юристов
- `department-accounting.html` — для бухгалтерии
- или универсальный `department.html?dept=legal`

### 4. Edge Function (bitrix-chat-api)

Изменить логику авторизации:

```text
ТЕКУЩАЯ ЛОГИКА:
  portal → найти единственный API key → получить department_id

НОВАЯ ЛОГИКА:
  portal + departmentSlug → найти конкретный API key → получить department_id
```

### 5. Admin UI (ApiKeys.tsx)

- Убрать ошибку "домен уже используется"
- Добавить поле для ввода/выбора department_slug
- Показывать несколько ключей для одного портала

---

## Варианты использования

**Вариант A: Отдельные приложения в Bitrix24**

Создать 3 приложения в Bitrix24:
- "AI Юрист" → указывает на `department-legal.html`
- "AI Бухгалтер" → указывает на `department-accounting.html`
- "AI Маркетинг" → указывает на `department-marketing.html`

**Вариант B: Одно приложение с выбором отдела**

Одно приложение с экраном выбора отдела при входе.

---

## Техническая реализация

### Шаг 1: Миграция БД

```sql
-- Удаляем уникальный индекс на portal_domain
DROP INDEX IF EXISTS idx_department_api_keys_portal_domain;

-- Создаём составной уникальный индекс
CREATE UNIQUE INDEX idx_department_api_keys_portal_department 
ON department_api_keys(portal_domain, department_id) 
WHERE portal_domain IS NOT NULL AND is_active = true;
```

### Шаг 2: Обновление Widget SDK

Добавить параметр `departmentSlug` в инициализацию и передавать его в URL iframe.

### Шаг 3: Обновление Edge Function

Изменить поиск API-ключа:
- Если передан `departmentSlug` — искать по `(portal_domain, department_slug)`
- Если не передан — вернуть список доступных отделов или ошибку

### Шаг 4: Создание HTML-шаблонов

Создать шаблоны для каждого отдела или универсальный шаблон с параметром.

### Шаг 5: Обновление Admin UI

Разрешить создание нескольких ключей для одного портала с разными отделами.

---

## Результат

После реализации:
- Можно создать 3+ API-ключей для `bitrix.artpatent.ru` с разными отделами
- Каждый отдел имеет свой изолированный чат и агентов
- Пользователи Bitrix24 видят только чат своего отдела

