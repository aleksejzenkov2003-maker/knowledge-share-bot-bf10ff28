-- Add visual editor fields to workflow_template_steps
ALTER TABLE public.workflow_template_steps
  ADD COLUMN IF NOT EXISTS prompt_override text,
  ADD COLUMN IF NOT EXISTS position_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_y double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS node_type text NOT NULL DEFAULT 'agent';

-- Update existing seed data positions for better layout
UPDATE public.workflow_template_steps SET position_x = 0, position_y = 0, node_type = 'input' WHERE step_order = 1;
UPDATE public.workflow_template_steps SET position_x = 300, position_y = 0, node_type = 'agent' WHERE step_order = 2;
UPDATE public.workflow_template_steps SET position_x = 600, position_y = 0, node_type = 'agent' WHERE step_order = 3;
UPDATE public.workflow_template_steps SET position_x = 900, position_y = 0, node_type = 'agent' WHERE step_order = 4;
UPDATE public.workflow_template_steps SET position_x = 1200, position_y = 0, node_type = 'agent' WHERE step_order = 5;
UPDATE public.workflow_template_steps SET position_x = 1500, position_y = 0, node_type = 'output' WHERE step_order = 6;