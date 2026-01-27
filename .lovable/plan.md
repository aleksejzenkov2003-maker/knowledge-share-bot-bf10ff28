
# План улучшения Bitrix24 iframe чатов (Личный и Общий)

## Анализ текущего состояния

### Что есть в основных чатах (ChatFullscreen, DepartmentChatFullscreen), но отсутствует в Bitrix-версиях:

| Функция | Основной чат | BitrixPersonalChat | BitrixDepartmentChat |
|---------|-------------|-------------------|---------------------|
| Фильтр по ролям/агентам | Есть | Нет | Нет |
| Поиск чатов | Есть | Нет | Нет (нет истории) |
| Загрузка документов | Есть | Нет | Нет |
| Остановка генерации | Есть | Нет | Нет |
| Переписать другой ролью | Есть | Нет | Нет |
| Копировать ответ | Есть | Нет | Нет |
| Скачать (MD/DOCX/PDF) | Есть | Нет | Нет |
| Удалить отдельный ответ | Нет | Нет | Нет |
| Ссылки на источники (Sheet) | Есть | Нет | Частично |
| Выбор роли из выпадающего меню | Есть | Есть | Только @ |

---

## Этап 1: Создание переиспользуемых компонентов для Bitrix

### 1.1 Создать BitrixMessageActions.tsx
Адаптированная версия MessageActions для Bitrix-чатов:
- Копировать (rich text)
- Скачать (MD/DOCX/PDF)
- Переписать другой ролью
- Удалить сообщение (новая функция)

### 1.2 Создать BitrixChatMessage.tsx
Унифицированный компонент сообщения для обоих Bitrix-чатов:
- Markdown рендеринг с улучшенными таблицами
- Панель источников (SourcesPanel)
- Интеграция BitrixMessageActions

---

## Этап 2: Улучшение BitrixPersonalChat.tsx

### 2.1 UI: Sidebar с фильтрами
```text
┌──────────────────────┐
│ [+ Новый диалог]     │
├──────────────────────┤
│ [🔍] [Фильтр агента] │
├──────────────────────┤
│ ▼ Закреплённые       │
│   • Чат про патенты  │
├──────────────────────┤
│ ▼ Сегодня            │
│   • Вопрос по ТЗ ... │
│   • Консультация ... │
└──────────────────────┘
```

Изменения:
- Добавить поиск по названию чатов
- Добавить Select для фильтрации по роли (агенту)
- Группировка по датам (сегодня/вчера/ранее)

### 2.2 UI: Input с прикреплением файлов
Заменить базовый Textarea на ChatGPT-style input:
- Кнопка прикрепления файлов (PDF, JPG, PNG, WEBP до 10MB)
- Выбор агента через dropdown
- Кнопка остановки генерации

### 2.3 Сообщения
- Интегрировать BitrixChatMessage вместо базового ChatMessage
- Добавить кнопки действий при наведении
- Показывать источники (документы + веб)

### 2.4 API расширения
Добавить endpoints в bitrix-chat-api:
- `DELETE /personal/messages/:id` - удаление сообщения
- `POST /personal/conversations/:id/regenerate` - перегенерация с другой ролью
- Поддержка attachments в существующем POST messages

---

## Этап 3: Улучшение BitrixDepartmentChat.tsx

### 3.1 UI: Добавить sidebar с историей чатов
Сейчас department chat не имеет истории на уровне UI. Добавить:
```text
┌──────────────────────┐
│ Чат отдела: Юрид.    │
├──────────────────────┤
│ [🔍] [Фильтр агента] │
├──────────────────────┤
│ ▼ Сегодня            │
│   @юрист: Вопрос ... │
│   @поисковик: ...    │
└──────────────────────┘
```

### 3.2 UI: Выбор агента из dropdown (альтернатива @)
Добавить dropdown рядом с полем ввода:
- Список доступных агентов
- При выборе автоматически вставляет @mention в поле
- Более надёжно чем ручной ввод @

