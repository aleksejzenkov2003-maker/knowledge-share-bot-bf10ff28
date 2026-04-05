-- Add mention_trigger column to chat_roles for @mention support
ALTER TABLE public.chat_roles 
ADD COLUMN mention_trigger TEXT UNIQUE;

-- Create department_chats table
CREATE TABLE public.department_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Чат отдела',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create department_chat_messages table
CREATE TABLE public.department_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.department_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role_id UUID REFERENCES public.chat_roles(id) ON DELETE SET NULL,
  message_role TEXT NOT NULL CHECK (message_role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_department_chats_department_id ON public.department_chats(department_id);
CREATE INDEX idx_department_chat_messages_chat_id ON public.department_chat_messages(chat_id);
CREATE INDEX idx_department_chat_messages_created_at ON public.department_chat_messages(created_at);

-- Enable RLS
ALTER TABLE public.department_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for department_chats
-- Users can view chats of their department
CREATE POLICY "Users can view department chats" ON public.department_chats
  FOR SELECT USING (
    is_admin() OR 
    has_role(auth.uid(), 'moderator'::app_role) OR
    department_id = get_user_department(auth.uid())
  );

-- Only admins can create/update/delete department chats
CREATE POLICY "Admins can manage department chats" ON public.department_chats
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- RLS policies for department_chat_messages
-- Users can view messages in their department's chats
CREATE POLICY "Users can view department messages" ON public.department_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.department_chats dc
      WHERE dc.id = department_chat_messages.chat_id
      AND (
        is_admin() OR 
        has_role(auth.uid(), 'moderator'::app_role) OR
        dc.department_id = get_user_department(auth.uid())
      )
    )
  );

-- Users can insert messages in their department's chats
CREATE POLICY "Users can insert department messages" ON public.department_chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.department_chats dc
      WHERE dc.id = department_chat_messages.chat_id
      AND (
        is_admin() OR 
        has_role(auth.uid(), 'moderator'::app_role) OR
        dc.department_id = get_user_department(auth.uid())
      )
    )
  );

-- Admins can manage all messages
CREATE POLICY "Admins can manage department messages" ON public.department_chat_messages
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_department_chats_updated_at
  BEFORE UPDATE ON public.department_chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create a default chat for each existing department
INSERT INTO public.department_chats (department_id, title)
SELECT id, 'Чат отдела ' || name
FROM public.departments
ON CONFLICT DO NOTHING;