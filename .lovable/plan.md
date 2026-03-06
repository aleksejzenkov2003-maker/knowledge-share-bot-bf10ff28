

## Plan: Add All Missing Trademark Fields

### Problem
The CSV contains ~35 fields, but the database only has ~30 columns. Several fields from the CSV are missing in both the DB schema and the import mapping. Specifically missing:

**Missing DB columns (need migration):**
- `description_element` (text) — описание обозначения
- `description_image` (text) — изображение обозначения
- `transliteration` (text) — транслитерация
- `translation` (text) — перевод
- `note` (text) — примечание
- `publication_url` (text) — URL публикации на ФИПС
- `threedimensional_specification` (text)
- `holographic_specification` (text)
- `sound_specification` (text)
- `olfactory_specification` (text)
- `color_trademark_specification` (text)
- `light_specification` (text)
- `changing_specification` (text)
- `positional_specification` (text)
- `place_name_specification` (text)
- `phonetics_specification` (text)
- `change_right_holder_name_history` (text)
- `change_right_holder_address_history` (text)
- `change_correspondence_address_history` (text)
- `change_legal_related_registrations_history` (text)
- `change_color_specification_history` (text)
- `change_disclaimer_history` (text)
- `change_description_element_history` (text)
- `change_description_image_history` (text)
- `change_note_history` (text)

**Missing FIELD_MAP entries (CSV header → DB column):**
- `disclaimer` → `unprotected_elements` (already in DB but not mapped)
- `publication_url` → `publication_url` (new)
- All `*_specification` fields
- All `change_*_history` fields
- `description_element`, `description_image`, `transliteration`, `translation`, `note`

### Implementation Steps

1. **Database migration** — Add ~25 new text columns to `trademarks` table

2. **Update `FIELD_MAP`** in `Trademarks.tsx` — Add all new CSV-header-to-DB-column mappings, including:
   - `disclaimer` → `unprotected_elements`
   - `publication_url` → `publication_url`
   - All specification and history fields

3. **Update `Trademark` interface** — Add all new fields

4. **Update Detail Dialog** — Add new sections:
   - **Описание**: description_element, description_image, transliteration, translation, note
   - **Публикация**: publication_url as a clickable link
   - **Спецификации**: all `*_specification` fields shown conditionally
   - **История изменений**: all `change_*_history` fields in a collapsible section

5. **Clear DB and re-import** — After migration, user should clear and re-upload CSV to populate new fields

### Technical Details

- Migration adds 25 nullable text columns (no breaking changes)
- `InfoRow` component will be extended with a `link` variant for `publication_url`
- History fields displayed in a collapsible accordion to avoid cluttering the card
- All unmapped CSV columns will now be properly captured instead of silently dropped

