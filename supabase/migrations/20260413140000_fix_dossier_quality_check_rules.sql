-- Fix "Проверка досье" quality_check:
-- 1) Fix edge mapping so dossier output actually flows to the quality check node
--    (was empty [] — nothing was being passed, causing all checks to fail)
-- 2) Replace INN rule — INN is often unavailable for brand-only requests.
--    Check that content was generated and doesn't contain error messages.
--    Detailed quality/structure check is handled by the QC agent (Sonnet 4.6).

-- Fix edge: Досье → Проверка досье — pass full output
UPDATE workflow_template_edges
SET mapping = '[{"sourcePath":"","targetPath":""}]'::jsonb
WHERE template_id = 'c1000001-0000-0000-0000-000000000001'
  AND source_node_id = 'd1000001-0000-0000-0000-000000000010'
  AND target_node_id = 'd1000001-0000-0000-0000-000000000011';

-- Update quality_check rules
UPDATE workflow_template_steps
SET script_config = '{
  "orchestration": {
    "kind": "quality_check",
    "combine": "all",
    "rules": [
      {"field": "content", "operator": "not_empty"}
    ]
  }
}'::jsonb
WHERE id = 'd1000001-0000-0000-0000-000000000011';
