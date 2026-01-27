
# План: Исправление авторизации и доступа к агентам в демо-режиме Bitrix-чатов

## Обнаруженные проблемы

### Проблема 1: Игнорирование `department_id` при демо-авторизации
**Причина:** В функции `handleAuth` (строки 464-491) если пользователь уже существует с `department_id` в профиле, система **всегда** использует сохранённый `department_id`, игнорируя переданный `explicitDepartmentId`.

**Лог показывает:**
```
[AUTH] User already has department_id: 880d183f-a900-420b-917f-cb40972787fe
```
Но запрос содержит другой `department_id: "c5e7b85c-0040-47b0-9f54-e4ef3001cd52"`.

### Проблема 2: Нет агентов для отдела "Патенты"
Данные показывают, что все агенты (`chat_roles`) привязаны к department_ids:
- `c5e7b85c-0040-47b0-9f54-e4ef3001cd52` (Товарные знаки)
- `31edb6ea-889c-4205-8fa7-f0e0bfc5570e` (Юридический)

Но **НИ ОДИН агент не имеет** `880d183f-a900-420b-917f-cb40972787fe` (Патенты) в своём `department_ids`.

### Проблема 3: Создание диалога не работает
Это следствие проблемы 1 - неверный `department_id` в JWT токене влияет на все последующие запросы.

---

## Решение

### Изменение 1: Приоритет `explicitDepartmentId` в авторизации

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`
**Функция:** `handleAuth` (строки 464-491)

Логика должна быть изменена:

```
Текущая логика:
1. Если пользователь существует с department_id → использовать его
2. Иначе → искать по API key

Новая логика:
1. Если передан explicitDepartmentId (демо-режим) → использовать его
2. Иначе если пользователь существует с department_id → использовать его
3. Иначе → искать по API key
```

**Изменения в коде:**

```typescript
// STEP 0: If explicit department_id passed (demo/admin mode), prioritize it
if (explicitDepartmentId) {
  console.log('[AUTH] Explicit department_id requested (demo mode):', explicitDepartmentId);
  
  // Verify this department exists and has API key for the portal
  const { data: apiKeyData } = await supabase
    .from('department_api_keys')
    .select('id, department_id, request_count')
    .eq('portal_domain', normalizedPortal)
    .eq('department_id', explicitDepartmentId)
    .eq('is_active', true)
    .maybeSingle();

  if (apiKeyData) {
    departmentId = explicitDepartmentId;
    apiKeyId = apiKeyData.id;
    console.log('[AUTH] Using explicit department_id:', departmentId);
    
    // Update usage stats
    await supabase
      .from('department_api_keys')
      .update({ 
        last_used_at: new Date().toISOString(),
        request_count: (apiKeyData.request_count || 0) + 1
      })
      .eq('id', apiKeyData.id);
  } else {
    console.log('[AUTH] Explicit department not found for this portal, will try fallback');
  }
}

// STEP 1: If no explicit department set, check existing user
if (!departmentId && existingProfile?.department_id) {
  // ... existing logic
}

// STEP 2: If still no department - find API key by portal
if (!departmentId) {
  // ... existing logic
}
```

### Изменение 2: Добавить агента "Поисковик" для отдела "Патенты"

Нужно обновить один из существующих агентов или добавить новый для отдела "Патенты" (`880d183f-a900-420b-917f-cb40972787fe`).

Агент "Поисковик" уже имеет все 4 отдела включая Патенты:
```
department_ids:[31edb6ea-889c-4205-8fa7-f0e0bfc5570e, c5e7b85c-0040-47b0-9f54-e4ef3001cd52, ed0822ad-e656-4162-b1c6-a0a992ab29e1, 880d183f-a900-420b-917f-cb40972787fe]
```

Но другие агенты (Юрист, МКТУ, ТЗ консультант) **не имеют** Патенты в списке.

**Действие:** Добавить Патенты в department_ids для агентов, которые должны быть доступны в этом отделе, ИЛИ создать специфических агентов для Патентов.

---

## Детальные изменения кода

### Файл: `supabase/functions/bitrix-chat-api/index.ts`

**Строки 460-491 → Заменить на:**

```typescript
  let departmentId: string | null = null;
  let apiKeyId: string | null = null;
  let isUserDepartmentDetected = false;

  // STEP 0: If explicit department_id passed (demo/admin mode), prioritize it
  if (explicitDepartmentId) {
    console.log('[AUTH] Explicit department_id requested (demo mode):', explicitDepartmentId);
    
    // Verify this department exists and has API key for the portal
    const { data: apiKeyData } = await supabase
      .from('department_api_keys')
      .select('id, department_id, request_count')
      .eq('portal_domain', normalizedPortal)
      .eq('department_id', explicitDepartmentId)
      .eq('is_active', true)
      .maybeSingle();

    if (apiKeyData) {
      departmentId = explicitDepartmentId;
      apiKeyId = apiKeyData.id;
      isUserDepartmentDetected = true;
      console.log('[AUTH] Using explicit department_id:', departmentId);
      
      // Update usage stats
      await supabase
        .from('department_api_keys')
        .update({ 
          last_used_at: new Date().toISOString(),
          request_count: (apiKeyData.request_count || 0) + 1
        })
        .eq('id', apiKeyData.id);
    } else {
      console.log('[AUTH] Explicit department not found for this portal, will try user profile or fallback');
    }
  }

  // STEP 1: If no explicit department set, check existing user's department
  if (!departmentId && existingProfile?.department_id) {
    console.log('[AUTH] User already has department_id:', existingProfile.department_id);
    departmentId = existingProfile.department_id;
    isUserDepartmentDetected = true;

    // Verify this portal has an API key for this department
    const { data: apiKeyForDept } = await supabase
      .from('department_api_keys')
      .select('id, request_count')
      .eq('portal_domain', normalizedPortal)
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .maybeSingle();

    if (apiKeyForDept) {
      apiKeyId = apiKeyForDept.id;
      // Update usage stats
      await supabase
        .from('department_api_keys')
        .update({ 
          last_used_at: new Date().toISOString(),
          request_count: (apiKeyForDept.request_count || 0) + 1
        })
        .eq('id', apiKeyForDept.id);
    }
  }

  // STEP 2: If user doesn't have department - find API key by portal (legacy flow / first login)
  if (!departmentId) {
    // ... keep existing STEP 2 logic unchanged
  }
```

---

## Порядок реализации

1. **Edge Function:** Изменить `handleAuth` - дать приоритет `explicitDepartmentId`
2. **Deploy Edge Function**
3. **Тестирование** демо-режима - проверить что переключение отделов работает

---

## Ожидаемый результат

После исправления:
- При выборе отдела в демо-режиме JWT будет содержать выбранный `department_id`
- Агенты будут загружаться для правильного отдела
- Создание диалогов будет работать
- Администратор сможет тестировать любой отдел без пересоздания пользователя

---

## Примечание: Отсутствие агентов для "Патенты"

Если после исправления агенты всё равно не появляются для отдела "Патенты" - это означает, что в `chat_roles` нет агентов с `department_ids` содержащим `880d183f-a900-420b-917f-cb40972787fe`.

Решение: Добавить этот отдел в `department_ids` нужных агентов через админ-панель (страница ChatRoles).
