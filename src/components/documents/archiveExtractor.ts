/**
 * Archive extractor supporting ZIP, RAR, 7z, TAR via libarchive.js (WASM)
 */

export interface ExtractedFile {
  name: string;
  file: File;
  size: number;
}

export interface ArchiveExtractionProgress {
  stage: 'opening' | 'extracting' | 'complete';
  message: string;
  fileCount?: number;
}

// Supported document extensions for RAG processing
const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.xls', '.xlsx',
  '.rtf', '.odt', '.html', '.htm', '.json', '.xml'
]);

// Junk files/folders to skip
const JUNK_PATTERNS = [
  '__MACOSX',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.git/',
  '.svn/',
];

export function isArchiveFile(file: File): boolean {
  const ext = file.name.toLowerCase();
  return ext.endsWith('.zip') || ext.endsWith('.rar') || ext.endsWith('.7z') ||
    ext.endsWith('.tar') || ext.endsWith('.tar.gz') || ext.endsWith('.tgz') ||
    ext.endsWith('.tar.bz2') || ext.endsWith('.tbz2');
}

function isJunkFile(path: string): boolean {
  return JUNK_PATTERNS.some(p => path.includes(p));
}

function isSupportedDocument(fileName: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function flattenFileName(path: string): string {
  // Get just the filename from nested path
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    rtf: 'application/rtf',
    html: 'text/html',
    htm: 'text/html',
    json: 'application/json',
    xml: 'application/xml',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Recursively collect all File objects from the libarchive.js getFilesObject() result.
 * The result is a nested object where keys are folder/file names and values are
 * either File objects or nested objects (directories).
 */
function collectFiles(obj: any, prefix: string = ''): Array<{ path: string; file: File }> {
  const results: Array<{ path: string; file: File }> = [];

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const currentPath = prefix ? `${prefix}/${key}` : key;

    if (val instanceof File) {
      results.push({ path: currentPath, file: val });
    } else if (val && typeof val === 'object' && !(val instanceof Blob)) {
      // It's a directory object — recurse
      results.push(...collectFiles(val, currentPath));
    }
  }

  return results;
}

/**
 * Extract files from an archive (ZIP, RAR, 7z, TAR).
 * Returns only supported document files, skipping junk.
 */
export async function extractArchive(
  file: File,
  onProgress?: (progress: ArchiveExtractionProgress) => void
): Promise<ExtractedFile[]> {
  onProgress?.({ stage: 'opening', message: 'Открытие архива...' });

  // Dynamic import to avoid bundling issues
  const { Archive } = await import('libarchive.js');
  
  // Init with worker URL pointing to our public copy
  Archive.init({
    workerUrl: '/libarchive/worker-bundle.js',
  });

  const archive = await Archive.open(file);
  
  onProgress?.({ stage: 'extracting', message: 'Извлечение файлов...' });

  // Extract all files as a nested object
  const filesObj = await archive.getFilesObject();
  
  // Recursively collect all File objects
  const allEntries = collectFiles(filesObj);

  const extractedFiles: ExtractedFile[] = [];

  for (const entry of allEntries) {
    const { path, file: extractedFile } = entry;

    // Skip junk
    if (isJunkFile(path)) continue;

    const fileName = flattenFileName(path);

    // Skip unsupported types
    if (!isSupportedDocument(fileName)) continue;

    // Skip empty files
    if (extractedFile.size === 0) continue;

    // Create a proper File with correct name and MIME type
    const properFile = new File(
      [extractedFile],
      fileName,
      { type: getMimeType(fileName) }
    );

    extractedFiles.push({
      name: fileName,
      file: properFile,
      size: properFile.size,
    });
  }

  onProgress?.({
    stage: 'complete',
    message: `Извлечено ${extractedFiles.length} документов`,
    fileCount: extractedFiles.length,
  });

  return extractedFiles;
}
