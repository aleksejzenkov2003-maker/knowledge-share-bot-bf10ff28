

# План: Постоянная авторизация в Bitrix24 (без повторных входов)

## Проблема

Сейчас при каждом открытии приложения в Bitrix24 происходит **новая авторизация**, что создаёт неудобства:

| Проблема | Причина |
|----------|---------|
| JWT токен хранится в `sessionStorage` | Очищается при закрытии вкладки |
| JWT токен истекает через 1 час | `expiresIn = 3600` секунд |
| Нет механизма восстановления сессии | Каждое открытие iframe = новый `/auth` запрос |
| В БД накапливаются дублирующиеся сессии | Нет переиспользования существующих сессий |

## Решение

Реализовать **долгосрочную сессию** с использованием:

1. **localStorage** вместо sessionStorage для хранения токена (сохраняется между сессиями)
2. **Длинный JWT** (7 дней) с автоматическим обновлением
3. **Refresh-токен механизм** на бэкенде
4. **Восстановление сессии** при открытии приложения

## Архитектура

```text
┌─────────────────────────────────────────────────────────────────┐
│                        BITRIX24 IFRAME                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. При загрузке:                                              │
│     localStorage.getItem('bitrix_token_{portal}_{userId}')     │
│                                                                 │
│  2. Если токен есть и не просрочен:                            │
│     → Проверить через GET /me                                  │
│     → Если 401 → Refresh или новый auth                        │
│                                                                 │
│  3. Если токен близок к истечению (< 1 час):                   │
│     → POST /auth/refresh → Новый токен                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EDGE FUNCTION: bitrix-chat-api                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /auth                                                     │
│  - Создаёт JWT на 7 дней                                       │
│  - Сохраняет bitrix_sessions                                   │
│                                                                 │
│  POST /auth/refresh (НОВЫЙ)                                    │
│  - Проверяет старый токен                                      │
│  - Выдаёт новый JWT на 7 дней                                  │
│  - Обновляет bitrix_sessions                                   │
│                                                                 │
│  GET /me                                                        │
│  - Проверяет валидность токена                                 │
│  - Обновляет last_activity_at                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Изменения

### 1. Backend: Edge Function `bitrix-chat-api/index.ts`

**Увеличить время жизни токена:**
```typescript
// Было: 1 час
const expiresIn = 3600;

// Станет: 7 дней
const expiresIn = 7 * 24 * 3600; // 604800 секунд
```

**Добавить endpoint `/auth/refresh`:**
```typescript
// Новый обработчик для обновления токена
if (path === 'auth/refresh' && req.method === 'POST') {
  return await handleRefreshToken(req, supabase, jwtSecret);
}

async function handleRefreshToken(req, supabase, jwtSecret) {
  // 1. Получить старый токен из Authorization header
  // 2. Валидировать JWT (даже если истёк - проверить подпись)
  // 3. Проверить сессию в БД
  // 4. Выдать новый JWT на 7 дней
  // 5. Обновить запись в bitrix_sessions
}
```

### 2. Frontend: BitrixPersonalChat.tsx

**Сохранять токен в localStorage:**
```typescript
const authStorageKey = `bitrix_auth_${portal}_${bitrixUserId}`;

useEffect(() => {
  const authenticate = async () => {
    // 1. Попробовать восстановить токен из localStorage
    const stored = localStorage.getItem(authStorageKey);
    if (stored) {
      const { token, expiresAt } = JSON.parse(stored);
      
      // Проверить валидность через /me
      const meRes = await fetch(`${apiBaseUrl}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (meRes.ok) {
        setToken(token);
        
        // Если осталось < 1 часа - обновить токен фоном
        if (expiresAt - Date.now() < 3600000) {
          refreshToken(token);
        }
        return;
      }
      
      // Токен невалиден - очистить
      localStorage.removeItem(authStorageKey);
    }
    
    // 2. Новая авторизация
    const response = await fetch(`${apiBaseUrl}/auth`, ...);
    const data = await response.json();
    
    // 3. Сохранить в localStorage
    localStorage.setItem(authStorageKey, JSON.stringify({
      token: data.token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      user: data.user
    }));
    
    setToken(data.token);
  };
}, []);
```

### 3. Frontend: BitrixDepartmentChat.tsx

Аналогичные изменения для корпоративного чата.

### 4. Frontend: BitrixChatSecure.tsx

Обновить существующую логику:
- Заменить `sessionStorage` на `localStorage`
- Увеличить время валидности кеша
- Добавить фоновое обновление токена

---

## Детали реализации

### Структура хранения в localStorage

```typescript
interface StoredAuth {
  token: string;
  expiresAt: number;      // timestamp миллисекунды
  user: {
    user_id: string;
    full_name: string;
    department_id: string;
    role: string;
  };
  savedAt: number;        // timestamp сохранения
}
```

### Ключ хранения

```typescript
// Уникальный для каждого пользователя на каждом портале
const authStorageKey = `bitrix_auth_v2_${portal}_${bitrixUserId}`;
```

### Фоновое обновление токена

```typescript
const refreshToken = async (currentToken: string) => {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem(authStorageKey, JSON.stringify({
        token: data.token,
        expiresAt: Date.now() + (data.expires_in * 1000),
        user: data.user,
        savedAt: Date.now()
      }));
      setToken(data.token);
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
};
```

---

## Порядок выполнения

1. **Backend**: Увеличить `expiresIn` в `/auth` до 7 дней
2. **Backend**: Добавить endpoint `/auth/refresh`
3. **Frontend**: Обновить `BitrixPersonalChat.tsx` - localStorage + восстановление
4. **Frontend**: Обновить `BitrixDepartmentChat.tsx` - аналогично
5. **Frontend**: Обновить `BitrixChatSecure.tsx` - заменить sessionStorage на localStorage
6. **Deploy**: Развернуть обновлённый edge function

---

## Безопасность

| Аспект | Решение |
|--------|---------|
| Кража токена | Токен привязан к `bitrix_user_id` + `portal` - бесполезен для других |
| XSS | localStorage уязвим, но токен короткоживущий относительно (7 дней) |
| CSRF | Токен передаётся в Authorization header, не в cookies |
| Сессия в БД | Можно отозвать через удаление записи в `bitrix_sessions` |

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/bitrix-chat-api/index.ts` | +`/auth/refresh`, увеличить TTL токена |
| `src/pages/BitrixPersonalChat.tsx` | localStorage, восстановление сессии |
| `src/pages/BitrixDepartmentChat.tsx` | localStorage, восстановление сессии |
| `src/pages/BitrixChatSecure.tsx` | Заменить sessionStorage на localStorage |

