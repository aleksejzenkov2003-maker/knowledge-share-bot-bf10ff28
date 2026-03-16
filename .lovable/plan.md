

# Archive Unpacker for RAG Document Upload

## Problem
User uploads document archives (RAR, ZIP, 7z) containing multiple files. Currently only individual files are accepted. Need to unpack archives client-side and process each file through the existing upload pipeline.

## Approach

**Client-side unpacking** using JavaScript libraries, then feeding each extracted file into the existing `uploadSingleFile` + `processDocument` pipeline sequentially.

### Libraries
- **ZIP**: `JSZip` (already in project)
- **RAR**: `unrar-promise` or `libarchive.js` -- however, RAR is proprietary and hard in browser. Best option: **`libarchive.js`** which supports ZIP, RAR, 7z, tar.gz via WebAssembly (libarchive compiled to WASM).

Alternative simpler approach: use **`fflate`** for ZIP only and recommend users convert RAR to ZIP. But since user explicitly needs RAR support, we need `libarchive.js` or similar.

**Recommended**: Install `libarchive.js` (npm package) which handles RAR/ZIP/7z/tar in the browser via WASM.

### Implementation

#### 1. New utility: `src/components/documents/archiveExtractor.ts`
- Function `extractArchive(file: File, onProgress?)` → returns `ExtractedFile[]`
- Each `ExtractedFile` has `{ name, blob, size, type }`
- Filters out non-document files (images, executables, etc.) -- keep only supported types (pdf, docx, doc, txt, csv, xls, xlsx, md)
- Skips `__MACOSX`, `.DS_Store`, thumbs.db and similar junk
- Handles nested folders by flattening filenames

#### 2. Modify `src/pages/Documents.tsx`
- Add `.zip,.rar,.7z` to file input `accept` attribute
- In `handleUpload`: detect archive by extension/MIME → call `extractArchive`
- Show progress: "Распаковка архива... (N файлов найдено)"
- For each extracted file: run through existing logic (check size, check if PDF needs split, etc.) then `uploadSingleFile` + `processDocument`
- All files share the same `folder_id` and `document_type` from the form
- Progress UI shows: extracting → uploading file X of N → processing file X of N

#### 3. Helper function `isArchiveFile(file: File): boolean`
- Check extension: `.zip`, `.rar`, `.7z`, `.tar`, `.tar.gz`, `.tgz`

#### 4. Archive upload flow
```text
User selects .rar/.zip
    ↓
extractArchive() via libarchive.js WASM
    ↓
Filter supported file types, skip junk
    ↓
For each file:
    ├─ Check size limits
    ├─ Check if PDF needs split → splitPdf if needed
    ├─ uploadSingleFile()
    └─ processDocument()
    ↓
Summary toast: "Загружено X из Y файлов"
```

### Files to modify
- `package.json` -- add `libarchive.js` dependency
- New file: `src/components/documents/archiveExtractor.ts`
- `src/pages/Documents.tsx` -- add archive detection, extraction flow, updated accept types

### UI Changes
- File input accepts archives
- Progress shows extraction stage with file count
- Summary toast shows how many files were successfully processed

