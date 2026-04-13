ALTER TABLE public.workflow_template_steps ADD COLUMN stage_group TEXT DEFAULT NULL;
ALTER TABLE public.workflow_template_steps ADD COLUMN stage_order INTEGER DEFAULT 0;