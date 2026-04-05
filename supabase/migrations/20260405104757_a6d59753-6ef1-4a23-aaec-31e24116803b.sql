
-- 1. Add missing columns to workflow_templates
ALTER TABLE public.workflow_templates 
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS schema jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Add missing columns to workflow_template_steps
ALTER TABLE public.workflow_template_steps
  ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS temperature real,
  ADD COLUMN IF NOT EXISTS tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS form_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_mode text NOT NULL DEFAULT 'replace',
  ADD COLUMN IF NOT EXISTS node_key text,
  ADD COLUMN IF NOT EXISTS result_assembly_mode text,
  ADD COLUMN IF NOT EXISTS result_template_id uuid;

-- 3. Add missing columns to project_workflows
ALTER TABLE public.project_workflows
  ADD COLUMN IF NOT EXISTS template_version_snapshot integer;

-- 4. Add missing columns to project_workflow_steps
ALTER TABLE public.project_workflow_steps
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS raw_output jsonb,
  ADD COLUMN IF NOT EXISTS user_edited_output jsonb,
  ADD COLUMN IF NOT EXISTS approved_output jsonb,
  ADD COLUMN IF NOT EXISTS human_readable_output jsonb;

-- 5. Create workflow_template_edges table
CREATE TABLE IF NOT EXISTS public.workflow_template_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.workflow_template_steps(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.workflow_template_steps(id) ON DELETE CASCADE,
  source_handle text,
  target_handle text,
  mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_template_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read template edges"
  ON public.workflow_template_edges FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage template edges"
  ON public.workflow_template_edges FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. Create workflow_event_logs table
CREATE TABLE IF NOT EXISTS public.workflow_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_run_id uuid NOT NULL REFERENCES public.project_workflows(id) ON DELETE CASCADE,
  project_workflow_step_id uuid REFERENCES public.project_workflow_steps(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can read event logs"
  ON public.workflow_event_logs FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()) OR public.is_admin());

CREATE POLICY "Authenticated users can insert event logs"
  ON public.workflow_event_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()) OR public.is_admin());

-- 7. Create script_definitions table
CREATE TABLE IF NOT EXISTS public.script_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  runtime text NOT NULL DEFAULT 'supabase_edge_function',
  entrypoint text NOT NULL,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_timeout_sec integer NOT NULL DEFAULT 60,
  default_retries integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.script_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read script definitions"
  ON public.script_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage script definitions"
  ON public.script_definitions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. Seed default scripts
INSERT INTO public.script_definitions (script_key, name, entrypoint, description) VALUES
  ('process-document', 'Обработка документа', 'process-document', 'Извлечение текста и создание чанков из PDF/DOCX'),
  ('fips-parse', 'Парсинг ФИПС', 'fips-parse', 'Парсинг данных товарного знака из реестра ФИПС'),
  ('reputation-api', 'API репутации', 'reputation-api', 'Получение данных о репутации компании'),
  ('reputation-web-search', 'Веб-поиск репутации', 'reputation-web-search', 'Поиск упоминаний компании в интернете'),
  ('rerank-chunks', 'Ре-ранкинг чанков', 'rerank-chunks', 'Переранжирование релевантных чанков документов')
ON CONFLICT (script_key) DO NOTHING;

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_template_edges_template ON public.workflow_template_edges(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_logs_project ON public.workflow_event_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_logs_run ON public.workflow_event_logs(workflow_run_id);
