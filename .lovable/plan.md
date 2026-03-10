

## Исправление фильтра «Обновлены с ФИПС»

### Корневая причина

Сетевой запрос показывает ошибку **statement timeout** (код 57014). PostgREST не может использовать функциональный индекс на JSONB при фильтрации через `metadata->fips_updated_at`. Запрос делает full table scan на 1.1M записей и не укладывается в таймаут.

### Решение

Добавить boolean-колонку `fips_updated` прямо в таблицу `trademarks` — простой, индексируемый фильтр вместо JSONB.

**1. Миграция**
```sql
-- Добавить колонку
ALTER TABLE trademarks ADD COLUMN fips_updated boolean NOT NULL DEFAULT false;

-- Проставить значение для существующих записей
UPDATE trademarks SET fips_updated = true 
WHERE metadata->>'fips_updated_at' IS NOT NULL;

-- Индекс для быстрой фильтрации
CREATE INDEX idx_trademarks_fips_updated ON trademarks (fips_updated) WHERE fips_updated = true;
```

**2. `src/pages/Trademarks.tsx`**
- Добавить `fips_updated` в `LIST_FIELDS`
- Заменить фильтры:
  - `fips_updated`: `query.eq('fips_updated', true)`
  - `not_updated`: `query.eq('fips_updated', false)`
- Обновить отображение бейджа ФИПС: использовать `fips_updated` вместо проверки `metadata?.fips_updated_at`

**3. Код сохранения ФИПС-данных** — при обновлении из ФИПС также ставить `fips_updated = true` (найти место где записывается `metadata.fips_updated_at` и добавить `fips_updated: true`).

