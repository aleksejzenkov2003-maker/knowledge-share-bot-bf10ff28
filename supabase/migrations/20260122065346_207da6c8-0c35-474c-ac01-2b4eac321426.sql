-- Add bitrix_user_id to profiles for mapping Bitrix24 users
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS bitrix_user_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_bitrix_user_id ON profiles(bitrix_user_id);

-- Add source field to department_chat_messages to track message origin
ALTER TABLE department_chat_messages 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web' CHECK (source IN ('web', 'bitrix', 'api'));

CREATE INDEX IF NOT EXISTS idx_department_chat_messages_source ON department_chat_messages(source);

-- Create department_api_keys table for API authentication
CREATE TABLE IF NOT EXISTS department_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  name TEXT NOT NULL DEFAULT 'Default',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  request_count INTEGER DEFAULT 0
);

-- Enable RLS on department_api_keys
ALTER TABLE department_api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can manage API keys
CREATE POLICY "Admins can manage api keys" ON department_api_keys
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_department_api_keys_updated_at
  BEFORE UPDATE ON department_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();