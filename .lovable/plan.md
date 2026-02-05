
# План: Проектный режим чата (Фаза 1)

## Обзор

Создание нового типа чата — **Проектный чат** — который сочетает лучшее из личных и групповых чатов, с расширенным управлением контекстом и памятью проекта.

## Ключевые функции Фазы 1

| Функция | Описание |
|---------|----------|
| **Проекты** | Создание проектов с названием, описанием, командой |
| **Участники** | Добавление пользователей и AI-агентов в проект |
| **Контекст-пакеты** | Подключаемые наборы документов (API docs, Guidelines, etc.) |
| **Память проекта** | Глобальные факты/решения + краткосрочный контекст |
| **База документов** | Собственный набор документов для каждого проекта |

---

## Архитектура базы данных

### Новые таблицы

```text
┌─────────────────────────────────────────────────────────────────┐
│                         projects                                 │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ name               TEXT NOT NULL                                │
│ description        TEXT                                         │
│ created_by         UUID (ref profiles)                          │
│ department_id      UUID (ref departments) — опционально         │
│ status             TEXT (active, archived, completed)           │
│ settings           JSONB — настройки проекта                    │
│ created_at         TIMESTAMPTZ                                  │
│ updated_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    project_members                               │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ project_id         UUID (ref projects)                          │
│ user_id            UUID (ref profiles) — NULL для агентов       │
│ agent_id           UUID (ref chat_roles) — NULL для людей       │
│ role               TEXT (owner, admin, member, viewer)          │
│ invited_by         UUID (ref profiles)                          │
│ joined_at          TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    project_chats                                 │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ project_id         UUID (ref projects)                          │
│ title              TEXT                                         │
│ is_active          BOOLEAN                                      │
│ is_pinned          BOOLEAN                                      │
│ created_at         TIMESTAMPTZ                                  │
│ updated_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 project_chat_messages                            │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ chat_id            UUID (ref project_chats)                     │
│ user_id            UUID (ref profiles)                          │
│ agent_id           UUID (ref chat_roles) — для ассистента       │
│ message_role       TEXT (user, assistant)                       │
│ content            TEXT                                         │
│ reply_to_id        UUID (ref self)                              │
│ metadata           JSONB                                        │
│ created_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Контекст-пакеты и память

```text
┌─────────────────────────────────────────────────────────────────┐
│                    context_packs                                 │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ name               TEXT (API Docs, Guidelines, Architecture)    │
│ description        TEXT                                         │
│ folder_ids         UUID[] (ссылки на document_folders)          │
│ is_global          BOOLEAN — доступен всем проектам             │
│ department_id      UUID — или привязан к отделу                 │
│ created_by         UUID                                         │
│ created_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               project_context_packs                              │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ project_id         UUID (ref projects)                          │
│ context_pack_id    UUID (ref context_packs)                     │
│ is_enabled         BOOLEAN — тумблер вкл/выкл                   │
│ priority           INTEGER — порядок для RAG                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  project_memory                                  │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ project_id         UUID (ref projects)                          │
│ memory_type        TEXT (fact, decision, requirement, todo)     │
│ content            TEXT                                         │
│ source_message_id  UUID — откуда взято                          │
│ created_by         UUID                                         │
│ is_active          BOOLEAN                                      │
│ created_at         TIMESTAMPTZ                                  │
│ expires_at         TIMESTAMPTZ — NULL = постоянно               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              project_documents                                   │
├─────────────────────────────────────────────────────────────────┤
│ id                 UUID PRIMARY KEY                             │
│ project_id         UUID (ref projects)                          │
│ document_id        UUID (ref documents) — или отдельный файл    │
│ file_path          TEXT — для собственных файлов                │
│ file_name          TEXT                                         │
│ added_by           UUID                                         │
│ created_at         TIMESTAMPTZ                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## UI Компоненты

### Новые страницы

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/projects` | `Projects.tsx` | Список проектов с созданием |
| `/projects/:id` | `ProjectChat.tsx` | Рабочее пространство проекта |
| `/projects/:id/settings` | `ProjectSettings.tsx` | Настройки проекта |

### Компоненты проекта

```text
src/components/project/
├── ProjectCard.tsx              # Карточка проекта в списке
├── ProjectHeader.tsx            # Заголовок с названием и настройками
├── ProjectSidebar.tsx           # Навигация: чаты, участники, документы
├── ProjectMembersPanel.tsx      # Управление командой
├── ProjectAgentsPanel.tsx       # Добавление AI-агентов
├── ProjectContextPacks.tsx      # Тумблеры контекст-пакетов
├── ProjectMemoryPanel.tsx       # Просмотр/редактирование памяти
├── ProjectDocuments.tsx         # База документов проекта
└── CreateProjectDialog.tsx      # Диалог создания проекта
```

### Интерфейс проекта

```text
┌────────────────────────────────────────────────────────────────┐
│  ☰  Проект: Новый продукт v2.0          [👥 5] [⚙️] [🔍]       │
├──────────────────┬─────────────────────────────────────────────┤
│                  │                                             │
│  📂 Чаты         │    Разработка API (активный)               │
│  ├ Разработка    │    ─────────────────────────────────────── │
│  ├ Тестирование  │                                             │
│  └ Релиз         │    [User] @Architect нужно спроектировать   │
│                  │          REST API для авторизации           │
│  📚 Контекст     │                                             │
│  ├ ✓ API Docs    │    [Architect] Предлагаю использовать       │
│  ├ ✓ Guidelines  │          OAuth2 + JWT токены...             │
│  └ ○ Security    │                                             │
│                  │    [User] @Backend реализуй это             │
│  🧠 Память       │                                             │
│  ├ Факты (12)    │    [Backend] Создаю endpoint /auth/login... │
│  └ Решения (5)   │                                             │
│                  │   ─────────────────────────────────────────  │
│  👥 Команда      │                                             │
│  ├ @Architect    │   [ @агент Ваше сообщение...          📎 ] │
│  ├ @Backend      │                                             │
│  └ @QA           │                                             │
│                  │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

