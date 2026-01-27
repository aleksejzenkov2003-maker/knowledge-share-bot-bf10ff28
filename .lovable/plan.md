
# План: Добавление демо-режима для тестирования Bitrix-чатов

## Обзор

Добавить в страницу `/bitrix-sessions` возможность запускать демо-версии Bitrix-чатов (Личный и Общий) прямо из админки для тестирования.

## Текущая архитектура

Bitrix-чаты (`/bitrix-personal`, `/bitrix-department`) работают так:
1. Получают параметры через URL: `portal`, `bitrixUserId`, `userName`, `userEmail`
2. Делают POST на `/auth` в `bitrix-chat-api`
3. API проверяет portal_domain в `department_api_keys`, создаёт JWT-токен
4. Далее все запросы идут с этим токеном

## Реализация

### 1. Добавить UI-панель "Демо-режим"

В начало страницы `BitrixSessions.tsx` добавить карточку с:
- Dropdown для выбора отдела (из существующих `department_api_keys`)
- Dropdown для выбора типа чата (Личный / Общий)
- Поля для ввода тестовых данных:
  - Bitrix User ID (по умолчанию: "demo-admin-123")
  - Имя пользователя (по умолчанию: "Администратор Тест")
- Кнопка "Открыть демо" (открывает в новом окне/iframe)

```
┌─────────────────────────────────────────────────────────┐
│ 🧪 Демо-режим тестирования                              │
├─────────────────────────────────────────────────────────┤
│ Отдел:    [▼ Юридический          ]                     │
│ Чат:      [▼ Личный чат           ]                     │
│ User ID:  [demo-admin-123________]                      │
│ Имя:      [Тестовый Администратор]                      │
│                                                         │
│ [🚀 Открыть в новом окне]  [📺 Показать здесь]          │
└─────────────────────────────────────────────────────────┘
```

### 2. Логика открытия демо

При нажатии формируется URL:
```typescript
const portal = selectedApiKey.portal_domain; // например: "bitrix.artpatent.ru"
const url = `/bitrix-personal?portal=${portal}&bitrixUserId=${userId}&userName=${encodeURIComponent(userName)}&userEmail=${email}`;
```

Варианты открытия:
1. **Новое окно** - `window.open(url, '_blank', 'width=800,height=700')`
2. **Iframe внутри Dialog** - показывает чат прямо на странице

### 3. Необходимые данные

Нужно загрузить `department_api_keys` с информацией об отделах:
```typescript
const { data } = await supabase
  .from('department_api_keys')
  .select(`
    id,
    portal_domain,
    department_id,
    is_active,
    departments(name)
  `)
  .eq('is_active', true)
  .order('created_at', { ascending: false });
```

### 4. Структура состояний

```typescript
// Demo state
const [demoPortal, setDemoPortal] = useState<string>('');
const [demoChatType, setDemoChatType] = useState<'personal' | 'department'>('personal');
const [demoUserId, setDemoUserId] = useState<string>('demo-admin-123');
const [demoUserName, setDemoUserName] = useState<string>('Тестовый Администратор');
const [demoUserEmail, setDemoUserEmail] = useState<string>('admin@test.local');
const [showDemoIframe, setShowDemoIframe] = useState(false);
const [demoUrl, setDemoUrl] = useState<string>('');

// API keys with departments
const [apiKeys, setApiKeys] = useState<Array<{
  id: string;
  portal_domain: string;
  department_id: string;
  department_name: string;
}>>([]);
```

### 5. Компонент Iframe Dialog

```tsx
<Dialog open={showDemoIframe} onOpenChange={setShowDemoIframe}>
  <DialogContent className="max-w-4xl h-[80vh] p-0">
    <DialogHeader className="p-4 border-b">
      <DialogTitle className="flex items-center gap-2">
        <PlayCircle className="h-5 w-5" />
        Демо: {demoChatType === 'personal' ? 'Личный чат' : 'Общий чат'}
      </DialogTitle>
    </DialogHeader>
    <iframe
      src={demoUrl}
      className="w-full h-full border-0"
      title="Demo Chat"
    />
  </DialogContent>
</Dialog>
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/BitrixSessions.tsx` | Добавить демо-панель с формой и iframe dialog |

