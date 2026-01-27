-- Add is_pinned column to department_chats table
ALTER TABLE public.department_chats 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Add index for better performance on pinned chats queries
CREATE INDEX IF NOT EXISTS idx_department_chats_pinned 
ON public.department_chats(department_id, is_pinned, updated_at DESC);

-- Add RLS policy for updating department chats (for rename/pin)
CREATE POLICY "Users can update department chats in their department" 
ON public.department_chats 
FOR UPDATE 
USING (
  is_admin() OR 
  has_role(auth.uid(), 'moderator'::app_role) OR 
  department_id = get_user_department(auth.uid())
);

-- Add RLS policy for inserting new department chats
CREATE POLICY "Users can create department chats in their department" 
ON public.department_chats 
FOR INSERT 
WITH CHECK (
  is_admin() OR 
  has_role(auth.uid(), 'moderator'::app_role) OR 
  department_id = get_user_department(auth.uid())
);