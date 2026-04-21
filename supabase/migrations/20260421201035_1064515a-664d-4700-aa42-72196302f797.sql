-- Fix layout & missing edges for "Отказы по ТЗ" template
WITH pos(node_key, x, y) AS (VALUES
  ('input',                  50,    300),
  ('intake',                 400,   220),
  ('qc_intake',              400,   400),
  ('oa_parse',               750,   220),
  ('qc_formal',              750,   400),
  ('applicant_profile',      1100,  120),
  ('designation_scope',      1100,  320),
  ('grounds_classifier',     1450,  220),
  ('cited_marks_dossier',    1800,  60),
  ('protectability',         1800,  240),
  ('similarity',             1800,  420),
  ('cited_status',           1800,  600),
  ('qc_qualification',       2150,  330),
  ('case_law',               2500,  180),
  ('legal_blocks',           2500,  400),
  ('qc_argumentation',       2850,  290),
  ('strategy',               3200,  290),
  ('internal_opinion',       3550,  180),
  ('rospatent_objection',    3550,  400),
  ('final_result',           3900,  290)
)
UPDATE workflow_template_steps s
SET position_x = pos.x, position_y = pos.y
FROM pos
WHERE s.template_id = '87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
  AND s.node_key = pos.node_key;

INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, source_handle)
SELECT '87cb82c1-6e59-4c7a-93f4-449e0a80c52f',
       (SELECT id FROM workflow_template_steps WHERE template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f' AND node_key='applicant_profile'),
       (SELECT id FROM workflow_template_steps WHERE template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f' AND node_key='grounds_classifier'),
       NULL
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_template_edges e
  JOIN workflow_template_steps s1 ON s1.id=e.source_node_id
  JOIN workflow_template_steps s2 ON s2.id=e.target_node_id
  WHERE e.template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
    AND s1.node_key='applicant_profile' AND s2.node_key='grounds_classifier'
);

INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, source_handle)
SELECT '87cb82c1-6e59-4c7a-93f4-449e0a80c52f',
       (SELECT id FROM workflow_template_steps WHERE template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f' AND node_key='designation_scope'),
       (SELECT id FROM workflow_template_steps WHERE template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f' AND node_key='grounds_classifier'),
       NULL
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_template_edges e
  JOIN workflow_template_steps s1 ON s1.id=e.source_node_id
  JOIN workflow_template_steps s2 ON s2.id=e.target_node_id
  WHERE e.template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
    AND s1.node_key='designation_scope' AND s2.node_key='grounds_classifier'
);

INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, source_handle)
SELECT '87cb82c1-6e59-4c7a-93f4-449e0a80c52f',
       (SELECT id FROM workflow_template_steps WHERE template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f' AND node_key='qc_formal'),
       (SELECT id FROM workflow_template_steps WHERE template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f' AND node_key='designation_scope'),
       'branch_pass'
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_template_edges e
  JOIN workflow_template_steps s1 ON s1.id=e.source_node_id
  JOIN workflow_template_steps s2 ON s2.id=e.target_node_id
  WHERE e.template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
    AND s1.node_key='qc_formal' AND s2.node_key='designation_scope'
);

DELETE FROM workflow_template_edges e
USING workflow_template_steps s1, workflow_template_steps s2
WHERE e.template_id='87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
  AND e.source_node_id=s1.id AND e.target_node_id=s2.id
  AND s1.node_key='grounds_classifier' AND s2.node_key='designation_scope';

UPDATE workflow_templates
SET version = COALESCE(version,1) + 1, updated_at = now()
WHERE id = '87cb82c1-6e59-4c7a-93f4-449e0a80c52f';