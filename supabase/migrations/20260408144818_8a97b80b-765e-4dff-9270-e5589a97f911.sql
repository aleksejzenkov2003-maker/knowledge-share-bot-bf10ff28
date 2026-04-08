-- Remove duplicate edges, keep only one per (template, source, target)
DELETE FROM public.workflow_template_edges a
USING public.workflow_template_edges b
WHERE a.id > b.id
  AND a.template_id = b.template_id
  AND a.source_node_id = b.source_node_id
  AND a.target_node_id = b.target_node_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_workflow_template_edges_unique
ON public.workflow_template_edges (template_id, source_node_id, target_node_id);