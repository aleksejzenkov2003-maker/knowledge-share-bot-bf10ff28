
# План: Исправление поиска документов в Bitrix-чатах

## Обнаруженная проблема

При клике на источник в Bitrix-чате появляется ошибка "Документ не найден", хотя документ существует в базе данных.

**Причина:** Некорректный синтаксис PostgREST фильтра `.or()`. Значения, содержащие специальные символы (пробелы, кириллица), должны быть заключены в двойные кавычки.

### Текущий (неработающий) синтаксис

```typescript
// Edge Function
.or(`name.eq.${name},name.ilike.%${baseName}%,file_name.ilike.%${baseName}%`)

// Frontend (SourcesPanel)
.or(`name.ilike.%${baseName}%,file_name.ilike.%${baseName}%`)
```

При имени документа "Правила возраж в ППС" PostgREST интерпретирует пробелы как разделители, что приводит к ошибке парсинга.

### Требуемый синтаксис

```typescript
// Правильно - значения в кавычках
.or(`name.eq."${name}",name.ilike."%${baseName}%",file_name.ilike."%${baseName}%"`)
```

---

## Детальные изменения

### 1. Edge Function: Исправить handleDocumentSearch

**Файл:** `supabase/functions/bitrix-chat-api/index.ts`  
**Строка:** ~2254

**Было:**
```typescript
const { data: docs, error } = await supabase
  .from('documents')
  .select('id, storage_path, name, file_name')
  .or(`name.eq.${name},name.ilike.%${baseName}%,file_name.ilike.%${baseName}%`)
  .eq('status', 'ready')
  .limit(10);
```

**Станет:**
```typescript
const { data: docs, error } = await supabase
  .from('documents')
  .select('id, storage_path, name, file_name')
  .or(`name.eq."${name}",name.ilike."%${baseName}%",file_name.ilike."%${baseName}%"`)
  .eq('status', 'ready')
  .limit(10);
```

### 2. Frontend: Исправить SourcesPanel (для админки)

**Файл:** `src/components/chat/SourcesPanel.tsx`  
**Строка:** ~217

**Было:**
```typescript
const { data: partialData } = await supabase
  .from('documents')
  .select('id, storage_path, name, file_name')
  .or(`name.ilike.%${baseName}%,file_name.ilike.%${baseName}%`)
  .limit(5);
```

**Станет:**
```typescript
const { data: partialData } = await supabase
  .from('documents')
  .select('id, storage_path, name, file_name')
  .or(`name.ilike."%${baseName}%",file_name.ilike."%${baseName}%"`)
  .limit(5);
```

---

## Порядок реализации

1. Исправить синтаксис `.or()` в `handleDocumentSearch` (Edge Function)
2. Исправить синтаксис `.or()` в `SourcesPanel` (Frontend)
3. Деплой Edge Function `bitrix-chat-api`
4. Протестировать открытие документов в Bitrix-чате и админке

---

## Техническое пояснение

PostgREST использует запятую как разделитель условий в `.or()`. Когда значение содержит специальные символы, оно должно быть заключено в двойные кавычки:

```text
❌ name.eq.Правила возраж в ППС   → парсится как несколько токенов
✓ name.eq."Правила возраж в ППС" → парсится как одно значение
```

Документация: https://postgrest.org/en/stable/references/api/resource_embedding.html#reserved-characters

---

## Ожидаемый результат

После исправления:
- Клик на источник в Bitrix-чате откроет DocumentViewer с PDF
- Поиск и подсветка цитаты будут работать
- Функциональность идентична админке
