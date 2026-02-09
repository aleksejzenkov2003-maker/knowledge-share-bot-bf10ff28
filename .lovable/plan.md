
# Fix: Large Scanned PDFs Crash During OCR Processing

## Root Cause

The edge function crashes with `CPU Time exceeded` when processing scanned PDFs like "Рук по экспертизе.pdf" (5.6MB, 221 pages) and "Руков по регистрации ТЗ.pdf" (7.5MB). Here is why:

1. These files are under the 10MB split threshold, so they upload as **single files**
2. The edge function detects 0 extractable text (scanned PDF) and enters OCR mode
3. OCR loads the **entire** 5-7MB PDF into memory with pdf-lib, then creates sub-PDFs for each 4-page chunk
4. After processing ~4 chunks, the edge function exceeds CPU time limits and crashes

The `mktu_13_26_2lang.xlsx` (922KB) was actually successfully processed earlier (164 chunks, status: ready). If the user is uploading a new copy, it should work fine.

## Solution

**Lower the PDF split threshold from 10MB to 4MB** so that scanned PDFs get split client-side before upload. Client-side splitting uses `pdf-lib` in the browser (no edge function limits), then each small part (~50 pages, typically 1-3MB) is uploaded and processed independently.

Additionally, **reduce the OCR page cap** for single-file processing from 80 to 30 pages to ensure even unsplit PDFs that slip through can complete within CPU limits.

## Changes

### 1. `src/pages/Documents.tsx` (2 lines)

Lower the split threshold so PDFs over 4MB are automatically split client-side:

```
Before: const SPLIT_THRESHOLD = 10 * 1024 * 1024; // 10 MB
After:  const SPLIT_THRESHOLD = 4 * 1024 * 1024;  // 4 MB

Before: const SPLIT_THRESHOLD_MB = 10;
After:  const SPLIT_THRESHOLD_MB = 4;
```

### 2. `supabase/functions/process-document/index.ts` (1 line)

Reduce the OCR page cap for safety (in case single unsplit PDFs still come through):

```
Before: const MAX_OCR_PAGES = 80;
After:  const MAX_OCR_PAGES = 30;
```

### 3. `src/pages/Documents.tsx` - Remove reprocess block for files > threshold

Since the threshold is now 4MB, reprocessing documents that were already split should work. But for scanned PDFs that were uploaded as single files before this fix, the user will need to delete and re-upload them. The reprocess size check should use a higher threshold (10MB) since the edge function can handle non-scanned PDFs up to 10MB fine.

```
Before: doc.file_size > SPLIT_THRESHOLD
After:  doc.file_size > 10 * 1024 * 1024  // Hard limit for edge function
```

## How It Fixes the Problem

After the change, uploading "Рук по экспертизе.pdf" (5.6MB, 221 pages):
1. Client detects 5.6MB > 4MB threshold -- triggers split
2. PDF is split into 5 parts of ~50 pages each (~1-1.5MB per part)
3. Each part is uploaded and processed independently
4. Edge function OCRs 50 pages max per invocation (well within limits)

## User Action Required

The existing failed documents ("Рук по экспертизе" and "Руков по регистрации ТЗ") must be **deleted and re-uploaded** after the fix, since they were uploaded as single files and cannot be retroactively split on the server.
