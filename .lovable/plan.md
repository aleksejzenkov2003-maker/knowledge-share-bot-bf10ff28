

## Plan: Fix Text Extraction Quality and PII False Positives

### Root Cause

The PDF text extraction library (`unpdf`) extracts text from this PDF but breaks words apart with extra spaces: "анализ" becomes "а нализ", "ходатайству" becomes "ход атайству", "государственный" becomes "государстве нный".

The OCR fallback (Gemini) only triggers when extracted text is under 200 characters. Since `unpdf` does extract text (just corrupted), the quality check never fires and the garbage text gets stored.

Additionally, the BIRTHDATE masking and text truncation seen in the screenshots are from documents processed BEFORE our last fix. They need reprocessing.

### Changes

#### 1. Add text quality check after `unpdf` extraction

**File**: `supabase/functions/process-document/index.ts` (around line 2062-2095)

After extracting text with `unpdf`, add a quality check. If the text quality is poor, treat it as a scanned PDF and fall through to OCR.

Quality metric: count single-letter "word fragments" (single Cyrillic letter followed by space and more letters). In Russian, natural single-letter words are limited to prepositions: "в", "с", "и", "о", "а", "у", "к". If there are many other single-letter fragments, the extraction is broken.

```typescript
// After line 2068 (text cleanup), add quality check:
function checkTextQuality(text: string): boolean {
  // Count suspicious single-letter word fragments
  // Natural single-letter Russian words: в, с, и, о, а, у, к, я
  const naturalSingleLetters = new Set(['в', 'с', 'и', 'о', 'а', 'у', 'к', 'я', 'В', 'С', 'И', 'О', 'А', 'У', 'К', 'Я']);
  const words = text.split(/\s+/);
  let suspiciousFragments = 0;
  let totalWords = 0;
  
  for (const word of words) {
    if (word.length === 0) continue;
    totalWords++;
    // Single Cyrillic letter that isn't a natural preposition
    if (word.length === 1 && /[а-яА-ЯёЁ]/.test(word) && !naturalSingleLetters.has(word)) {
      suspiciousFragments++;
    }
  }
  
  if (totalWords < 50) return true; // Too short to judge
  
  const fragmentRatio = suspiciousFragments / totalWords;
  // If more than 5% of words are suspicious single-letter fragments, quality is poor
  return fragmentRatio < 0.05;
}
```

Then modify the OCR fallback condition (line 2095):

```typescript
// BEFORE (only checks length):
if (text.length < 200 && pdfData.length > 10000) {

// AFTER (checks length OR quality):
const textQualityOk = checkTextQuality(text);
if (!textQualityOk) {
  console.log(`PDF text quality is poor (broken word boundaries detected). Falling back to OCR...`);
}
if ((text.length < 200 || !textQualityOk) && pdfData.length > 10000) {
```

This ensures that even if `unpdf` extracts a lot of text, if the words are broken, we use Gemini OCR instead which produces clean text.

#### 2. Reset affected documents for reprocessing

Run a database update to reset documents that were processed with the old PII patterns and old chunking logic, so they get reprocessed with the fixes:

```sql
UPDATE documents 
SET status = 'pending', chunk_count = 0
WHERE status = 'ready' 
AND contains_pii = true 
AND updated_at < NOW() - INTERVAL '1 hour';
```

Note: This is optional -- you may want to selectively reprocess only the problematic documents rather than all PII documents.

#### 3. Redeploy `process-document` edge function

### Summary

| File | Change |
|---|---|
| `supabase/functions/process-document/index.ts` | Add `checkTextQuality()` function; expand OCR fallback to trigger on poor-quality text, not just missing text |
| Database (optional) | Reset affected documents for reprocessing |

### Expected Results

- PDFs with broken word extraction will automatically fall through to Gemini OCR, producing clean text
- Previously processed documents (with old BIRTHDATE regex and old chunking) will be reprocessed with all fixes applied
- No more "а нализ", "ход атайству" broken words in extracted text
