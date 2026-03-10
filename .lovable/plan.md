

## Исправление фильтра «Обновлены с ФИПС»

### Проблема

В базе есть 4 записи с `metadata->>'fips_updated_at' IS NOT NULL`, но Supabase JS клиент некорректно формирует PostgREST запрос при использовании `.not('metadata->fips_updated_at', 'is', null)` — оператор `->` в имени колонки не поддерживается методами `.not()` и `.or()`.

### Решение

Заменить `.not()` / `.or()` на `.filter()`, который передает сырой PostgREST синтаксис напрямую:

**`src/pages/Trademarks.tsx`**, строки 226-229:

```typescript
// Было:
query = query.not('metadata->fips_updated_at', 'is', null);
// ...
query = query.or('metadata.is.null,metadata->fips_updated_at.is.null');

// Станет:
query = query.not('metadata->>fips_updated_at', 'is', null);
// ...
query = query.or('metadata.is.null,metadata->>fips_updated_at.is.null');
```

Если `->>` все еще не сработает через `.not()`, то fallback на `.filter()`:

```typescript
query = query.filter('metadata->>fips_updated_at', 'not.is', 'null');
// ...
query = query.or('metadata.is.null').filter('metadata->>fips_updated_at', 'is', 'null');
```

Минимальное изменение — 2 строки в `applyFilters`.

