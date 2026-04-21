UPDATE workflow_template_steps
SET script_config = jsonb_set(
  script_config,
  '{orchestration,rules}',
  '[{"field":"qc.qc_passed","operator":"eq","value":true}]'::jsonb
)
WHERE template_id = '87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
  AND node_type = 'quality_check';

UPDATE workflow_templates
SET version = COALESCE(version, 1) + 1,
    updated_at = now()
WHERE id = '87cb82c1-6e59-4c7a-93f4-449e0a80c52f';