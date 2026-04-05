-- Workflow Constructor v2: graph edges, versioning, registries, artifacts, layered outputs

-- Template lifecycle (draft / published / archived) — separate from is_active
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (template_status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS schema JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Existing templates behave as published for backward compatibility
UPDATE public.workflow_templates SET template_status = 'published';

-- Rich step config
ALTER TABLE public.workflow_template_steps
  ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(5,2) DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS form_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_mode TEXT NOT NULL DEFAULT 'structured_json',
  ADD COLUMN IF NOT EXISTS node_key TEXT,
  ADD COLUMN IF NOT EXISTS result_assembly_mode TEXT DEFAULT 'ai_summary',
  ADD COLUMN IF NOT EXISTS result_template_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_template_steps_node_key_unique
  ON public.workflow_template_steps (template_id, node_key)
  WHERE node_key IS NOT NULL AND node_key <> '';

-- Edges between template steps
CREATE TABLE IF NOT EXISTS public.workflow_template_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES public.workflow_template_steps(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.workflow_template_steps(id) ON DELETE CASCADE,
  source_handle TEXT,
  target_handle TEXT,
  mapping JSONB NOT NULL DEFAULT '[]'::jsonb,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflow_template_edges_no_self CHECK (source_node_id <> target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_template_edges_template
  ON public.workflow_template_edges(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_template_edges_source
  ON public.workflow_template_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_template_edges_target
  ON public.workflow_template_edges(target_node_id);

-- Runtime: layered outputs + attempt counter
ALTER TABLE public.project_workflow_steps
  ADD COLUMN IF NOT EXISTS raw_output JSONB,
  ADD COLUMN IF NOT EXISTS user_edited_output JSONB,
  ADD COLUMN IF NOT EXISTS approved_output JSONB,
  ADD COLUMN IF NOT EXISTS human_readable_output JSONB,
  ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.project_workflows
  ADD COLUMN IF NOT EXISTS template_version_snapshot INTEGER;

-- Step status: waiting for user approval / input
ALTER TYPE public.workflow_step_status ADD VALUE IF NOT EXISTS 'waiting_for_user';

-- Agent / script registries (templates for editor)
CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_model TEXT,
  system_prompt TEXT,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_agent_definitions_updated_at
  BEFORE UPDATE ON public.agent_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.script_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  runtime TEXT NOT NULL DEFAULT 'supabase_edge_function',
  entrypoint TEXT NOT NULL,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_timeout_sec INTEGER NOT NULL DEFAULT 60,
  default_retries INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_script_definitions_updated_at
  BEFORE UPDATE ON public.script_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Artifacts produced by workflow steps
CREATE TABLE IF NOT EXISTS public.workflow_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.project_workflows(id) ON DELETE SET NULL,
  project_workflow_step_id UUID REFERENCES public.project_workflow_steps(id) ON DELETE SET NULL,
  artifact_type TEXT NOT NULL DEFAULT 'file',
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_project ON public.workflow_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_step ON public.workflow_artifacts(project_workflow_step_id);

-- Audit / orchestration events
CREATE TABLE IF NOT EXISTS public.workflow_event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.project_workflows(id) ON DELETE CASCADE,
  project_workflow_step_id UUID REFERENCES public.project_workflow_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_event_logs_project ON public.workflow_event_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_logs_workflow ON public.workflow_event_logs(workflow_run_id);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('node-artifacts', 'node-artifacts', false),
  ('generated-documents', 'generated-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: new tables
ALTER TABLE public.workflow_template_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_event_logs ENABLE ROW LEVEL SECURITY;

-- Edges: same visibility as template steps (active templates readable by all authenticated)
CREATE POLICY "Admins manage workflow template edges"
  ON public.workflow_template_edges FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users view edges for active templates"
  ON public.workflow_template_edges FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_templates wt
    WHERE wt.id = template_id AND wt.is_active = true
  ));

-- Definitions: read all authenticated, write admins
CREATE POLICY "Authenticated read agent_definitions"
  ON public.agent_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage agent_definitions"
  ON public.agent_definitions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated read script_definitions"
  ON public.script_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage script_definitions"
  ON public.script_definitions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Artifacts: project members
CREATE POLICY "Admins manage workflow_artifacts"
  ON public.workflow_artifacts FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Members view workflow_artifacts"
  ON public.workflow_artifacts FOR SELECT TO authenticated
  USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Members insert workflow_artifacts"
  ON public.workflow_artifacts FOR INSERT TO authenticated
  WITH CHECK (
    is_project_member(project_id, auth.uid())
    AND get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
  );

CREATE POLICY "Members update workflow_artifacts"
  ON public.workflow_artifacts FOR UPDATE TO authenticated
  USING (get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member'));

-- Event logs
CREATE POLICY "Admins manage workflow_event_logs"
  ON public.workflow_event_logs FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Members view workflow_event_logs"
  ON public.workflow_event_logs FOR SELECT TO authenticated
  USING (
    project_id IS NULL
    OR is_project_member(project_id, auth.uid())
  );

CREATE POLICY "Members insert workflow_event_logs"
  ON public.workflow_event_logs FOR INSERT TO authenticated
  WITH CHECK (
    project_id IS NULL
    OR (
      is_project_member(project_id, auth.uid())
      AND get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
    )
  );

-- Storage policies for workflow buckets (path: {project_id}/...)
CREATE POLICY "Members read node-artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'node-artifacts'
    AND is_project_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "Members upload node-artifacts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'node-artifacts'
    AND get_project_member_role((storage.foldername(name))[1]::uuid, auth.uid()) IN ('owner', 'admin', 'member')
  );

CREATE POLICY "Members read generated-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'generated-documents'
    AND is_project_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "Members upload generated-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'generated-documents'
    AND get_project_member_role((storage.foldername(name))[1]::uuid, auth.uid()) IN ('owner', 'admin', 'member')
  );

-- Seed script registry (idempotent)
INSERT INTO public.script_definitions (script_key, name, description, runtime, entrypoint, input_schema, output_schema)
VALUES
  ('normalize_tm_input', 'Нормализация входа ТЗ', 'Нормализация полей кейса ТЗ', 'supabase_edge_function', 'process-document', '{}', '{}'),
  ('extract_text_from_attachment', 'Извлечение текста', 'Текст из вложений', 'supabase_edge_function', 'process-document', '{}', '{}'),
  ('fetch_registry_data', 'Данные реестра', 'Вызов FIPS', 'supabase_edge_function', 'fips-parse', '{}', '{}'),
  ('render_offer_pdf', 'PDF КП', 'Рендер PDF коммерческого предложения', 'supabase_edge_function', 'process-document', '{}', '{}'),
  ('merge_search_results', 'Слияние поиска', 'Объединение результатов поиска', 'supabase_edge_function', 'reputation-web-search', '{}', '{}')
ON CONFLICT (script_key) DO NOTHING;
