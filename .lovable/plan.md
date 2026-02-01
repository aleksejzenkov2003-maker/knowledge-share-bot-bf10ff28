
# План: Управление базой знаний — Очистка и перезагрузка

## Обзор

Добавление функций массового управления документами и папками: удаление всех документов из папки, полная очистка папки с перезагрузкой, удаление всех документов с ошибками, и визуализация статистики по папкам.

---

## Текущее состояние

| Элемент | Статус |
|---------|--------|
| Документов в базе | 111 |
| Чанков | 7906 |
| Папок | 8 |
| CASCADE на document_chunks | Включён (удаление документа удаляет чанки) |
| CASCADE на parent_document | Включён (удаление родителя удаляет части) |

---

## Предлагаемый функционал

### 1. Массовое удаление документов из папки

```text
┌─────────────────────────────────────────────────────────────────┐
│ 📁 Практика ППС -1-1483                                         │
│    99 документов • 5,234 чанков • 156.2 MB                      │
│                                                                 │
│    [🗑️ Очистить папку] [🔄 Перезагрузить все] [⚙️ Настройки]     │
└─────────────────────────────────────────────────────────────────┘
```

**Кнопка "Очистить папку":**
- Удаляет ВСЕ документы из выбранной папки
- Автоматически удаляет чанки (CASCADE)
- Удаляет файлы из Storage
- Подтверждение с указанием количества удаляемых документов

### 2. Перезагрузка документов папки

```text
┌─────────────────────────────────────────────────────────────────┐
│  🔄 Переобработать документы                                    │
│  ─────────────────────────────                                  │
│  Выберите действие:                                             │
│                                                                 │
│  ○ Переиндексировать все (сохранить файлы, пересоздать чанки)   │
│  ○ Только документы с ошибками (3 шт.)                          │
│  ○ Только обработанные давно (старше 30 дней)                   │
│                                                                 │
│  [Отмена] [Запустить]                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Логика переобработки:**
1. Удалить только чанки (`DELETE FROM document_chunks WHERE document_id IN (...)`)
2. Сбросить статус на `pending`
3. Запустить `process-document` для каждого документа

### 3. Удаление документов с ошибками

Быстрое действие для очистки всех документов со статусом `error`:

```typescript
// Удаление всех документов с ошибками
const deleteErrorDocuments = async () => {
  const { data: errorDocs } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('status', 'error');
  
  // Удалить файлы из storage
  const storagePaths = errorDocs.map(d => d.storage_path).filter(Boolean);
  await supabase.storage.from('rag-documents').remove(storagePaths);
  
  // Удалить записи (каскадно удалит чанки)
  await supabase.from('documents').delete().eq('status', 'error');
};
```

### 4. Статистика папки

Добавить в UI отображение:
- Количество документов
- Количество чанков
- Общий размер файлов
- Количество документов с ошибками

---

## Новые компоненты UI

### FolderActionsMenu (Dropdown для папки)

```typescript
// src/components/documents/FolderActionsMenu.tsx

interface FolderActionsMenuProps {
  folderId: string;
  folderName: string;
  documentCount: number;
  onClearFolder: () => void;
  onReprocessAll: () => void;
  onDeleteErrors: () => void;
}
```

Действия:
- 🗑️ Очистить папку (удалить все документы)
- 🔄 Переобработать все документы
- ⚠️ Удалить документы с ошибками
- 📊 Показать статистику

### BulkDeleteDialog (Подтверждение массового удаления)

```typescript
// src/components/documents/BulkDeleteDialog.tsx

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  totalSize: string;
  onConfirm: () => void;
  isDeleting: boolean;
}
```

### ReprocessDialog (Настройки переобработки)

```typescript
// src/components/documents/ReprocessDialog.tsx

type ReprocessMode = 'all' | 'errors' | 'old';

interface ReprocessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  documentCount: number;
  errorCount: number;
  onReprocess: (mode: ReprocessMode) => void;
  isProcessing: boolean;
}
```

---

## Изменения в Documents.tsx

### Новые функции

```typescript
// Статистика папки
const getFolderStats = async (folderId: string) => {
  const { data } = await supabase
    .from('documents')
    .select('id, file_size, status, chunk_count')
    .eq('folder_id', folderId);
  
  return {
    documentCount: data?.length || 0,
    totalSize: data?.reduce((sum, d) => sum + (d.file_size || 0), 0) || 0,
    chunkCount: data?.reduce((sum, d) => sum + (d.chunk_count || 0), 0) || 0,
    errorCount: data?.filter(d => d.status === 'error').length || 0,
  };
};

