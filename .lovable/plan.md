

## Поиск по отдельным параметрам в Базе ТЗ

### Проблема
Текущий единый поиск использует `ILIKE %term%` по 4 полям одновременно, что дает слишком широкие результаты: «Родина» находит «Бородина», «Казань» тащит все адреса с этим словом вперемешку с названиями.

### Решение
Заменить одно поле поиска на расширяемую панель с поиском по конкретным полям. Каждое поле ищет точно по своей колонке.

### UI

Над таблицей — раскрывающаяся панель «Расширенный поиск» (Collapsible). Внутри — сетка полей:

```text
┌─────────────────────────────────────────────────────────┐
│ [Быстрый поиск по номеру ТЗ...        ] [Статус ▼]     │
│ ▸ Расширенный поиск                                     │
├─────────────────────────────────────────────────────────┤
│  Правообладатель: [________]   Адрес: [________]        │
│  ИНН:             [________]   ОГРН:  [________]        │
│  Номер ТЗ:        [________]                            │
│                              [Сбросить] [Найти]         │
└─────────────────────────────────────────────────────────┘
```

### Логика поиска

- Быстрый поиск (верхнее поле) — **только по `registration_number`** с точным префиксным совпадением (`ilike.term%`), без расширенного поиска по всем полям
- Расширенный поиск — каждое поле фильтрует по своей колонке:
  - Правообладатель → `right_holder_name.ilike.%term%`
  - Адрес → `right_holder_address.ilike.%term%`
  - ИНН → `right_holder_inn.eq.term` (точное совпадение)
  - ОГРН → `right_holder_ogrn.eq.term` (точное совпадение)
  - Номер ТЗ → `registration_number.eq.term` (точное совпадение)
- Все фильтры применяются через AND (пересечение)
- ИНН и ОГРН ищутся по точному совпадению (`.eq`), не по `ilike`

### Изменения в файлах

**`src/pages/Trademarks.tsx`**:
1. Добавить состояния для каждого поля расширенного поиска: `searchName`, `searchAddress`, `searchInn`, `searchOgrn`, `searchRegNumber`
2. Добавить `advancedOpen` state для раскрытия панели
3. Переписать `applyFilters` — каждое непустое поле добавляет свой `.ilike` / `.eq` фильтр через AND
4. Изменить быстрый поиск: только `registration_number.ilike.term%` (префикс)
5. Добавить UI с `Collapsible` для расширенного поиска
6. Добавить `LIST_FIELDS` — включить `right_holder_address` для возможного отображения
7. Кнопки «Найти» и «Сбросить» для расширенного поиска

**БД**: Создать индексы для новых полей поиска:
```sql
CREATE INDEX idx_trademarks_holder_name_trgm ON trademarks 
  USING gin (right_holder_name gin_trgm_ops);
CREATE INDEX idx_trademarks_holder_address_trgm ON trademarks 
  USING gin (right_holder_address gin_trgm_ops);
CREATE INDEX idx_trademarks_inn ON trademarks (right_holder_inn) 
  WHERE right_holder_inn IS NOT NULL;
CREATE INDEX idx_trademarks_ogrn ON trademarks (right_holder_ogrn) 
  WHERE right_holder_ogrn IS NOT NULL;
```

