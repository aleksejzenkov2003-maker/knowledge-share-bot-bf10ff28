

## Plan: Fix PII False Positives and Text Truncation

### Problem Analysis

From the screenshots, there are **two categories** of issues:

---

### A. PII Regex False Positives (3 patterns need calibration)

**1. BIRTHDATE: matches ALL dates, not just birthdates**

The second pattern `/\b(0?[1-9]|[12][0-9]|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](19[0-9]{2}|20[0-2][0-9])\b/g` matches every date in DD.MM.YYYY format. In legal/patent documents, dates like "15.01.2024" or "22.01.2024" are document dates, court ruling dates, application dates -- NOT birthdates.

**Fix**: Remove the generic date pattern, keep ONLY the context-based pattern (with keywords like "дата рождения", "родился", "д.р.").

**2. ADDRESS: `адрес[:\s]*` captures organizational addresses**

The pattern `/адрес[:\s]*[^,\n]{10,80}/gi` matches phrases like "в адрес ФГБОУ ВО Московский государственный университет..." -- masking organization names and important legal text. The postal index pattern `/\b\d{6}\s*,?\s*(?:г\.?\s*)?[А-ЯЁа-яё]+/g` can also match certificate/application numbers (6-digit numbers followed by Russian words).

**Fix**: 
- Make the `адрес` pattern stricter: require "адрес:" or "адрес проживания/регистрации" context, not just "в адрес" (which means "to").
- Add negative lookbehind for "в " before "адрес" to exclude the common phrase "в адрес".
- Make postal index pattern require a comma after the 6 digits.

**3. PERSON: matches legal terms**

The pattern for "Имя + Фамилия без отчества" `/[А-ЯЁ][а-яё]{2,12}(?:у|ю)[\s\u00A0]+[А-ЯЁ][а-яё]{2,15}/g` is too broad. It matches any two capitalized Russian words where the first ends in "у"/"ю" (accusative case). This catches phrases like "Резолютивную Часть" or similar legal terms.

**Fix**: Add a stop-word list of common false positives (Резолютивную, Арбитражному, Федеральному, Государственную, etc.) and check against it before masking.

---

### B. Text Coming Back Incomplete (Chunk Truncation)

From comparing screenshots image-177 (masked) vs image-178 (original PDF):
- Masked text ends with "...по контракту No0803 - 44 - 2023 в ад" -- cut mid-word
- Original shows "...по контракту No0803-44-2023 в адрес ФГБОУ ВО..."

This happens because:
1. The chunking algorithm cuts text at ~1500 characters (see `targetSize = 1500` in the fallback chunker)
2. The sentence-end search window (`text.slice(end - 200, end + 200)`) looks for `. ` or `) ` but these may not appear in the text
3. The word "адрес" gets split as "ад" + cut

**Fix**: Improve the sentence-boundary detection in the fallback chunker to also break on `\n`, `;`, and to never cut mid-word (at minimum, find the last space before the cut point).

---

### Technical Changes

#### File 1: `supabase/functions/_shared/pii-patterns.ts`

**BIRTHDATE** (lines 131-143):
- Remove the second generic pattern that matches all DD.MM.YYYY dates
- Keep only the context-based pattern (with "дата рождения", "родился", etc.)

**ADDRESS** (lines 145-158):
- Remove the broad `адрес[:\s]*[^,\n]{10,80}` pattern
- Make postal index pattern stricter: require comma after 6 digits (`\b\d{6}\s*,\s*`)
- Keep the street/building address pattern unchanged (it's specific enough)

**PERSON** (lines 161-186):
- Remove or restrict the "Имя + Фамилия без отчества" pattern (line 175) -- too many false positives
- Add a post-match filter for common Russian legal/administrative words in accusative case

#### File 2: `supabase/functions/process-document/index.ts`

**Chunk truncation fix** (around line 1580-1615):
- In the fallback chunker, improve boundary detection:
  - After finding the target end position, search for the last space/newline before cutting
  - Expand the sentence-end pattern to include `\n`, `;`, and `:` in addition to `.` and `)`
  - Never cut mid-word: if no sentence boundary found, at least find the last whitespace

#### File 3: Redeploy both edge functions
- `process-document` -- for new uploads
- `pii-mask` -- for chat PII masking (uses same patterns)

### Expected Results

- Dates in legal documents (court rulings, applications) will NOT be masked unless preceded by birth-related context
- Organization addresses ("в адрес ФГБОУ ВО...") will NOT be masked
- Legal terms like "Резолютивная часть" will NOT be falsely detected as person names
- Certificate numbers ("Свидетельство No...") and application numbers ("заявка No...") will NOT be masked
- Document chunks will not be cut mid-word

