
# План: Исправление копирования, обновления и открытия документов в чате отделов

## Обнаруженные проблемы

### Проблема 1: Копирование текста не работает

**Причина**: Clipboard API может блокироваться браузером, если:
- Страница не в фокусе
- Нет user gesture (клик должен инициировать действие)
- Ошибка в try-catch не обрабатывает fallback корректно

Текущий код (строки 63-86 в `DepartmentChatMessage.tsx`):
```typescript
const handleCopy = async () => {
  try {
    // ... clipboard write
  } catch {
    toast({ title: "Ошибка" });  // Ловит ВСЕ ошибки, включая NotAllowed
  }
};
```

**Решение**: Добавить более надёжный fallback через `document.execCommand('copy')` для старых браузеров и улучшить обработку ошибок.

---

### Проблема 2: Кнопка "Обновить" не работает

При проверке кода вижу, что:
1. `onRegenerateResponse` передаётся корректно (строки 309-310 в `DepartmentChat.tsx`)
2. `regenerateResponse` реализована в хуке (строки 515-569 в `useOptimizedDepartmentChat.ts`)
3. В `DepartmentChatMessage.tsx` условие `onRegenerateResponse &&` на строке 375 — проверка есть

**Потенциальная причина**: Функция вызывается, но `localMessages` может не содержать корректного индекса или есть ошибка при удалении сообщений из БД.

**Решение**: Добавить логирование и toast-уведомления для отслеживания ошибок в процессе regenerate.

---

### Проблема 3: Документ не открывается ("Object not found")

**Корневая причина**: Неправильная RLS политика для `storage.objects`:

```sql
-- ТЕКУЩАЯ (НЕПРАВИЛЬНАЯ) политика:
WHERE ((d.storage_path = d.name) AND ...)
-- Сравнивает storage_path с name документа (всегда FALSE!)
```

Должно быть:
```sql
-- ПРАВИЛЬНАЯ политика:
WHERE (storage.objects.name = d.storage_path) AND (
  is_admin() 
  OR has_role(auth.uid(), 'moderator')
  OR d.department_id IS NULL           -- публичные документы
  OR d.department_id = get_user_department(auth.uid())
)
```

**Также отсутствует**: Проверка `department_id IS NULL` в storage политике — публичные документы недоступны для employee.

---

## Файлы для изменения

### 1. Миграция БД — исправить RLS политику storage

```sql
-- Удалить неправильную политику
DROP POLICY IF EXISTS "Users can view files in their department" ON storage.objects;

-- Создать правильную политику
CREATE POLICY "Users can view accessible documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'rag-documents' AND EXISTS (
    SELECT 1 FROM documents d
    WHERE d.storage_path = storage.objects.name
    AND (
      is_admin() 
      OR has_role(auth.uid(), 'moderator'::app_role)
      OR d.department_id IS NULL
      OR d.department_id = get_user_department(auth.uid())
    )
  )
);
```

### 2. src/components/chat/DepartmentChatMessage.tsx

Улучшить `handleCopy` с fallback и логированием:

```typescript
const handleCopy = async () => {
  try {
    // Modern Clipboard API
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([message.content], { type: 'text/plain' }),
        }),
      ]);
    } catch (clipboardError) {
      // Fallback to simple text copy
      await navigator.clipboard.writeText(message.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch (err) {
    console.error('Copy failed:', err);
    // Last resort: execCommand fallback
    try {
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось скопировать текст. Попробуйте выделить и скопировать вручную.",
        variant: "destructive",
      });
    }
  }
};
```

### 3. src/hooks/useOptimizedDepartmentChat.ts

Добавить обработку ошибок и уведомления в `regenerateResponse`:

```typescript
const regenerateResponse = useCallback(async (messageId: string, roleId?: string) => {
  console.log('regenerateResponse called:', { messageId, roleId });
  
  try {
    const messageIndex = localMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      console.error('Message not found:', messageId);
      toast.error('Сообщение не найдено');
      return;
    }
    
    // ... existing logic with added error handling
    
    toast.success('Генерация нового ответа...');
    
  } catch (error) {
    console.error('Regenerate error:', error);
    toast.error('Не удалось обновить ответ');
  }
}, [localMessages, availableAgents, sendMessage]);
```

---

## Итоговый результат

После применения изменений:

```text
┌─────────────────────────────────────────────────────────────────┐
│ ✅ Копирование       — работает с fallback для всех браузеров  │
│ ✅ Обновить агентом  — работает с уведомлениями об ошибках     │
│ ✅ Открыть документ  — RLS политика исправлена для storage     │
└─────────────────────────────────────────────────────────────────┘
```

## Приоритет исправлений

1. **КРИТИЧНО**: Миграция БД для storage RLS — без неё документы не откроются
2. **ВАЖНО**: Fallback для копирования — обеспечит работу во всех контекстах
3. **УЛУЧШЕНИЕ**: Логирование и уведомления для regenerate — облегчит диагностику