### 3.3 Сообщения
- Интегрировать BitrixChatMessage
- Добавить MessageActions (копировать, скачать, удалить)
- Улучшить markdown-рендеринг (таблицы, отступы)

### 3.4 Input
- Добавить загрузку файлов
- Добавить кнопку остановки генерации

---

## Этап 4: Edge Function расширения (bitrix-chat-api)

### 4.1 Новые endpoints
```typescript
// Удаление сообщения
DELETE /personal/messages/:id
DELETE /department/messages/:id

// Перегенерация с другой ролью
POST /personal/conversations/:id/regenerate
Body: { message_id, role_id }

// Загрузка файлов
POST /personal/attachments
POST /department/attachments
```

### 4.2 Улучшение streaming response
Добавить в metadata ответа:
- `web_search_citations[]` - ссылки из веб-поиска
- `rag_context[]` - контекст из документов
- `citations[]` - структурированные цитаты

---

## Этап 5: Исправление проблем с контентом

### 5.1 Проблема: Таблицы "слетают"
Причина: ReactMarkdown с remarkGfm иногда некорректно парсит таблицы.

Решение в BitrixChatMessage:
- Добавить CSS стили для таблиц с явными borders
- Использовать `overflow-x-auto` для широких таблиц
- Добавить alternating row colors для читаемости

### 5.2 Проблема: "Сплошной текст без пробелов"
Причина: В BitrixDepartmentChat MessageBubble использует базовый ReactMarkdown без кастомных компонентов.

Решение:
- Использовать те же компоненты что в ChatMessage (h1-h4, p, ul, ol, blockquote)
- Добавить CSS: `prose prose-sm` с правильными margins

### 5.3 Проблема: Агент не видит контекст выше
Это проблема на уровне chat-stream edge function. Уже исправлено в memory `chat-context-management-v2` - message_history передаётся всегда. Если проблема сохраняется, нужно проверить:
- Правильно ли передаётся history в department/send-message
- Не теряется ли role при переключении агентов

---

## Файлы для создания/изменения

### Новые файлы:
1. `src/components/chat/BitrixMessageActions.tsx` - действия с сообщениями
2. `src/components/chat/BitrixChatMessage.tsx` - унифицированный компонент сообщения

### Изменяемые файлы:
3. `src/pages/BitrixPersonalChat.tsx` - полная переработка UI
4. `src/pages/BitrixDepartmentChat.tsx` - добавление sidebar + улучшение UI
5. `supabase/functions/bitrix-chat-api/index.ts` - новые endpoints

---

## Технические детали

### Структура BitrixChatMessage
```tsx
interface BitrixChatMessageProps {
  message: Message | DepartmentMessage;
  onCopy?: () => void;
  onDelete?: (id: string) => void;
  onRegenerate?: (id: string, roleId?: string) => void;
  availableRoles?: ChatRole[];
  showSources?: boolean;
}
```

### API для удаления сообщения
```typescript
// DELETE /personal/messages/:id
// Response: { success: true }

// При удалении:
// 1. Удалить сообщение из messages таблицы
// 2. Если это последний user message, удалить и следующий assistant message
// 3. Вернуть обновлённый список
```

### CSS улучшения для таблиц
```css
.chat-table {
  @apply w-full border-collapse my-3 rounded-lg overflow-hidden;
}
.chat-table th {
  @apply bg-muted/50 px-3 py-2 text-left font-semibold border-b;
}
.chat-table td {
  @apply px-3 py-2 border-b border-border/50;
}
.chat-table tr:nth-child(even) {
  @apply bg-muted/20;
}
```

---

## Порядок реализации

1. Создать BitrixMessageActions.tsx
2. Создать BitrixChatMessage.tsx  
3. Обновить BitrixPersonalChat.tsx с новым UI
4. Обновить BitrixDepartmentChat.tsx с sidebar и улучшениями
5. Расширить bitrix-chat-api с новыми endpoints
6. Протестировать и задеплоить edge function