// Очистка папки
const handleClearFolder = async (folderId: string) => {
  // 1. Получить все документы папки
  const { data: docs } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('folder_id', folderId);
  
  if (!docs || docs.length === 0) return;
  
  // 2. Удалить файлы из Storage
  const storagePaths = docs.map(d => d.storage_path).filter(Boolean);
  if (storagePaths.length > 0) {
    await supabase.storage.from('rag-documents').remove(storagePaths);
  }
  
  // 3. Удалить записи (CASCADE удалит чанки)
  await supabase.from('documents').delete().eq('folder_id', folderId);
};

// Переобработка документов
const handleReprocessFolder = async (folderId: string, mode: 'all' | 'errors') => {
  let query = supabase.from('documents').select('id').eq('folder_id', folderId);
  
  if (mode === 'errors') {
    query = query.eq('status', 'error');
  }
  
  const { data: docs } = await query;
  
  for (const doc of docs) {
    // Удалить существующие чанки
    await supabase.from('document_chunks').delete().eq('document_id', doc.id);
    
    // Сбросить статус
    await supabase.from('documents').update({ status: 'pending', chunk_count: 0 }).eq('id', doc.id);
    
    // Запустить обработку
    await supabase.functions.invoke('process-document', {
      body: { document_id: doc.id }
    });
  }
};
```

---

## Обновление UI папок

### Добавить статистику в список папок (Folders.tsx)

```text
┌─────────────────────────────────────────────────────────────────┐
│ 📁 Практика ППС -1-1483                          [⋮] Меню       │
│    Судебные решения • 99 документов • 5,234 чанков              │
│    ⚠️ 3 с ошибками • 156.2 MB                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Dropdown меню папки

```text
┌────────────────────────────┐
│ 📄 Открыть документы       │
│ ─────────────────────────  │
│ 🔄 Переобработать все      │
│ ⚠️ Исправить ошибки (3)    │
│ ─────────────────────────  │
│ 🗑️ Очистить папку          │
│ ❌ Удалить папку           │
└────────────────────────────┘
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/Documents.tsx` | + массовые операции, + статистика |
| `src/pages/Folders.tsx` | + меню папок, + статистика |
| `src/components/documents/FolderActionsMenu.tsx` | НОВЫЙ - dropdown с действиями |
| `src/components/documents/BulkDeleteDialog.tsx` | НОВЫЙ - подтверждение удаления |
| `src/components/documents/ReprocessDialog.tsx` | НОВЫЙ - настройки переобработки |

---

## Безопасность

### Подтверждения

Все деструктивные операции требуют двойного подтверждения:
1. Первичный клик открывает диалог с информацией
2. Диалог показывает точное количество затрагиваемых данных
3. Кнопка подтверждения требует ввода текста "УДАЛИТЬ" для папок >50 документов

### RLS

Существующие политики уже ограничивают доступ:
- Только админы могут удалять документы
- Только админы могут управлять папками

---

## UI/UX улучшения

### Progress индикатор для массовых операций

```text
┌─────────────────────────────────────────────────────────────────┐
│  🔄 Переобработка документов                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░  67%     │
│  Обработано: 67 из 99 документов                                │
│  Создано чанков: 4,521                                          │
│                                                                 │
│  [Отмена]                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Toast уведомления

```typescript
toast.success(`Удалено ${count} документов и ${chunkCount} чанков`);
toast.info(`Переобработка ${count} документов запущена`);
toast.warning(`Не удалось обработать ${errorCount} документов`);
```

---

## Дополнительно (v2)

1. **Экспорт документов** — скачать все файлы папки как ZIP
2. **Импорт папки** — массовая загрузка из ZIP архива
3. **Расписание переобработки** — автоматическая переиндексация по расписанию
4. **История изменений** — лог всех операций с документами

---

## Примерный порядок реализации

1. **Сначала:** Добавить статистику папок в UI
2. **Затем:** Реализовать массовое удаление с подтверждением
3. **Потом:** Добавить переобработку документов
4. **Финально:** Интегрировать меню в Folders.tsx
