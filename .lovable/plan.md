

# Исправление копирования и удаления документов

## Корневая причина

Функция `copyDocumentToFolder` (строка 1266 в Documents.tsx) создает новую запись документа, но:
1. **Переиспользует `storage_path`** оригинала вместо копирования файла в Storage
2. **Сохраняет `parent_document_id`** оригинала, привязывая копию к родительской группе исходной папки

В результате:
- Все 14 документов (7 в МКТУ + 7 в Тест RAG) ссылаются на один `parent_document_id` = `504b529c` и на одни и те же файлы в Storage
- Удаление одного документа удаляет файл из Storage, ломая другой
- DocumentTree показывает все 14 как одну группу

## Текущее состояние данных

- 7 пар документов с общими `storage_path` между МКТУ и Тест RAG
- Все 14 дочерних документов привязаны к одному parent в МКТУ

## План исправления

### 1. Миграция данных: разъединить + удалить лишние

SQL-скрипт через insert tool:
- Для 7 документов в папке "Тест RAG" (`folder_id = f281a285-...`): обнулить `parent_document_id`, чтобы они стали независимой группой
- Удалить дубликаты, если в одной папке по 2 записи с одинаковым part_number (сейчас таких нет — дубли разнесены по папкам, так что удалять не нужно)

### 2. Исправить `copyDocumentToFolder` (Documents.tsx)

**Копирование файла в Storage:**
```
// Вместо: storage_path: srcDoc.storage_path
// Сделать: скопировать файл в Storage с новым путём
const newStoragePath = `${Date.now()}-copy-${sanitizedName}`;
// Скачать blob из srcDoc.storage_path → загрузить по newStoragePath
```

**Новая цепочка parent_document_id:**
- При копировании группы: первый скопированный документ становится новым parent
- Остальные копии ссылаются на него как parent_document_id

### 3. Исправить `handleMoveOrCopyConfirm` для групп

Текущий код копирует только `moveTargetGroup.documents`, но не `parentDocument`. Нужно:
- Копировать и parent document (если есть)
- Выстраивать новую parent-child цепочку для копий

### 4. Безопасное удаление (Documents.tsx + useFolderOperations.ts)

Перед удалением файла из Storage проверять, что на этот `storage_path` нет других документов:
```sql
SELECT count(*) FROM documents WHERE storage_path = $1 AND id != $2
```
Если есть — не удалять файл из Storage, только запись из БД.

### Файлы для изменения

- `src/pages/Documents.tsx` — `copyDocumentToFolder`, `handleMoveOrCopyConfirm`, `handleDelete`, `confirmDeleteGroup`
- `src/hooks/useFolderOperations.ts` — `clearFolder`, `deleteAllErrors` (проверка shared storage_path)
- SQL через insert tool — разъединить существующие данные

