
# План: Эталонные ответы (Golden Responses) — "Так делай!"

## Концепция

Функция позволяет помечать ответы ассистента как **эталонные примеры**. Система запоминает эти ответы и использует их как образец стиля, структуры и качества для будущих генераций.

```text
┌─────────────────────────────────────────────────────────────────┐
│  Ответ ассистента                                               │
│  ─────────────────                                              │
│  Согласно статье 5.1 документа [1], минимальный срок...         │
│                                                                 │
│  [Копировать] [Скачать] [Обновить] [⭐ Эталон]  ← НОВАЯ КНОПКА  │
└─────────────────────────────────────────────────────────────────┘
                           ↓ Клик
┌─────────────────────────────────────────────────────────────────┐
│  ⭐ Сохранить как эталон                                        │
│  ─────────────────────────                                      │
│  Категория: [Консультация по ТЗ ▼]                              │
│  Тег: [отказы, сроки, документы]                                │
│  Заметка: "Хороший пример ответа про сроки отказов"             │
│                                                                 │
│  [Отмена] [Сохранить]                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Как это будет работать

### При генерации нового ответа:

```text
Пользователь: "Какой срок для подачи отказа?"
                    ↓
              chat-stream
                    ↓
    ┌───────────────────────────────────┐
    │ 1. RAG: найти документы           │
    │ 2. Найти релевантные эталоны      │ ← НОВОЕ
    │ 3. Сформировать промпт            │
    │ 4. Вызвать AI                     │
    └───────────────────────────────────┘
                    ↓
Промпт для AI включает секцию:

"ЭТАЛОННЫЕ ПРИМЕРЫ ОТВЕТОВ:
Вот как нужно отвечать на похожие вопросы:

Пример 1 (категория: отказы):
Вопрос: Когда можно подать отказ по ТЗ?
Ответ: Согласно статье 5.1 документа [1]...

Используй этот стиль и структуру в своём ответе."
```

---

## Архитектура данных

### Новая таблица: `golden_responses`

```sql
CREATE TABLE golden_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Связи
  role_id UUID REFERENCES chat_roles(id),      -- К какому агенту относится
  department_id UUID REFERENCES departments(id), -- Или к отделу
  
  -- Контент
  question TEXT NOT NULL,      -- Исходный вопрос пользователя
  answer TEXT NOT NULL,        -- Эталонный ответ
  
  -- Метаданные для поиска
  category TEXT,               -- Категория (отказы, сроки, документы)
  tags TEXT[] DEFAULT '{}',    -- Теги для фильтрации
  search_vector TSVECTOR,      -- Для полнотекстового поиска
  
  -- Оценка и использование
  usage_count INT DEFAULT 0,   -- Сколько раз использовался
  effectiveness_rating FLOAT,  -- Средняя оценка эффективности
  
  -- Мета
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  
  -- Источник
  source_message_id UUID,      -- ID оригинального сообщения (опционально)
  source_conversation_id UUID  -- ID диалога (опционально)
);

-- Индекс для быстрого поиска
CREATE INDEX idx_golden_responses_search ON golden_responses USING GIN(search_vector);
CREATE INDEX idx_golden_responses_role ON golden_responses(role_id) WHERE is_active = true;
CREATE INDEX idx_golden_responses_tags ON golden_responses USING GIN(tags);
```

---

## Компоненты UI

### 1. Кнопка "Эталон" в MessageActions

```typescript
// src/components/chat/MessageActions.tsx

// Новая кнопка для ответов ассистента
{role === "assistant" && onSaveAsGolden && (
  <Button
    variant="ghost"
    size="sm"
    className="h-7 px-2 text-xs"
    onClick={() => onSaveAsGolden(messageId)}
  >
    <Star className="h-3 w-3 mr-1" />
    Эталон
  </Button>
)}
```

### 2. Диалог сохранения эталона

```typescript
// src/components/chat/GoldenResponseDialog.tsx

interface GoldenResponseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  question: string;      // Предыдущее сообщение пользователя
  answer: string;        // Текущий ответ ассистента
  roleId?: string;       // Текущий агент
  onSave: (data: GoldenResponseInput) => void;
}

// Форма:
// - Категория (select из существующих + создать новую)
// - Теги (multi-select)
// - Заметка (почему этот ответ эталонный)
```

### 3. Страница управления эталонами (админка)

```typescript
// src/pages/GoldenResponses.tsx

