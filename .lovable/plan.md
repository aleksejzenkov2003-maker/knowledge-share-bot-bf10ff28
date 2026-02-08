

## Plan: Fix document processing failures (CPU timeout + stuck status)

### Root Cause Analysis

From the logs:
- "Руков по регистрации ТЗ" (7.2 MB, 297 pages, scanned) -- "CPU Time exceeded" after only processing chunk 2 of 75
- "Рук по экспертизе ТЗ" (5.4 MB, 341 pages, scanned) -- "CPU Time exceeded" after only processing chunk 2 of 86
- "mktu_13_26_2lang.xlsx" (900 KB) -- stuck in "processing" status
- All three documents are currently stuck with `status: "processing"` and `chunk_count: 0`

The core issue: when the edge function crashes from CPU timeout, the `catch` block that sets `status: 'error'` never executes, leaving documents permanently stuck.

### Changes

#### 1. Add "stuck processing" detection and auto-reset (edge function)

At the start of `process-document`, before processing, check if the document has been "processing" for more than 5 minutes and reset it to "error" with an appropriate message.

**File**: `supabase/functions/process-document/index.ts`

Add logic near the beginning (after fetching the document record) to detect stale processing state:

```typescript
// If document is already "processing" and was updated > 5 min ago, it's stuck
if (doc.status === 'processing') {
  const updatedAt = new Date(doc.updated_at || doc.created_at);
  const minutesElapsed = (Date.now() - updatedAt.getTime()) / 60000;
  if (minutesElapsed > 5) {
    console.log(`Document stuck in processing for ${minutesElapsed.toFixed(0)} minutes, resetting to error`);
    await supabase.from('documents').update({ 
      status: 'error'
    }).eq('id', document_id);
    return new Response(JSON.stringify({ 
      error: 'Document was stuck in processing. Reset to error. Please retry.' 
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
```

#### 2. Limit maximum pages for OCR to prevent CPU timeout

**File**: `supabase/functions/process-document/index.ts`

In the `tryGeminiOcrChunked` function, add a maximum page cap. PDFs with 200+ pages simply cannot be processed in a single edge function call (60s CPU limit). Cap at ~120 pages (30 chunks of 4 pages, 2 parallel = 15 batches).

```typescript
const MAX_OCR_PAGES = 120;
if (numPages > MAX_OCR_PAGES) {
  console.log(`PDF has ${numPages} pages, exceeding OCR limit of ${MAX_OCR_PAGES}. Processing first ${MAX_OCR_PAGES} pages only.`);
  numPages = MAX_OCR_PAGES;
}
```

Also reduce `PARALLEL_LIMIT` from 2 to 2 (keep) but add a small delay between batches to reduce CPU spikes:

```typescript
// Add 500ms delay between batches
if (batchStart + PARALLEL_LIMIT < chunks.length) {
  await new Promise(r => setTimeout(r, 500));
}
```

#### 3. Fix the three currently stuck documents in DB

Run a migration to reset the three stuck documents from "processing" to "pending" so they can be retried:

```sql
UPDATE documents 
SET status = 'pending', chunk_count = 0
WHERE status = 'processing' 
AND created_at < NOW() - INTERVAL '10 minutes';
```

#### 4. Add client-side "stuck detection" in the Documents page

**File**: `src/pages/Documents.tsx` (or relevant component)

Add a periodic check (every 60 seconds) that resets documents stuck in "processing" for more than 10 minutes, updating their status to "error" client-side so users see the actual state.

### Summary of changes

| File | Change |
|---|---|
| `supabase/functions/process-document/index.ts` | Add stuck-processing detection, add OCR page cap (120 pages), add inter-batch delay |
| Database migration | Reset currently stuck documents to "pending" |
| `src/pages/Documents.tsx` | Add client-side stuck detection (10 min threshold) |

### Expected result

- The three currently stuck documents will be reset and retryable
- Future large PDFs (200+ pages) will process first 120 pages instead of crashing
- If an edge function crashes, the next retry will detect the stuck state and reset it
- Users will see "error" status instead of perpetual "processing" spinner

