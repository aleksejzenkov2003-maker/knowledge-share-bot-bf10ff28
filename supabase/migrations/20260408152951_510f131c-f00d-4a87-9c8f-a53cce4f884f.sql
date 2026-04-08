UPDATE public.project_workflow_steps
SET status = 'error', error_message = 'Edge function timeout'
WHERE id = 'b0ff0475-a28a-4857-8d4e-c87aee67d912' AND status = 'running';