
-- Create workflow_artifacts table
CREATE TABLE public.workflow_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.project_workflows(id) ON DELETE SET NULL,
  project_workflow_step_id UUID REFERENCES public.project_workflow_steps(id) ON DELETE SET NULL,
  artifact_type TEXT NOT NULL DEFAULT 'file',
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_artifacts ENABLE ROW LEVEL SECURITY;

-- Members of the project can view artifacts
CREATE POLICY "Project members can view artifacts"
  ON public.workflow_artifacts
  FOR SELECT
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- Members of the project can insert artifacts
CREATE POLICY "Project members can insert artifacts"
  ON public.workflow_artifacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

-- Members of the project can delete artifacts
CREATE POLICY "Project members can delete artifacts"
  ON public.workflow_artifacts
  FOR DELETE
  TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- Create storage bucket for generated documents
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-documents', 'generated-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for generated-documents bucket
CREATE POLICY "Project members can upload generated docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-documents');

CREATE POLICY "Project members can read generated docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generated-documents');

-- Index for fast lookups
CREATE INDEX idx_workflow_artifacts_workflow ON public.workflow_artifacts(workflow_run_id);
CREATE INDEX idx_workflow_artifacts_project ON public.workflow_artifacts(project_id);
