
-- Enum для статуса workflow
CREATE TYPE public.workflow_status AS ENUM ('draft', 'running', 'paused', 'completed');

-- Enum для статуса шага workflow
CREATE TYPE public.workflow_step_status AS ENUM ('pending', 'running', 'completed', 'error', 'skipped');

-- Шаблоны рабочих цепочек
CREATE TABLE public.workflow_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Шаги шаблона
CREATE TABLE public.workflow_template_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_id UUID REFERENCES public.chat_roles(id),
  input_schema JSONB DEFAULT '{}'::jsonb,
  output_schema JSONB DEFAULT '{}'::jsonb,
  is_user_editable BOOLEAN NOT NULL DEFAULT true,
  auto_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, step_order)
);

-- Запущенный workflow в проекте
CREATE TABLE public.project_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id),
  status workflow_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Конкретные шаги запущенного workflow
CREATE TABLE public.project_workflow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.project_workflows(id) ON DELETE CASCADE,
  template_step_id UUID REFERENCES public.workflow_template_steps(id),
  step_order INTEGER NOT NULL,
  status workflow_step_status NOT NULL DEFAULT 'pending',
  agent_id UUID REFERENCES public.chat_roles(id),
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  user_edits JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Чат-лог внутри шага
CREATE TABLE public.project_step_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.project_workflow_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  message_role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX idx_workflow_template_steps_template ON public.workflow_template_steps(template_id);
CREATE INDEX idx_project_workflows_project ON public.project_workflows(project_id);
CREATE INDEX idx_project_workflow_steps_workflow ON public.project_workflow_steps(workflow_id);
CREATE INDEX idx_project_step_messages_step ON public.project_step_messages(step_id);

-- Триггеры updated_at
CREATE TRIGGER update_workflow_templates_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_step_messages ENABLE ROW LEVEL SECURITY;

-- workflow_templates: админы управляют, все аутентифицированные видят активные
CREATE POLICY "Admins can manage workflow templates"
  ON public.workflow_templates FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users can view active workflow templates"
  ON public.workflow_templates FOR SELECT TO authenticated
  USING (is_active = true);

-- workflow_template_steps: админы управляют, все видят шаги активных шаблонов
CREATE POLICY "Admins can manage workflow template steps"
  ON public.workflow_template_steps FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users can view template steps"
  ON public.workflow_template_steps FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_templates wt
    WHERE wt.id = template_id AND wt.is_active = true
  ));

-- project_workflows: админы полный доступ, участники проекта видят и управляют
CREATE POLICY "Admins can manage project workflows"
  ON public.project_workflows FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Members can view project workflows"
  ON public.project_workflows FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Members can create project workflows"
  ON public.project_workflows FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member')
  );

CREATE POLICY "Members can update project workflows"
  ON public.project_workflows FOR UPDATE
  USING (get_project_member_role(project_id, auth.uid()) IN ('owner', 'admin', 'member'));

-- project_workflow_steps: через workflow → project
CREATE POLICY "Admins can manage workflow steps"
  ON public.project_workflow_steps FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Members can view workflow steps"
  ON public.project_workflow_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_workflows pw
    WHERE pw.id = workflow_id AND is_project_member(pw.project_id, auth.uid())
  ));

CREATE POLICY "Members can update workflow steps"
  ON public.project_workflow_steps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.project_workflows pw
    WHERE pw.id = workflow_id
    AND get_project_member_role(pw.project_id, auth.uid()) IN ('owner', 'admin', 'member')
  ));

CREATE POLICY "Members can insert workflow steps"
  ON public.project_workflow_steps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_workflows pw
    WHERE pw.id = workflow_id
    AND get_project_member_role(pw.project_id, auth.uid()) IN ('owner', 'admin', 'member')
  ));

-- project_step_messages: через step → workflow → project
CREATE POLICY "Admins can manage step messages"
  ON public.project_step_messages FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Members can view step messages"
  ON public.project_step_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_workflow_steps pws
    JOIN public.project_workflows pw ON pw.id = pws.workflow_id
    WHERE pws.id = step_id AND is_project_member(pw.project_id, auth.uid())
  ));

CREATE POLICY "Members can send step messages"
  ON public.project_step_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_workflow_steps pws
      JOIN public.project_workflows pw ON pw.id = pws.workflow_id
      WHERE pws.id = step_id
      AND get_project_member_role(pw.project_id, auth.uid()) IN ('owner', 'admin', 'member')
    )
  );
