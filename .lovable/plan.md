

# База ТЗ: доступ для всех + история поисков + агент в чате

## Что нужно сделать

1. **Сделать "База ТЗ" доступной всем ролям в меню** — переместить из `managementItems` (admin-only) в `mainMenuItems`
2. **Убрать ограничение маршрута** — в `App.tsx` убрать `allowedRoles={['admin']}` с `/trademarks`
3. **Создать таблицу `trademark_searches`** — для хранения истории поисков каждого пользователя (аналог `reputation_reports`)
4. **Добавить историю поисков в UI** — сайдбар с историей в `Trademarks.tsx` (как в Reputation)
5. **Скрыть админские функции** (загрузка CSV, удаление, очистка базы) от не-админов

## Детали

### Таблица `trademark_searches`

```sql
CREATE TABLE public.trademark_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query text,
  search_type text DEFAULT 'quick', -- quick | advanced
  search_params jsonb DEFAULT '{}',
  results_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.trademark_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own searches"
  ON public.trademark_searches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own searches"
  ON public.trademark_searches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own searches"
  ON public.trademark_searches FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all searches"
  ON public.trademark_searches FOR ALL USING (is_admin()) WITH CHECK (is_admin());
```

### Sidebar (`AdminSidebar.tsx`)

Переместить `{ title: 'База ТЗ', url: '/trademarks', icon: Stamp }` из `managementItems` в `mainMenuItems` (без `roles`).

### Маршрут (`App.tsx`)

```tsx
// Было:
<ProtectedRoute allowedRoles={['admin']}>
// Станет:
<ProtectedRoute>
```

### UI (`Trademarks.tsx`)

- Добавить боковую панель с историей поисков (список последних запросов пользователя)
- При выполнении поиска — сохранять запрос в `trademark_searches`
- Клик по записи в истории — подставляет параметры и повторяет поиск
- Кнопка удаления записи из истории
- Админские функции (Upload CSV, Clear All, Delete) — показывать только для admin

### RLS трademarks

Уже настроена: `Authenticated users can view trademarks` — SELECT разрешён всем. Управление (INSERT/UPDATE/DELETE) — только admin. Менять не нужно.

### Файлы для изменения

- `src/components/layout/AdminSidebar.tsx` — перенос пункта меню
- `src/App.tsx` — убрать ограничение роли
- `src/pages/Trademarks.tsx` — добавить историю поисков, скрыть админ-функции
- Новая миграция — таблица `trademark_searches`

