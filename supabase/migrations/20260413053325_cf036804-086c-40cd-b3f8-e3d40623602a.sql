
-- 1) Set stage_group / stage_order on existing nodes
UPDATE workflow_template_steps SET stage_group = 'Входные данные', stage_order = 1
WHERE id = 'd1000001-0000-0000-0000-000000000001';

UPDATE workflow_template_steps SET stage_group = 'Досье клиента', stage_order = 2
WHERE id = 'd1000001-0000-0000-0000-000000000010';

UPDATE workflow_template_steps SET stage_group = 'Параллельный анализ', stage_order = 3
WHERE id IN (
  'd1000001-0000-0000-0000-000000000002',
  'd1000001-0000-0000-0000-000000000003',
  'd1000001-0000-0000-0000-000000000004',
  'd1000001-0000-0000-0000-000000000005'
);

UPDATE workflow_template_steps SET stage_group = 'Финализация', stage_order = 4
WHERE id = 'd1000001-0000-0000-0000-000000000006';

-- 2) Insert quality_check node: Проверка досье (between Досье and parallel analysis)
INSERT INTO workflow_template_steps (
  id, template_id, step_order, name, description, node_type,
  position_x, position_y, stage_group, stage_order,
  is_user_editable, auto_run, require_approval
) VALUES (
  'd1000001-0000-0000-0000-000000000011',
  'c1000001-0000-0000-0000-000000000001',
  8, 'Проверка досье',
  'Автоматическая проверка качества и полноты собранного досье перед запуском параллельного анализа.',
  'quality_check',
  200, 350, 'Досье клиента', 2,
  false, true, false
);

-- 3) Insert quality_check node: Проверка анализов (between parallel analysis and Итог)
INSERT INTO workflow_template_steps (
  id, template_id, step_order, name, description, node_type,
  position_x, position_y, stage_group, stage_order,
  is_user_editable, auto_run, require_approval
) VALUES (
  'd1000001-0000-0000-0000-000000000012',
  'c1000001-0000-0000-0000-000000000001',
  9, 'Проверка анализов',
  'Проверка полноты и качества результатов всех параллельных анализов перед формированием итогового КП.',
  'quality_check',
  200, 750, 'Финализация', 4,
  false, true, false
);

-- 4) Rewire edges: Досье -> QC_досье -> parallel agents (instead of Досье -> parallel)
-- Remove old edges from Досье to parallel agents
DELETE FROM workflow_template_edges WHERE id IN (
  '87f93ae2-85cf-402b-9ca1-cc08b8932498',
  '669664ce-057e-42d8-9d49-004f99ebc715',
  '95e5c5ba-ed26-4657-bd75-0ab2e8ab14c0',
  '97ec0f1c-95aa-4a3f-af5a-02e1d02c12d7'
);

-- Досье -> Проверка досье
INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, mapping, conditions)
VALUES (
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000010',
  'd1000001-0000-0000-0000-000000000011',
  '[]'::jsonb, '[]'::jsonb
);

-- Проверка досье -> each parallel agent
INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, mapping, conditions)
VALUES
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000011', 'd1000001-0000-0000-0000-000000000002', '[]'::jsonb, '[]'::jsonb),
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000011', 'd1000001-0000-0000-0000-000000000003', '[]'::jsonb, '[]'::jsonb),
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000011', 'd1000001-0000-0000-0000-000000000004', '[]'::jsonb, '[]'::jsonb),
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000011', 'd1000001-0000-0000-0000-000000000005', '[]'::jsonb, '[]'::jsonb);

-- 5) Rewire edges: parallel agents -> QC_анализов -> Итог (instead of parallel -> Итог)
-- Remove old edges from parallel agents to Итог
DELETE FROM workflow_template_edges WHERE id IN (
  '4b7aad55-8dc2-4ab4-bd4f-5b95c82c59f8',
  '5eb46655-d9f0-462c-b95a-aff77940c15a',
  'b98d3f61-ee22-4378-a928-369ea92389f4',
  '9c174fd1-7e83-4608-ac0b-fb8ec0144ec4'
);

-- Each parallel agent -> Проверка анализов
INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, mapping, conditions)
VALUES
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000002', 'd1000001-0000-0000-0000-000000000012', '[]'::jsonb, '[]'::jsonb),
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000003', 'd1000001-0000-0000-0000-000000000012', '[]'::jsonb, '[]'::jsonb),
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000004', 'd1000001-0000-0000-0000-000000000012', '[]'::jsonb, '[]'::jsonb),
  ('c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000005', 'd1000001-0000-0000-0000-000000000012', '[]'::jsonb, '[]'::jsonb);

-- Проверка анализов -> Итоговое КП
INSERT INTO workflow_template_edges (template_id, source_node_id, target_node_id, mapping, conditions)
VALUES (
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000012',
  'd1000001-0000-0000-0000-000000000006',
  '[]'::jsonb, '[]'::jsonb
);
