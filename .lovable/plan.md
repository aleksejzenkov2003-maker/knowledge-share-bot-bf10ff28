
# План: Добавление истории чатов в чат отдела

## Обзор задачи
Реализовать сайдбар с историей чатов для Department Chat, аналогичный личному чату. Это включает:
- Список чатов отдела с группировкой по датам (Сегодня, Вчера, Последние 7 дней и т.д.)
- Кнопка "Новый чат"
- Поиск и фильтрация по агентам
- Переименование и удаление чатов
- Закрепление важных чатов

## Архитектурные изменения

### Текущее состояние
Сейчас на один отдел создаётся один активный чат (`is_active = true`). Хук `useOptimizedDepartmentChat` всегда возвращает этот единственный чат.

### Новая архитектура
Нужно поддержать множество чатов на один отдел (как conversations в личном чате):
- Каждый новый чат — новая запись в `department_chats`
- Пользователь может переключаться между чатами отдела
- История всех чатов отдела видна всем участникам отдела

---

## Технические шаги

### 1. Модификация базы данных

Добавить в таблицу `department_chats` недостающие колонки:

```sql
ALTER TABLE public.department_chats 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
```

### 2. Создать компонент `DepartmentChatSidebar`

Новый компонент `src/components/chat/DepartmentChatSidebar.tsx`:

- Принимает список чатов отдела
- Группирует по дате (логика аналогична `ChatSidebarEnhanced`)
- Кнопка "Новый чат"
- Поиск по названию чата
- Фильтр по агентам (на основе `role_id` сообщений в чате)
- Меню действий: Переименовать, Удалить, Закрепить
- Отображение закреплённых чатов в отдельной секции

### 3. Расширить хук `useOptimizedDepartmentChat`

Добавить функционал:

```typescript
// Новые данные
departmentChats: DepartmentChat[] // Все чаты отдела
activeDepartmentChatId: string | null // Текущий активный чат

// Новые методы
createNewDepartmentChat: () => Promise<void>
selectDepartmentChat: (chatId: string) => void
deleteDepartmentChat: (chatId: string) => Promise<void>
renameDepartmentChat: (chatId: string, newTitle: string) => Promise<void>
pinDepartmentChat: (chatId: string, isPinned: boolean) => Promise<void>
```

Изменить логику:
- `fetchDepartmentChatData` → `fetchDepartmentChats` (получить все чаты отдела)
- Добавить управление `activeDepartmentChatId`
- Автовыбор последнего активного чата при загрузке

### 4. Обновить страницу `DepartmentChat.tsx`

Добавить:
- Сайдбар слева (как в `Chat.tsx`)
- Кнопка toggle сайдбара  
- Передача всех необходимых props в `DepartmentChatSidebar`

Структура:
```text
┌──────────────────────────────────────────────────┐
│ [☰] Sidebar     │ Header with filters            │
├─────────────────┼────────────────────────────────┤
│ + Новый чат     │                                │
│─────────────────│                                │
│ 🔍 Поиск        │      Область сообщений         │
│ 📋 Фильтр агент │                                │
│─────────────────│                                │
│ СЕГОДНЯ         │                                │
│  • Чат 1 ...    │                                │
│  • Чат 2 ...    │                                │
│ ВЧЕРА           │                                │
│  • Чат 3 ...    │──────────────────────────────────│
│                 │      Поле ввода                │
└─────────────────┴────────────────────────────────┘
```

### 5. Обновить страницу `DepartmentChatFullscreen.tsx`

Аналогичные изменения:
- Добавить сайдбар с toggle кнопкой
- Использовать `DepartmentChatSidebar`
- Сохранять `activeDepartmentChatId` в URL параметр для persistence

### 6. Добавить query для получения roles по чатам

По аналогии с `useConversationRolesQuery` создать `useDepartmentChatsRolesQuery`:
- Получает `role_id` из сообщений каждого чата
- Возвращает Map<chatId, roleIds[]> для фильтрации

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/migrations/...` | Добавить `is_pinned` колонку |
| `src/types/departmentChat.ts` | Добавить `is_pinned` в тип |
| `src/components/chat/DepartmentChatSidebar.tsx` | **Новый файл** - сайдбар |
| `src/hooks/useOptimizedDepartmentChat.ts` | Поддержка множества чатов |
| `src/hooks/queries/useChatQueries.ts` | Добавить query для ролей |
| `src/pages/DepartmentChat.tsx` | Добавить сайдбар в layout |
| `src/pages/DepartmentChatFullscreen.tsx` | Добавить сайдбар в layout |

---

## Ожидаемый результат

После реализации:
1. В левой части чата отдела появится сайдбар с историей
2. Пользователи смогут создавать новые чаты внутри отдела
3. История группируется по датам как в личном чате
4. Поддерживается поиск, фильтрация по агентам, закрепление чатов
5. Все участники отдела видят общую историю чатов
