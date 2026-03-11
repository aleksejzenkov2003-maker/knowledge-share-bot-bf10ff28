

## Добавить поиск по словесному обозначению ТЗ

Сейчас быстрый поиск ищет только по номеру регистрации. Нужно добавить возможность поиска по словесному обозначению (поле `description_element` в базе).

### Изменения в `src/pages/Trademarks.tsx`

**1. Быстрый поиск — расширить логику**
- Сейчас: `query.ilike('registration_number', searchTerm%)` — только по номеру
- Нужно: если введённое значение начинается с цифры — искать по номеру, иначе — искать по `description_element` (ilike `%searchTerm%`)
- Или лучше: всегда искать через `.or()` по обоим полям: `registration_number.ilike.${term}%,description_element.ilike.%${term}%`
- Обновить placeholder: `"Поиск по номеру или обозначению ТЗ..."`

**2. Расширенный поиск — добавить поле «Обозначение»**
- Новый state `advSearchDesignation`
- Добавить Input в первую строку грида (или отдельную строку)
- Фильтр: `query.ilike('description_element', '%${adv.designation}%')`

**3. БД — индекс для поиска по description_element**
```sql
CREATE INDEX IF NOT EXISTS idx_trademarks_description_element_trgm 
  ON trademarks USING gin (description_element gin_trgm_ops);
```

**4. Список полей запроса**
- Добавить `description_element` в `LIST_FIELDS` чтобы можно было показывать обозначение в таблице

### Файлы
- `src/pages/Trademarks.tsx` — поиск, UI
- Миграция БД — индекс

