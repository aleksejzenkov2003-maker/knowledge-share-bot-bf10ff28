
-- 1. Mark "КП по товарному знаку" as preset
UPDATE public.workflow_templates
SET is_preset = true
WHERE id = 'c1000001-0000-0000-0000-000000000001';

-- 2. Skeleton: Простой процесс
INSERT INTO public.workflow_templates (id, name, description, is_active, is_preset, version, template_status, schema, created_by)
VALUES (
  'c1000002-0000-0000-0000-000000000002',
  'Простой процесс (скелет)',
  'Минимальный шаблон: ввод → AI агент → итог. Стартовая точка для простых задач с одним агентом.',
  true, true, 1, 'published',
  jsonb_build_object('entryNodeIds', jsonb_build_array('c1000002-0000-0000-0000-000000000a01')),
  NULL
) ON CONFLICT (id) DO UPDATE SET
  is_preset = EXCLUDED.is_preset,
  description = EXCLUDED.description,
  template_status = EXCLUDED.template_status,
  schema = EXCLUDED.schema;

DELETE FROM public.workflow_template_edges WHERE template_id = 'c1000002-0000-0000-0000-000000000002';
DELETE FROM public.workflow_template_steps WHERE template_id = 'c1000002-0000-0000-0000-000000000002';

INSERT INTO public.workflow_template_steps (id, template_id, step_order, name, description, node_type, node_key, position_x, position_y, form_config, is_user_editable, auto_run)
VALUES
  ('c1000002-0000-0000-0000-000000000a01','c1000002-0000-0000-0000-000000000002',1,'Старт','Ввод задачи от пользователя','input','start',100,200,
    jsonb_build_object('fields', jsonb_build_array(jsonb_build_object('key','task','type','textarea','label','Что нужно сделать?','required',true,'placeholder','Опишите задачу...')), 'editableByUser', true, 'autoStart', false),
    true, false),
  ('c1000002-0000-0000-0000-000000000a02','c1000002-0000-0000-0000-000000000002',2,'AI Агент','Выполнение задачи (выберите агента после копирования)','agent','agent',450,200,'{}'::jsonb, true, true),
  ('c1000002-0000-0000-0000-000000000a03','c1000002-0000-0000-0000-000000000002',3,'Итог','Финальный результат','output','result',800,200,'{}'::jsonb, true, true);

INSERT INTO public.workflow_template_edges (template_id, source_node_id, target_node_id, mapping)
VALUES
  ('c1000002-0000-0000-0000-000000000002','c1000002-0000-0000-0000-000000000a01','c1000002-0000-0000-0000-000000000a02',
    jsonb_build_array(jsonb_build_object('sourcePath','task','targetPath','task','transform','passthrough'))),
  ('c1000002-0000-0000-0000-000000000002','c1000002-0000-0000-0000-000000000a02','c1000002-0000-0000-0000-000000000a03',
    jsonb_build_array(jsonb_build_object('sourcePath','*','targetPath','result','transform','passthrough')));

-- 3. Skeleton: с проверкой качества
INSERT INTO public.workflow_templates (id, name, description, is_active, is_preset, version, template_status, schema, created_by)
VALUES (
  'c1000003-0000-0000-0000-000000000003',
  'Процесс с проверкой качества (скелет)',
  'Шаблон с автоматической проверкой результата: ввод → агент → quality check → итог.',
  true, true, 1, 'published',
  jsonb_build_object('entryNodeIds', jsonb_build_array('c1000003-0000-0000-0000-000000000b01')),
  NULL
) ON CONFLICT (id) DO UPDATE SET
  is_preset = EXCLUDED.is_preset,
  description = EXCLUDED.description,
  template_status = EXCLUDED.template_status,
  schema = EXCLUDED.schema;

DELETE FROM public.workflow_template_edges WHERE template_id = 'c1000003-0000-0000-0000-000000000003';
DELETE FROM public.workflow_template_steps WHERE template_id = 'c1000003-0000-0000-0000-000000000003';

INSERT INTO public.workflow_template_steps (id, template_id, step_order, name, description, node_type, node_key, position_x, position_y, form_config, script_config, is_user_editable, auto_run)
VALUES
  ('c1000003-0000-0000-0000-000000000b01','c1000003-0000-0000-0000-000000000003',1,'Старт','Ввод задачи','input','start',100,200,
    jsonb_build_object('fields', jsonb_build_array(jsonb_build_object('key','task','type','textarea','label','Задача','required',true,'placeholder','Опишите задачу...')), 'editableByUser', true, 'autoStart', false),
    '{}'::jsonb, true, false),
  ('c1000003-0000-0000-0000-000000000b02','c1000003-0000-0000-0000-000000000003',2,'AI Агент','Выполнение задачи (выберите агента)','agent','agent',400,200,'{}'::jsonb,'{}'::jsonb, true, true),
  ('c1000003-0000-0000-0000-000000000b03','c1000003-0000-0000-0000-000000000003',3,'Проверка качества','Автоматическая проверка результата по правилам','quality_check','qc',700,200,'{}'::jsonb,
    jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('type','not_empty','field','*','message','Результат не должен быть пустым'))),
    true, true),
  ('c1000003-0000-0000-0000-000000000b04','c1000003-0000-0000-0000-000000000003',4,'Итог','Финальный результат','output','result',1000,200,'{}'::jsonb,'{}'::jsonb, true, true);

INSERT INTO public.workflow_template_edges (template_id, source_node_id, target_node_id, mapping)
VALUES
  ('c1000003-0000-0000-0000-000000000003','c1000003-0000-0000-0000-000000000b01','c1000003-0000-0000-0000-000000000b02',
    jsonb_build_array(jsonb_build_object('sourcePath','task','targetPath','task','transform','passthrough'))),
  ('c1000003-0000-0000-0000-000000000003','c1000003-0000-0000-0000-000000000b02','c1000003-0000-0000-0000-000000000b03',
    jsonb_build_array(jsonb_build_object('sourcePath','*','targetPath','input','transform','passthrough'))),
  ('c1000003-0000-0000-0000-000000000003','c1000003-0000-0000-0000-000000000b03','c1000003-0000-0000-0000-000000000b04',
    jsonb_build_array(jsonb_build_object('sourcePath','*','targetPath','result','transform','passthrough')));
