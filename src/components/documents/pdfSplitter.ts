export interface PdfPart {
  blob: Blob;
  partNumber: number;
  totalParts: number;
  pageStart: number;
  pageEnd: number;
}

export interface SplitProgress {
  currentPart: number;
  totalParts: number;
  stage: 'loading' | 'splitting' | 'complete';
}

/**
 * Estimates how many parts a PDF will be split into based on file size
 * Uses approximate 50 pages per ~3-4 MB as baseline
 */
export function estimatePdfParts(fileSize: number, pagesPerPart: number = 50): number {
  // Rough estimate: average PDF page is ~50-80 KB
  const estimatedPages = Math.ceil(fileSize / (65 * 1024));
  return Math.ceil(estimatedPages / pagesPerPart);
}

/**
 * Gets the total page count of a PDF file
 * Uses dynamic import to avoid bundling issues with React
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

/**
 * Splits a large PDF file into smaller parts on the client side.
 * Each part will contain up to `pagesPerPart` pages.
 * Uses dynamic import to avoid bundling issues with React.
 * 
 * @param file - The PDF file to split
 * @param pagesPerPart - Maximum pages per part (default: 50)
 * @param onProgress - Callback for progress updates
 * @returns Array of PDF parts as Blobs with metadata
 */
export async function splitPdf(
  file: File,
  pagesPerPart: number = 50,
  onProgress?: (progress: SplitProgress) => void
): Promise<PdfPart[]> {
  // Dynamic import to avoid bundling issues
  const { PDFDocument } = await import('pdf-lib');
  
  // Load the PDF
  onProgress?.({ currentPart: 0, totalParts: 0, stage: 'loading' });
  
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  
  const totalParts = Math.ceil(totalPages / pagesPerPart);
  const parts: PdfPart[] = [];
  
  onProgress?.({ currentPart: 0, totalParts, stage: 'splitting' });
  
  for (let i = 0; i < totalPages; i += pagesPerPart) {
    const partNumber = Math.floor(i / pagesPerPart) + 1;
    const pageStart = i + 1; // 1-based for display
    const pageEnd = Math.min(i + pagesPerPart, totalPages);
    
    // Create new PDF document for this part
    const newPdf = await PDFDocument.create();
    
    // Copy pages from original document
    const pageIndices = Array.from(
      { length: pageEnd - i },
      (_, idx) => i + idx
    );
    
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    // Save to bytes
    const pdfBytes = await newPdf.save();
    // Convert Uint8Array to Blob
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    
    parts.push({
      blob,
      partNumber,
      totalParts,
      pageStart,
      pageEnd,
    });
    
    onProgress?.({ currentPart: partNumber, totalParts, stage: 'splitting' });
  }
  
  onProgress?.({ currentPart: totalParts, totalParts, stage: 'complete' });
  
  return parts;
}

/**
 * Generates a part filename from the original filename
 */
export function generatePartFileName(originalName: string, partNumber: number, totalParts: number): string {
  const nameWithoutExt = originalName.replace(/\.pdf$/i, '');
  return `${nameWithoutExt}_part${partNumber}of${totalParts}.pdf`;
}