---

## Технические детали

### Загрузка API ключей

```typescript
const fetchApiKeys = async () => {
  const { data, error } = await supabase
    .from('department_api_keys')
    .select(`
      id,
      portal_domain,
      department_id,
      departments(name)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (data) {
    const keys = data.map((k: any) => ({
      id: k.id,
      portal_domain: k.portal_domain,
      department_id: k.department_id,
      department_name: k.departments?.name || 'Неизвестный'
    }));
    setApiKeys(keys);
    if (keys.length > 0) {
      setDemoPortal(keys[0].portal_domain);
    }
  }
};
```

### Открытие демо

```typescript
const openDemo = (inIframe: boolean) => {
  const baseUrl = demoChatType === 'personal' ? '/bitrix-personal' : '/bitrix-department';
  const params = new URLSearchParams({
    portal: demoPortal,
    bitrixUserId: demoUserId,
    userName: demoUserName,
    userEmail: demoUserEmail,
  });
  
  const url = `${baseUrl}?${params.toString()}`;
  
  if (inIframe) {
    setDemoUrl(url);
    setShowDemoIframe(true);
  } else {
    window.open(url, '_blank', 'width=900,height=700,resizable=yes');
  }
};
```

### UI компонент демо-панели

```tsx
<Card className="mb-6 border-primary/20 bg-primary/5">
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-lg">
      <PlayCircle className="h-5 w-5 text-primary" />
      Демо-режим тестирования
    </CardTitle>
    <CardDescription>
      Откройте чат как тестовый пользователь Bitrix24
    </CardDescription>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Portal/Department selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Портал / Отдел</label>
        <Select value={demoPortal} onValueChange={setDemoPortal}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите портал" />
          </SelectTrigger>
          <SelectContent>
            {apiKeys.map(k => (
              <SelectItem key={k.id} value={k.portal_domain}>
                {k.department_name} ({k.portal_domain})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Chat type */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Тип чата</label>
        <Select value={demoChatType} onValueChange={(v) => setDemoChatType(v as 'personal' | 'department')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Личный чат</SelectItem>
            <SelectItem value="department">Общий чат</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* User ID */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Bitrix User ID</label>
        <Input 
          value={demoUserId} 
          onChange={(e) => setDemoUserId(e.target.value)}
          placeholder="demo-123"
        />
      </div>
      
      {/* User Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Имя пользователя</label>
        <Input 
          value={demoUserName} 
          onChange={(e) => setDemoUserName(e.target.value)}
          placeholder="Тест Тестов"
        />
      </div>
      
      {/* Buttons */}
      <div className="space-y-2">
        <label className="text-sm font-medium">&nbsp;</label>
        <div className="flex gap-2">
          <Button onClick={() => openDemo(false)} disabled={!demoPortal}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Окно
          </Button>
          <Button variant="outline" onClick={() => openDemo(true)} disabled={!demoPortal}>
            <Tv className="h-4 w-4 mr-2" />
            Здесь
          </Button>
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

---

## Порядок реализации

1. Добавить импорты (PlayCircle, ExternalLink, Tv)
2. Добавить состояния для демо-режима
3. Добавить функцию загрузки API ключей
4. Добавить функцию открытия демо
5. Добавить UI карточку демо-режима
6. Добавить Dialog с iframe

---

## Ожидаемый результат

После реализации администратор сможет:
- Выбрать портал/отдел из списка зарегистрированных
- Выбрать тип чата (Личный или Общий)
- Указать тестовые данные пользователя
- Открыть чат в новом окне или прямо на странице в iframe
- Тестировать функционал без реального Bitrix24
