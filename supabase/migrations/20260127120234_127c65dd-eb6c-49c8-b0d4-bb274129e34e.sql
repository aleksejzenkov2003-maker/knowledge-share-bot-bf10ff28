-- =====================================================
-- CHAT KNOWLEDGE BASE + REPLY-TO-MESSAGE
-- =====================================================

-- 1. Create chat_knowledge_base table for storing uploaded documents
CREATE TABLE public.chat_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope: either department or personal conversation
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Original source message
  source_message_id UUID,
  
  -- File information
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- Metadata
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  
  -- Timestamps and ownership
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Ensure either department OR conversation, not both
  CONSTRAINT knowledge_base_scope CHECK (
    (department_id IS NOT NULL AND conversation_id IS NULL) OR
    (department_id IS NULL AND conversation_id IS NOT NULL)
  )
);

-- Indexes for fast lookups
CREATE INDEX idx_kb_department ON chat_knowledge_base(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX idx_kb_conversation ON chat_knowledge_base(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_kb_file_path_unique ON chat_knowledge_base(file_path);

-- Enable RLS
ALTER TABLE public.chat_knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_knowledge_base
CREATE POLICY "Admins can manage knowledge base" ON chat_knowledge_base
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users can view department knowledge base" ON chat_knowledge_base
  FOR SELECT USING (
    is_admin() OR 
    has_role(auth.uid(), 'moderator') OR
    (department_id IS NOT NULL AND department_id = get_user_department(auth.uid()))
  );

CREATE POLICY "Users can view own conversation knowledge base" ON chat_knowledge_base
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c 
      WHERE c.id = chat_knowledge_base.conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert to department knowledge base" ON chat_knowledge_base
  FOR INSERT WITH CHECK (
    is_admin() OR
    has_role(auth.uid(), 'moderator') OR
    (department_id IS NOT NULL AND department_id = get_user_department(auth.uid())) OR
    (conversation_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can update usage count" ON chat_knowledge_base
  FOR UPDATE USING (
    is_admin() OR
    has_role(auth.uid(), 'moderator') OR
    (department_id IS NOT NULL AND department_id = get_user_department(auth.uid())) OR
    (conversation_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
    ))
  );

-- 2. Add reply_to_message_id to department_chat_messages
ALTER TABLE department_chat_messages 
ADD COLUMN reply_to_message_id UUID REFERENCES department_chat_messages(id) ON DELETE SET NULL;

CREATE INDEX idx_dcm_reply_to ON department_chat_messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

-- 3. Add reply_to_message_id to messages (personal chats)
ALTER TABLE messages 
ADD COLUMN reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX idx_msg_reply_to ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;