import JSZip from 'jszip';

export interface ExcelPart {
  blob: Blob;
  partNumber: number;
  totalParts: number;
  rowStart: number;
  rowEnd: number;
}

export interface ExcelSplitProgress {
  currentPart: number;
  totalParts: number;
  stage: 'loading' | 'splitting' | 'complete';
}

const EXCEL_SPLIT_THRESHOLD = 1 * 1024 * 1024; // 1 MB
const ROWS_PER_PART = 5000;
const MAX_PARTS = 50;

export function isExcelFile(file: File): boolean {
  const ext = file.name.toLowerCase();
  return ext.endsWith('.xlsx') || ext.endsWith('.xls');
}

export function needsExcelSplit(file: File): boolean {
  return isExcelFile(file) && file.size > EXCEL_SPLIT_THRESHOLD && file.name.toLowerCase().endsWith('.xlsx');
}

export function estimateExcelParts(fileSize: number): number {
  // Rough: ~100 bytes per row average for typical spreadsheets
  const estimatedRows = Math.ceil(fileSize / 100);
  return Math.min(Math.ceil(estimatedRows / ROWS_PER_PART), MAX_PARTS);
}

/**
 * Count total data rows in the first (largest) sheet of an XLSX file.
 */
export async function getExcelRowCount(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sheetFile = Object.keys(zip.files)
    .filter(f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'))
    .sort()[0];
  if (!sheetFile) return 0;
  
  const xml = await zip.file(sheetFile)!.async('string');
  const rowMatches = xml.match(/<row /g);
  return rowMatches ? rowMatches.length : 0;
}

/**
 * Splits a large XLSX file into smaller XLSX files by rows.
 * Each part keeps the header row and a subset of data rows.
 * Copies sharedStrings, styles, and other support files as-is.
 */
export async function splitExcel(
  file: File,
  rowsPerPart: number = ROWS_PER_PART,
  onProgress?: (progress: ExcelSplitProgress) => void
): Promise<ExcelPart[]> {
  onProgress?.({ currentPart: 0, totalParts: 0, stage: 'loading' });

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Find the main worksheet (sheet1)
  const sheetFiles = Object.keys(zip.files)
    .filter(f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'))
    .sort();

  if (sheetFiles.length === 0) {
    throw new Error('No worksheets found in XLSX file');
  }

  // We split only the first (main) sheet; others are dropped from parts
  const mainSheetPath = sheetFiles[0];
  const sheetXml = await zip.file(mainSheetPath)!.async('string');

  // Extract <sheetData> content with all <row> elements
  const sheetDataMatch = sheetXml.match(/<sheetData[^>]*>([\s\S]*?)<\/sheetData>/);
  if (!sheetDataMatch) {
    throw new Error('Could not parse sheetData from worksheet XML');
  }

  const sheetDataContent = sheetDataMatch[1];
  // Split into individual <row ...>...</row> elements
  const rowRegex = /<row [^>]*>[\s\S]*?<\/row>/g;
  const allRows: string[] = [];
  let match;
  while ((match = rowRegex.exec(sheetDataContent)) !== null) {
    allRows.push(match[0]);
  }

  if (allRows.length <= 1) {
    // Only header or empty — no need to split
    throw new Error('File has too few rows to split');
  }

  // First row is the header
  const headerRow = allRows[0];
  const dataRows = allRows.slice(1);

  const totalParts = Math.min(Math.ceil(dataRows.length / rowsPerPart), MAX_PARTS);
  onProgress?.({ currentPart: 0, totalParts, stage: 'splitting' });

  // Parts of XML before and after <sheetData>
  const beforeSheetData = sheetXml.slice(0, sheetXml.indexOf('<sheetData'));
  const sheetDataTag = sheetXml.match(/<sheetData[^>]*>/)?.[0] || '<sheetData>';
  const afterSheetData = sheetXml.slice(sheetXml.indexOf('</sheetData>') + '</sheetData>'.length);

  // Collect all non-worksheet files to copy into each part
  const filesToCopy = Object.keys(zip.files).filter(
    f => !f.startsWith('xl/worksheets/sheet') || f === mainSheetPath ? false : true
  );
  // Actually we want everything except worksheet files (we'll add our modified sheet)
  const supportFiles = Object.keys(zip.files).filter(
    f => !(f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml')) && !zip.files[f].dir
  );

  const parts: ExcelPart[] = [];

  for (let partIdx = 0; partIdx < totalParts; partIdx++) {
    const start = partIdx * rowsPerPart;
    const end = Math.min(start + rowsPerPart, dataRows.length);
    const partRows = dataRows.slice(start, end);

    // Re-number rows: header is row 1, data starts at row 2
    const renumberedHeader = renumberRow(headerRow, 1);
    const renumberedDataRows = partRows.map((row, i) => renumberRow(row, i + 2));

    // Build new sheetData
    const newSheetData = `${sheetDataTag}${renumberedHeader}${renumberedDataRows.join('')}</sheetData>`;
    const newSheetXml = beforeSheetData + newSheetData + afterSheetData;

    // Build new ZIP
    const newZip = new JSZip();

    // Copy support files
    for (const filePath of supportFiles) {
      const fileObj = zip.file(filePath);
      if (fileObj) {
        const content = await fileObj.async('uint8array');
        newZip.file(filePath, content);
      }
    }

    // Add our modified worksheet as sheet1
    newZip.file(mainSheetPath, newSheetXml);

    const blob = await newZip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    parts.push({
      blob,
      partNumber: partIdx + 1,
      totalParts,
      rowStart: start + 2, // 1-based, skip header
      rowEnd: end + 1,
    });

    onProgress?.({ currentPart: partIdx + 1, totalParts, stage: 'splitting' });
  }

  onProgress?.({ currentPart: totalParts, totalParts, stage: 'complete' });
  return parts;
}

/**
 * Re-number a <row r="X"> to a new row number.
 */
function renumberRow(rowXml: string, newRowNum: number): string {
  // Update the row's r attribute
  let result = rowXml.replace(/<row ([^>]*?)r="(\d+)"/, `<row $1r="${newRowNum}"`);
  
  // Update cell references within the row (e.g., A5 -> A2)
  result = result.replace(/<c ([^>]*?)r="([A-Z]+)\d+"/g, `<c $1r="$2${newRowNum}"`);
  
  return result;
}

export function generateExcelPartFileName(originalName: string, partNumber: number, totalParts: number): string {
  const nameWithoutExt = originalName.replace(/\.xlsx$/i, '');
  return `${nameWithoutExt}_part${partNumber}of${totalParts}.xlsx`;
}
