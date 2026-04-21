
-- 1) Переписываем script_config QC-узлов в формат { orchestration: { kind:'quality_check', combine:'all', rules:[{field, operator, value}] } }

UPDATE workflow_template_steps SET script_config = jsonb_build_object(
  'orchestration', jsonb_build_object(
    'kind', 'quality_check',
    'combine', 'all',
    'rules', jsonb_build_array(
      jsonb_build_object('field','output.intake_complete','operator','eq','value', true),
      jsonb_build_object('field','output.ocr_quality','operator','gte','value', 0.7)
    )
  ),
  'escalations', jsonb_build_array(
    jsonb_build_object('field','output.ocr_quality','operator','lt','value',0.7,'escalate_to','intake','reason','ocr_quality<0.7')
  )
) WHERE id = 'c4000001-0000-0000-0000-000000000003';

UPDATE workflow_template_steps SET script_config = jsonb_build_object(
  'orchestration', jsonb_build_object(
    'kind','quality_check','combine','all',
    'rules', jsonb_build_array(
      jsonb_build_object('field','output.deadline','operator','not_empty'),
      jsonb_build_object('field','output.procedural_anomalies','operator','falsy')
    )
  ),
  'escalations', jsonb_build_array(
    jsonb_build_object('field','output.procedural_anomalies','operator','truthy','escalate_to','oa_parse','reason','procedural_anomalies=true')
  )
) WHERE id = 'c4000001-0000-0000-0000-000000000005';

UPDATE workflow_template_steps SET script_config = jsonb_build_object(
  'orchestration', jsonb_build_object(
    'kind','quality_check','combine','all',
    'rules', jsonb_build_array(
      jsonb_build_object('field','output.classification_confidence','operator','gte','value',0.6),
      jsonb_build_object('field','output.cited_marks','operator','not_empty')
    )
  ),
  'escalations', jsonb_build_array(
    jsonb_build_object('field','output.classification_confidence','operator','lt','value',0.6,'escalate_to','grounds_classifier','reason','classification_confidence<0.6'),
    jsonb_build_object('field','output.cited_marks','operator','empty','escalate_to','cited_marks_dossier','reason','cited_marks_data=missing')
  )
) WHERE id = 'c4000001-0000-0000-0000-00000000000c';

UPDATE workflow_template_steps SET script_config = jsonb_build_object(
  'orchestration', jsonb_build_object(
    'kind','quality_check','combine','all',
    'rules', jsonb_build_array(
      jsonb_build_object('field','output.blocks','operator','not_empty'),
      jsonb_build_object('field','output.evidence_strength','operator','neq','value','low'),
      jsonb_build_object('field','output.practice_conflict','operator','falsy'),
      jsonb_build_object('field','input.client_priorities','operator','not_empty')
    )
  ),
  'escalations', jsonb_build_array(
    jsonb_build_object('field','output.evidence_strength','operator','eq','value','low','escalate_to','legal_blocks','reason','evidence_strength=low'),
    jsonb_build_object('field','output.practice_conflict','operator','truthy','escalate_to','final_result','reason','practice_conflict=true'),
    jsonb_build_object('field','input.client_priorities','operator','empty','escalate_to','strategy','reason','client_priorities=missing')
  )
) WHERE id = 'c4000001-0000-0000-0000-00000000000f';

-- 2) Помечаем существующие исходящие связи QC-узлов как branch_pass (зелёная "Ок")
UPDATE workflow_template_edges
SET source_handle = 'branch_pass'
WHERE template_id = '87cb82c1-6e59-4c7a-93f4-449e0a80c52f'
  AND source_node_id IN (
    'c4000001-0000-0000-0000-000000000003',
    'c4000001-0000-0000-0000-000000000005',
    'c4000001-0000-0000-0000-00000000000c',
    'c4000001-0000-0000-0000-00000000000f'
  )
  AND (source_handle IS NULL OR source_handle = '');

-- 3) Бамп версии шаблона
UPDATE workflow_templates
SET version = COALESCE(version,1) + 1, updated_at = now()
WHERE id = '87cb82c1-6e59-4c7a-93f4-449e0a80c52f';