// Таблица со всеми эталонными ответами:
// - Фильтр по агенту, категории, тегам
// - Поиск по тексту
// - Редактирование, удаление
// - Статистика использования
```

---

## Интеграция в chat-stream

### Поиск релевантных эталонов

```typescript
// В chat-stream/index.ts

// После получения role_id, перед формированием промпта:
let goldenExamples: string[] = [];

if (role_id) {
  // Поиск эталонов по похожести вопроса
  const { data: goldens } = await supabase.rpc('search_golden_responses', {
    query_text: message,
    p_role_id: role_id,
    match_count: 3,  // Макс. 3 примера
  });
  
  if (goldens && goldens.length > 0) {
    goldenExamples = goldens.map((g, i) => 
      `Пример ${i + 1}:\nВопрос: ${g.question}\nОтвет: ${g.answer}`
    );
    
    // Увеличить счётчик использования
    await supabase.rpc('increment_golden_usage', { 
      ids: goldens.map(g => g.id) 
    });
  }
}
```

### Добавление в промпт

```typescript
// Добавить секцию эталонов перед инструкциями
if (goldenExamples.length > 0) {
  contextParts.push(`
ЭТАЛОННЫЕ ПРИМЕРЫ ОТВЕТОВ:
Следующие ответы были помечены как образцовые. 
Используй их стиль, структуру и уровень детализации:

${goldenExamples.join('\n\n---\n\n')}

Применяй этот подход к своему ответу.
  `);
}
```

---

## Функции базы данных

### Поиск эталонов

```sql
CREATE FUNCTION search_golden_responses(
  query_text TEXT,
  p_role_id UUID DEFAULT NULL,
  match_count INT DEFAULT 3
) RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gr.id,
    gr.question,
    gr.answer,
    gr.category,
    ts_rank_cd(gr.search_vector, websearch_to_tsquery('russian', query_text)) as similarity
  FROM golden_responses gr
  WHERE 
    gr.is_active = true
    AND (p_role_id IS NULL OR gr.role_id = p_role_id)
    AND gr.search_vector @@ websearch_to_tsquery('russian', query_text)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

### Обновление search_vector

```sql
-- Триггер для автоматического обновления search_vector
CREATE FUNCTION update_golden_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('russian', COALESCE(NEW.question, '')), 'A') ||
    setweight(to_tsvector('russian', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('russian', array_to_string(COALESCE(NEW.tags, '{}'), ' ')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER golden_responses_search_vector_trigger
  BEFORE INSERT OR UPDATE ON golden_responses
  FOR EACH ROW EXECUTE FUNCTION update_golden_search_vector();
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/chat/MessageActions.tsx` | + кнопка "Эталон" |
| `src/components/chat/GoldenResponseDialog.tsx` | НОВЫЙ - диалог сохранения |
| `src/components/chat/ChatMessage.tsx` | + передача callback onSaveAsGolden |
| `src/pages/GoldenResponses.tsx` | НОВЫЙ - страница управления |
| `src/pages/Chat.tsx` | + логика сохранения эталона |
| `supabase/functions/chat-stream/index.ts` | + поиск и интеграция эталонов |
| Миграция БД | + таблица golden_responses + функции |

---

## RLS политики

```sql
-- Только админы могут управлять эталонами
CREATE POLICY "Admins can manage golden responses"
  ON golden_responses FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Модераторы могут просматривать
CREATE POLICY "Moderators can view golden responses"
  ON golden_responses FOR SELECT
  USING (is_admin() OR has_role(auth.uid(), 'moderator'));
```

---

## Дополнительные возможности (v2)

1. **Оценка эффективности** — после ответа с использованием эталона спрашивать "Помог ли ответ?" и обновлять рейтинг

2. **Авто-предложение** — если ответ получил высокую оценку, предлагать сохранить как эталон

3. **Версионирование** — история изменений эталонных ответов

4. **Импорт/экспорт** — загрузка эталонов из CSV/JSON

---

## Преимущества

| Аспект | Выгода |
|--------|--------|
| **Консистентность** | Все ответы будут в едином стиле |
| **Обучение** | Новые агенты сразу знают "как правильно" |
| **Качество** | Лучшие ответы используются как образец |
| **Контроль** | Бизнес определяет стандарт качества |
| **Масштабирование** | Знания передаются между сотрудниками |