---

## Логика работы

### Контекст-пакеты

```typescript
// При отправке сообщения в проектный чат
const enabledPacks = await getEnabledContextPacks(projectId);
const folderIds = enabledPacks.flatMap(p => p.folder_ids);

// Передаём в chat-stream
const response = await fetch('/functions/v1/chat-stream', {
  body: JSON.stringify({
    message,
    role_id: agentId,
    // Новые поля для проектного режима
    project_id: projectId,
    context_folder_ids: folderIds,  // Ограничить RAG этими папками
    project_memory: await getProjectMemory(projectId),
  })
});
```

### Память проекта

**Типы памяти:**

| Тип | Описание | Пример |
|-----|----------|--------|
| `fact` | Факт о проекте | "API использует OAuth2" |
| `decision` | Принятое решение | "Решили использовать PostgreSQL" |
| `requirement` | Требование | "Время ответа < 200ms" |
| `todo` | Задача | "Добавить rate limiting" |

**Добавление в память:**
- Через UI: кнопка "📌 Запомнить" на сообщении
- Автоматически: агент может предложить добавить факт
- Команды: `/remember`, `/decision`, `/todo`

### Интеграция с chat-stream

```typescript
// Расширение запроса для проектного режима
interface ProjectChatRequest {
  message: string;
  role_id: string;
  project_id: string;
  chat_id: string;
  
  // Контекст проекта
  context_folder_ids?: string[];  // Папки для RAG
  project_memory?: ProjectMemoryItem[];  // Глобальные факты
  
  // История
  message_history: Message[];
}

// В системном промпте агента добавляется секция:
const projectContext = `
## Контекст проекта "${project.name}"
${project.description}

## Память проекта (важные факты и решения):
${projectMemory.map(m => `- [${m.memory_type}] ${m.content}`).join('\n')}

## Участники:
${members.map(m => `- ${m.name} (${m.role})`).join('\n')}
`;
```

---

## RLS Политики

```sql
-- projects: участники видят свои проекты
CREATE POLICY "project_members_read" ON projects
FOR SELECT USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_id = projects.id 
    AND user_id = auth.uid()
  )
);

-- project_chat_messages: только участники проекта
CREATE POLICY "project_messages_read" ON project_chat_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM project_chats pc
    JOIN project_members pm ON pm.project_id = pc.project_id
    WHERE pc.id = project_chat_messages.chat_id
    AND pm.user_id = auth.uid()
  )
);
```

---

## Storage

```sql
-- Новый бакет для документов проекта
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false);

-- RLS: только участники проекта могут загружать/скачивать
CREATE POLICY "project_docs_access" ON storage.objects
FOR ALL USING (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = (storage.foldername(name))[1]::uuid
    AND pm.user_id = auth.uid()
  )
);
```

---

## Порядок реализации

### Шаг 1: База данных
1. Создать таблицы: `projects`, `project_members`, `project_chats`, `project_chat_messages`
2. Создать таблицы: `context_packs`, `project_context_packs`, `project_memory`
3. Создать таблицу `project_documents`
4. Настроить RLS политики
5. Создать storage bucket

### Шаг 2: Типы и хуки
1. Добавить типы в `src/types/project.ts`
2. Создать `src/hooks/useProjectChat.ts` (на основе useOptimizedDepartmentChat)
3. Создать `src/hooks/queries/useProjectQueries.ts`

### Шаг 3: UI Компоненты
1. Страница списка проектов `Projects.tsx`
2. Компоненты проекта: `ProjectSidebar`, `ProjectHeader`, `ProjectMembersPanel`
3. Страница проекта `ProjectChat.tsx`
4. Диалоги: создание проекта, добавление участников, настройка контекста

### Шаг 4: Backend
1. Расширить `chat-stream` для поддержки `project_id`
2. Добавить инъекцию памяти проекта в системный промпт
3. Добавить ограничение RAG по папкам контекст-пакетов

### Шаг 5: Навигация
1. Добавить маршруты в `App.tsx`
2. Добавить пункт меню в `AdminSidebar.tsx`

---

## Файлы для создания/изменения

| Файл | Действие |
|------|----------|
| `supabase/migrations/xxx_create_projects.sql` | Создать |
| `src/types/project.ts` | Создать |
| `src/hooks/useProjectChat.ts` | Создать |
| `src/hooks/queries/useProjectQueries.ts` | Создать |
| `src/pages/Projects.tsx` | Создать |
| `src/pages/ProjectChat.tsx` | Создать |
| `src/components/project/*` | Создать (5-7 компонентов) |
| `supabase/functions/chat-stream/index.ts` | Расширить |
| `src/App.tsx` | Добавить маршруты |
| `src/components/layout/AdminSidebar.tsx` | Добавить пункт меню |

---

## Будущие фазы (после Фазы 1)

| Фаза | Функциональность |
|------|------------------|
| **Фаза 2** | Треды и ветки обсуждений, статусы тредов (Draft → Approved) |
| **Фаза 3** | Типы сообщений (код, decision, todo), пины, decision log |
| **Фаза 4** | Расширенный поиск с фильтрами, автосжатие истории |
| **Фаза 5** | Интеграции (Jira, GitHub), автогенерация артефактов |
