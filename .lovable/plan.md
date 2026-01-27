
# План: Исправление доступа к документам и добавление истории в чат отделов

## Обнаруженные проблемы

### Проблема 1: "Документ не найден" для employee

**Причина**: RLS политика таблицы `documents` требует `department_id = get_user_department(auth.uid())`, но **все документы в базе имеют `department_id = NULL`**. Для employee-пользователей NULL ≠ их department_id, поэтому запрос не возвращает документы.

```sql
-- Текущая политика (строка 267-274 миграции):
USING (
    is_admin() 
    OR has_role(auth.uid(), 'moderator')
    OR department_id = get_user_department(auth.uid())  -- NULL ≠ user's dept!
);
```

### Проблема 2: Нет истории и фильтра в чатах отделов

**Причина**: Страница `DepartmentChat.tsx` использует архитектуру **единого общего чата** для всего отдела (один `department_chat` на отдел), в отличие от `Chat.tsx`, где каждый пользователь имеет множество личных диалогов.

Текущая структура:
- Обычный чат: `conversations` → много диалогов на пользователя → sidebar с историей
- Чат отдела: `department_chats` → один чат на отдел → без sidebar

---

## Решение 1: Исправить доступ к документам

### Вариант A: Обновить RLS политику (рекомендуется)

Разрешить просмотр документов с `department_id = NULL` всем авторизованным пользователям:

```sql
CREATE POLICY "Users can view documents in their department or public"
ON public.documents FOR SELECT
TO authenticated
USING (
    is_admin() 
    OR has_role(auth.uid(), 'moderator')
    OR department_id IS NULL  -- Документы без отдела доступны всем
    OR department_id = get_user_department(auth.uid())
);
```

Аналогичные изменения для:
- `document_chunks` (зависит от `documents`)
- Storage bucket `rag-documents`

### Вариант B: Назначить department_id всем документам

```sql
UPDATE documents SET department_id = 'юридический-id' WHERE department_id IS NULL;
```

**Минус**: документы станут доступны только одному отделу.

**Рекомендация**: Вариант A — общие документы доступны всем, при этом можно создавать отдельные документы для конкретных отделов.

---

## Решение 2: Добавить историю и фильтр в чат отделов

### Подход A: Sidebar с историей сообщений (внутри одного чата)

Добавить боковую панель с группировкой сообщений по дате и поиском:

```text
┌─────────────────────────────────────────────────┐
│ [≡] Чат отдела — Юридический          [Filter] │
├──────────┬──────────────────────────────────────┤
│ Q        │                                      │
│ Поиск... │     [ Сообщения чата ]               │
│          │                                      │
│ ──────── │                                      │
│ СЕГОДНЯ  │                                      │
│ @юрист..│                                      │
│ @ТЗ конс│                                      │
│ ──────── │                                      │
│ ВЧЕРА    │                                      │
│ @поиск..│                                      │
└──────────┴──────────────────────────────────────┘
```

### Подход B: Фильтр по агентам в header

Добавить dropdown для фильтрации сообщений по использованному агенту:

```tsx
<Select value={agentFilter} onValueChange={setAgentFilter}>
  <SelectItem value="all">Все агенты</SelectItem>
  {availableAgents.map(agent => (
    <SelectItem value={agent.id}>@{agent.mention_trigger}</SelectItem>
  ))}
</Select>
```

**Рекомендация**: Подход B проще в реализации и соответствует концепции единого группового чата.

---

## Файлы для изменения

### 1. Миграция БД
Создать новую миграцию для обновления RLS политик:

```sql
-- Удалить старую политику
DROP POLICY IF EXISTS "Users can view documents in their department or admins can view" ON documents;

-- Создать новую с поддержкой NULL department
CREATE POLICY "Users can view documents in their department or public"
ON documents FOR SELECT TO authenticated
USING (
    is_admin() 
    OR has_role(auth.uid(), 'moderator')
    OR department_id IS NULL
    OR department_id = get_user_department(auth.uid())
);

-- Аналогично для document_chunks
DROP POLICY IF EXISTS "Users can view chunks for accessible documents" ON document_chunks;

CREATE POLICY "Users can view chunks for accessible documents"
ON document_chunks FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM documents d 
        WHERE d.id = document_id 
        AND (
            is_admin() 
            OR has_role(auth.uid(), 'moderator')
            OR d.department_id IS NULL
            OR d.department_id = get_user_department(auth.uid())
        )
    )
);
```

### 2. src/pages/DepartmentChat.tsx
Добавить:
- State для фильтра агентов: `const [agentFilter, setAgentFilter] = useState("all")`
- Фильтрация сообщений: `messages.filter(m => agentFilter === "all" || m.role_id === agentFilter)`
- Dropdown в header для выбора агента
- Опционально: поиск по содержимому сообщений

### 3. src/pages/DepartmentChatFullscreen.tsx
Аналогичные изменения для полноэкранного режима.

### 4. src/hooks/useOptimizedDepartmentChat.ts
- Увеличить лимит загрузки с 100 до 200+ сообщений
- Добавить пагинацию или виртуализацию для больших историй

---

## Итоговый результат

После применения изменений:

1. **Документы доступны**: Employee-пользователи смогут открывать источники в SourcesPanel
2. **Фильтр по агентам**: Dropdown в header позволит просматривать сообщения от конкретного агента
3. **Поиск**: Опциональное поле поиска для навигации по истории

```text
┌─────────────────────────────────────────────────────────────┐
│ 👥 Юридический  │ 🔍 │ [Все агенты ▼]  │ @юрист @ТЗ +2  🔲│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    [ Отфильтрованные сообщения чата отдела ]                │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ [📎] Напишите @агент и ваш вопрос...                    [➤]│
└─────────────────────────────────────────────────────────────┘
```
