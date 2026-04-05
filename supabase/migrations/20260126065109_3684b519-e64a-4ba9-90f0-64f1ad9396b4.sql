-- Add is_pinned column to conversations table
ALTER TABLE conversations ADD COLUMN is_pinned BOOLEAN DEFAULT false;

-- Create index for efficient querying of pinned conversations
CREATE INDEX idx_conversations_pinned ON conversations(user_id, is_pinned);