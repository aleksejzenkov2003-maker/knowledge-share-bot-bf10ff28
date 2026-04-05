-- Add page number columns to document_chunks for precise PDF navigation
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS page_start INTEGER,
ADD COLUMN IF NOT EXISTS page_end INTEGER;

-- Index for fast page-based lookups
CREATE INDEX IF NOT EXISTS idx_chunks_pages 
ON document_chunks(document_id, page_start, page_end);