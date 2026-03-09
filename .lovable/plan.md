

## Plan: Fix Slow Search and Filtering in Trademark Database (796K records)

### Problem
With ~800K records, every keystroke triggers an `ilike` search across 4 columns without any database indexes. This causes multi-second queries that effectively freeze the UI.

### Root Causes
1. **No indexes** on `registration_number`, `right_holder_name`, `right_holder_inn`, `right_holder_ogrn`, or `actual`
2. **No search debounce** -- query fires on every keystroke
3. **Count query also uses ilike** -- doubles the slow queries

### Implementation

**1. Database migration -- add indexes**
- `CREATE INDEX` on `trademarks(registration_number)` using `text_pattern_ops` for prefix search
- `CREATE INDEX` on `trademarks(right_holder_name)` using `gin(right_holder_name gin_trgm_ops)` for trigram similarity (requires `pg_trgm` extension)
- `CREATE INDEX` on `trademarks(right_holder_inn)` and `trademarks(right_holder_ogrn)`
- `CREATE INDEX` on `trademarks(actual)` for status filtering
- Composite index on `trademarks(actual, created_at DESC)` for filtered+sorted queries

**2. Update `Trademarks.tsx`**
- Add **debounced search** (500ms delay) so queries only fire after the user stops typing
- Use a separate `debouncedSearch` state that feeds into the query key
- Keep the `search` state for immediate UI feedback in the input field

### Technical Details

```sql
-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indexes for search fields
CREATE INDEX idx_trademarks_reg_number ON trademarks(registration_number);
CREATE INDEX idx_trademarks_holder_name_trgm ON trademarks USING gin(right_holder_name gin_trgm_ops);
CREATE INDEX idx_trademarks_inn ON trademarks(right_holder_inn);
CREATE INDEX idx_trademarks_ogrn ON trademarks(right_holder_ogrn);

-- Index for status filter + sort
CREATE INDEX idx_trademarks_actual_created ON trademarks(actual, created_at DESC);
```

In the component, add a debounce via `useEffect` + `setTimeout`:
```typescript
const [debouncedSearch, setDebouncedSearch] = useState('');
useEffect(() => {
  const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 500);
  return () => clearTimeout(t);
}, [search]);
```

Then use `debouncedSearch` in the query keys and filter logic instead of `search`.

