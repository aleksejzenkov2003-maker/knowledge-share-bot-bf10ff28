

## Правки по базе ТЗ

На основе скриншотов — три группы изменений:

### 1. Новые поля в расширенном поиске
- **Иностранный правообладатель** (`foreign_right_holder_name`, ilike)
- **Адрес для переписки** (`correspondence_address`, ilike)
- **Дата общеизвестности** (`well_known_trademark_date`, eq — точная дата)

### 2. Карточка ТЗ (Detail Dialog)
- Убрать заголовки секций «Основная информация», «Дополнительно», «Публикация»
- Ссылки ФИПС/Публикация вынести наверх рядом с бейджем, без отдельной секции
- Добавить **адрес правообладателя** (`right_holder_address`) в блок «Правообладатель»
- Добавить **код страны** (`right_holder_country_code`) — уже есть, ок
- Формат всех дат поменять на `DD.MM.YYYY` (без времени)
- Добавить визуальные разделители (`Separator` или `border-t`) и больше отступов между блоками

### 3. Файлы
**`src/pages/Trademarks.tsx`**:
- Добавить 3 новых state для расширенного поиска + обновить `appliedAdvSearch`, `handleAdvancedSearch`, `handleAdvancedReset`
- В `applyFilters` добавить фильтры для новых полей
- В UI расширенного поиска — 3 новых Input'а
- В Detail Dialog — убрать заголовки секций, переструктурировать, формат дат `DD.MM.YYYY`, разделители

**БД**: Индексы для новых полей поиска:
```sql
CREATE INDEX IF NOT EXISTS idx_trademarks_foreign_holder_trgm 
  ON trademarks USING gin (foreign_right_holder_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trademarks_corr_address_trgm 
  ON trademarks USING gin (correspondence_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trademarks_well_known_date 
  ON trademarks (well_known_trademark_date) WHERE well_known_trademark_date IS NOT NULL;
```

