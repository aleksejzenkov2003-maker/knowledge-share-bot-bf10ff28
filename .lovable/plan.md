
# План: Упрощённый интерфейс для employee + iframe Bitrix24

## Текущее состояние

Система уже поддерживает роли (`admin`, `moderator`, `employee`) через таблицу `user_roles`. AuthContext загружает роль пользователя при аутентификации. AdminSidebar фильтрует пункты меню по ролям.

**Что нужно изменить:**
1. Ограничить меню для `employee` - только "Чат" и "Чат отдела"
2. Настроить CSP для работы в iframe Bitrix24
3. Редирект employee на /chat вместо дашборда

---

## Изменение 1: Ограничить пункты меню для employee

**Файл:** `src/components/layout/AdminSidebar.tsx`

Добавить `roles` к пунктам главного меню:

```typescript
const mainMenuItems = [
  { title: 'Дашборд', url: '/', icon: LayoutDashboard, roles: ['admin', 'moderator'] },
  { title: 'Чат', url: '/chat', icon: MessageSquare },  // доступен всем
  { title: 'Чат отдела', url: '/department-chat', icon: MessagesSquare },  // доступен всем
];

// Также скрыть "Отделы" для employee
const adminItems = [
  { title: 'Пользователи', url: '/users', icon: Users, roles: ['admin', 'moderator'] },
  { title: 'Отделы', url: '/departments', icon: Building2, roles: ['admin', 'moderator'] },  // добавить roles
  // ...
];
```

Также обновить заголовок sidebar для employee:

```typescript
{!collapsed && (
  <div className="flex flex-col">
    <span className="text-sm font-semibold">AI Chat</span>
    <span className="text-xs text-muted-foreground">
      {role === 'employee' ? 'Чат-бот' : 'Админ-панель'}
    </span>
  </div>
)}
```

---

## Изменение 2: Редирект employee на /chat

**Файл:** `src/pages/Dashboard.tsx` или `src/App.tsx`

Для роли `employee` - автоматический редирект с `/` на `/chat`:

**Вариант A - в Dashboard:**
```typescript
const Dashboard = () => {
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (role === 'employee') {
      navigate('/chat', { replace: true });
    }
  }, [role, navigate]);

  // ... остальной код для admin/moderator
};
```

**Вариант B - в App.tsx (добавить отдельный роут):**
```typescript
<Route path="/" element={
  <ProtectedRoute>
    <RoleBasedRedirect />
  </ProtectedRoute>
} />
```

Выберу вариант A как менее инвазивный.

---

## Изменение 3: Настройка X-Frame-Options для iframe

**Файл:** `index.html`

Добавить meta-тег Content-Security-Policy:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Разрешить iframe для Bitrix24 -->
  <meta http-equiv="Content-Security-Policy" 
        content="frame-ancestors 'self' https://*.bitrix24.ru https://*.bitrix24.com https://*.bitrix24.by https://*.bitrix24.kz;" />
  <!-- ... остальное -->
</head>
```

**Важно:** Meta-тег CSP с `frame-ancestors` игнорируется большинством браузеров (работает только заголовок). Поэтому также нужна Edge Function для прокси или настройка Lovable publish.

**Альтернатива - Edge Function прокси:**
```typescript
// supabase/functions/app-proxy/index.ts
// Эта функция будет отдавать HTML с правильными заголовками
```

Но для Lovable проще использовать прямую ссылку на preview - X-Frame-Options не блокируется по умолчанию.

---

## Изменение 4: Компактный лейаут для iframe (опционально)

Создать альтернативный лейаут без header и с минимальным sidebar:

**Файл:** `src/components/layout/EmployeeLayout.tsx`

```typescript
export const EmployeeLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <EmployeeSidebar />  {/* Компактный sidebar */}
        <div className="flex-1 flex flex-col">
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
```

Или использовать существующий AdminLayout - он уже скрывает ненужные пункты меню.

---

## Изменение 5: Динамический выбор лейаута в App.tsx

**Файл:** `src/App.tsx`

Можно создать обёртку, которая выбирает лейаут на основе роли:

```typescript
const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role } = useAuth();
  
  // Для employee используем тот же AdminLayout, но sidebar уже фильтрует пункты
  return <AdminLayout>{children}</AdminLayout>;
};
```

Либо оставить как есть - AdminSidebar уже адаптивный.

---

## Файлы для изменения

1. **src/components/layout/AdminSidebar.tsx** - добавить `roles` к mainMenuItems
2. **src/pages/Dashboard.tsx** - редирект employee на /chat
3. **index.html** - добавить CSP meta-тег (ограниченная поддержка)

---

## Тестирование в Bitrix24

1. В админке Bitrix24 создать локальное приложение
2. URL приложения: `https://knowledge-share-bot.lovable.app/login`
3. После логина employee попадает на `/chat`
4. Sidebar показывает только "Чат" и "Чат отдела"

---

## Ожидаемый результат

```text
Для employee:
┌─────────────────────────────────────────┐
│ [≡]           AI Chat - Чат-бот    [U] │
├──────────┬──────────────────────────────┤
│ Основное │                              │
│ ▶ Чат    │      [ Интерфейс чата ]      │
│   Чат    │                              │
│   отдела │                              │
│──────────│                              │
│ [Выйти]  │                              │
└──────────┴──────────────────────────────┘
```

Для admin/moderator - всё остаётся как прежде.
