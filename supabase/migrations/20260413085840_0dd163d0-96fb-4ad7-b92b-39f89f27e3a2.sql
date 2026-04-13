
-- Add stage grouping columns to workflow_template_steps
ALTER TABLE public.workflow_template_steps
  ADD COLUMN IF NOT EXISTS stage_group TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage_order INT DEFAULT 0;

COMMENT ON COLUMN public.workflow_template_steps.stage_group IS 'Steps sharing the same stage_group value are displayed as one stage in the stepper UI';
COMMENT ON COLUMN public.workflow_template_steps.stage_order IS 'Controls the ordering of stages in the stepper (lower = earlier)';
