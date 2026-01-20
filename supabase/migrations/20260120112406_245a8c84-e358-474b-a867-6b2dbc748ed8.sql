-- Add department_ids array column if not exists
ALTER TABLE public.chat_roles ADD COLUMN IF NOT EXISTS department_ids uuid[] DEFAULT '{}';

-- Migrate existing data from department_id to department_ids (if department_id still exists)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'chat_roles' 
    AND column_name = 'department_id'
  ) THEN
    UPDATE public.chat_roles 
    SET department_ids = ARRAY[department_id]::uuid[]
    WHERE department_id IS NOT NULL AND (department_ids = '{}' OR department_ids IS NULL);
    
    -- Drop the policy first
    DROP POLICY IF EXISTS "Users can view active roles in their department" ON public.chat_roles;
    
    -- Drop the foreign key constraint
    ALTER TABLE public.chat_roles DROP CONSTRAINT IF EXISTS chat_roles_department_id_fkey;
    
    -- Drop the old column
    ALTER TABLE public.chat_roles DROP COLUMN department_id;
  END IF;
END $$;

-- Recreate RLS policy using department_ids array
DROP POLICY IF EXISTS "Users can view active roles in their department" ON public.chat_roles;

CREATE POLICY "Users can view active roles in their department" 
ON public.chat_roles 
FOR SELECT 
USING (
  is_admin() 
  OR has_role(auth.uid(), 'moderator'::app_role) 
  OR (
    is_active = true 
    AND (
      department_ids = '{}' 
      OR department_ids IS NULL 
      OR get_user_department(auth.uid()) = ANY(department_ids)
    )
  )
);