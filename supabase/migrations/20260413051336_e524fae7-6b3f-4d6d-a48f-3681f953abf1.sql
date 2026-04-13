
-- Create project_folders table
CREATE TABLE public.project_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

-- Policies for project_folders
CREATE POLICY "Authenticated users can view project folders"
ON public.project_folders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create project folders"
ON public.project_folders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update project folders"
ON public.project_folders FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete project folders"
ON public.project_folders FOR DELETE TO authenticated USING (true);

-- Add folder_id to projects
ALTER TABLE public.projects ADD COLUMN folder_id UUID REFERENCES public.project_folders(id) ON DELETE SET NULL;
