ALTER TABLE public.workflow_template_steps
ADD COLUMN IF NOT EXISTS script_config jsonb DEFAULT '{}'::jsonb;