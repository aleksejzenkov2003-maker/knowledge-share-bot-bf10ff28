-- Add columns to support multi-part documents
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS part_number INTEGER,
ADD COLUMN IF NOT EXISTS total_parts INTEGER;

-- Create index for efficient querying of document parts
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_document_id);

-- Add comment for clarity
COMMENT ON COLUMN documents.parent_document_id IS 'Links to parent document when this is a part of a split PDF';
COMMENT ON COLUMN documents.part_number IS 'Part number (1-based) when document is split';
COMMENT ON COLUMN documents.total_parts IS 'Total number of parts the original document was split into';