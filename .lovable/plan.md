

## Ускорение загрузки и поиска базы товарных знаков (1.1M записей)

### Проблемы

1. **`select('*')` в списке** — загружает все ~35 колонок для каждой строки, когда в таблице отображается только 7 полей
2. **`ilike %...%` поиск** — на 1.1M записей `%prefix%` паттерн не использует btree-индексы; trigram-индекс есть только на `right_holder_name`
3. **Нет индекса на `created_at`** — сортировка по умолчанию без индекса сканирует всю таблицу
4. **Два отдельных запроса** (данные + count) на каждую страницу
5. **JSONB фильтр** (`metadata->fips_updated_at`) без индекса

### План исправлений

**1. Миграция — добавить недостающие индексы**
```sql
-- Индекс для сортировки по created_at (основной листинг)
CREATE INDEX idx_trademarks_created_at_desc ON trademarks (created_at DESC);

-- Trigram индексы для ilike-поиска по ИНН/ОГРН/рег.номеру
CREATE INDEX idx_trademarks_reg_number_trgm ON trademarks USING gin (registration_number gin_trgm_ops);
CREATE INDEX idx_trademarks_inn_trgm ON trademarks USING gin (right_holder_inn gin_trgm_ops);
CREATE INDEX idx_trademarks_ogrn_trgm ON trademarks USING gin (right_holder_ogrn gin_trgm_ops);

-- Индекс для JSONB-фильтра по ФИПС
CREATE INDEX idx_trademarks_fips_updated ON trademarks ((metadata->>'fips_updated_at')) WHERE metadata->>'fips_updated_at' IS NOT NULL;
```

**2. `src/pages/Trademarks.tsx` — оптимизация запросов**

- Заменить `select('*')` на `select('id, registration_number, right_holder_name, right_holder_inn, right_holder_ogrn, registration_date, actual, metadata, created_at')` — только нужные для таблицы поля
- Объединить запрос данных и count в один через `{ count: 'exact' }` вместо двух отдельных запросов
- Убрать `select('*')` из `onClick` строки таблицы — использовать данные из списка, загружать полные данные только при открытии detail-диалога (ленивая загрузка)

