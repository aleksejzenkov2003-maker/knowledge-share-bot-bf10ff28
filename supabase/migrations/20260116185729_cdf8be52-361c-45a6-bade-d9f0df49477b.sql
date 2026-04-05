-- Create document_folders table for hierarchical folder structure
CREATE TABLE public.document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.document_folders(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  folder_type TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug, parent_id)
);

-- Add folder_id to documents table
ALTER TABLE public.documents 
ADD COLUMN folder_id UUID REFERENCES public.document_folders(id) ON DELETE SET NULL;

-- Create chat_roles table for chat roles/bots
CREATE TABLE public.chat_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  system_prompt_id UUID REFERENCES public.system_prompts(id) ON DELETE SET NULL,
  folder_ids UUID[] DEFAULT '{}',
  model_config JSONB DEFAULT '{}',
  is_project_mode BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_folders
CREATE POLICY "Admins can manage folders"
ON public.document_folders
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Users can view folders in their department or public"
ON public.document_folders
FOR SELECT
USING (
  is_admin() 
  OR has_role(auth.uid(), 'moderator'::app_role) 
  OR department_id IS NULL 
  OR department_id = get_user_department(auth.uid())
);

-- RLS policies for chat_roles
CREATE POLICY "Admins can manage chat roles"
ON public.chat_roles
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Users can view active roles in their department"
ON public.chat_roles
FOR SELECT
USING (
  is_admin() 
  OR has_role(auth.uid(), 'moderator'::app_role) 
  OR (is_active = true AND (department_id IS NULL OR department_id = get_user_department(auth.uid())))
);

-- Add triggers for updated_at
CREATE TRIGGER update_document_folders_updated_at
BEFORE UPDATE ON public.document_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_roles_updated_at
BEFORE UPDATE ON public.chat_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster folder lookups
CREATE INDEX idx_document_folders_parent_id ON public.document_folders(parent_id);
CREATE INDEX idx_document_folders_department_id ON public.document_folders(department_id);
CREATE INDEX idx_documents_folder_id ON public.documents(folder_id);
CREATE INDEX idx_chat_roles_department_id ON public.chat_roles(department_id);