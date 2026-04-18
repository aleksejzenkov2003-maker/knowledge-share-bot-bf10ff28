-- ============================================
-- Phase 2: Workflow Template Presets (Gallery)
--
-- 1) Add is_preset flag + partial index
-- 2) RPC function clone_workflow_template(source_id, new_name, new_owner)
--    – safely clones template + steps + edges, remapping step ids
--    – remaps schema.entryNodeIds to new step ids
-- 3) Mark existing "КП по товарному знаку" template as preset
-- 4) Seed two simple skeleton presets (agent_id is NULL — users fill in)
-- ============================================

-- 1) is_preset column ------------------------------------------------

ALTER TABLE public.workflow_templates
    ADD COLUMN IF NOT EXISTS is_preset BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS workflow_templates_is_preset_idx
    ON public.workflow_templates (is_preset)
    WHERE is_preset = true;

COMMENT ON COLUMN public.workflow_templates.is_preset IS
    'If true — system/gallery preset. Cloned into user-owned drafts via clone_workflow_template().';

-- 2) clone_workflow_template RPC -------------------------------------

CREATE OR REPLACE FUNCTION public.clone_workflow_template(
    source_template_id UUID,
    new_name TEXT DEFAULT NULL,
    new_owner UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_template_id UUID;
    v_source          public.workflow_templates%ROWTYPE;
    v_step_id_map     JSONB := '{}'::jsonb;
    v_old_id          UUID;
    v_new_id          UUID;
    v_entry_old       JSONB;
    v_entry_new       JSONB;
    v_owner           UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can clone workflow templates';
    END IF;

    v_owner := COALESCE(new_owner, auth.uid());

    SELECT * INTO v_source
    FROM public.workflow_templates
    WHERE id = source_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template % not found', source_template_id;
    END IF;

    INSERT INTO public.workflow_templates (
        name, description, created_by, is_active,
        version, template_status, schema, is_preset
    ) VALUES (
        COALESCE(NULLIF(trim(new_name), ''), v_source.name || ' (копия)'),
        v_source.description,
        v_owner,
        true,
        1,
        'draft',
        COALESCE(v_source.schema, '{}'::jsonb),
        false
    )
    RETURNING id INTO v_new_template_id;

    FOR v_old_id IN
        SELECT id
        FROM public.workflow_template_steps
        WHERE template_id = source_template_id
        ORDER BY step_order
    LOOP
        v_new_id := gen_random_uuid();

        INSERT INTO public.workflow_template_steps (
            id, template_id, step_order, name, description, agent_id,
            input_schema, output_schema, is_user_editable, auto_run,
            prompt_override, node_type, position_x, position_y,
            script_config, require_approval, model, temperature,
            tools, form_config, output_mode, node_key,
            result_assembly_mode, result_template_id,
            quality_check_agent_id, stage_group, stage_order
        )
        SELECT
            v_new_id, v_new_template_id, step_order, name, description, agent_id,
            input_schema, output_schema, is_user_editable, auto_run,
            prompt_override, node_type, position_x, position_y,
            script_config, require_approval, model, temperature,
            tools, form_config, output_mode, node_key,
            result_assembly_mode, result_template_id,
            quality_check_agent_id, stage_group, stage_order
        FROM public.workflow_template_steps
        WHERE id = v_old_id;

        v_step_id_map := v_step_id_map
            || jsonb_build_object(v_old_id::text, v_new_id::text);
    END LOOP;

    INSERT INTO public.workflow_template_edges (
        template_id, source_node_id, target_node_id,
        source_handle, target_handle, mapping, conditions
    )
    SELECT
        v_new_template_id,
        (v_step_id_map ->> (source_node_id::text))::uuid,
        (v_step_id_map ->> (target_node_id::text))::uuid,
        source_handle, target_handle, mapping, conditions
    FROM public.workflow_template_edges
    WHERE template_id = source_template_id
      AND v_step_id_map ? (source_node_id::text)
      AND v_step_id_map ? (target_node_id::text);

    v_entry_old := v_source.schema -> 'entryNodeIds';
    IF v_entry_old IS NOT NULL AND jsonb_typeof(v_entry_old) = 'array' THEN
        SELECT COALESCE(jsonb_agg((v_step_id_map ->> e)::text), '[]'::jsonb)
        INTO v_entry_new
        FROM jsonb_array_elements_text(v_entry_old) AS e
        WHERE v_step_id_map ? e;

        UPDATE public.workflow_templates
        SET schema = COALESCE(schema, '{}'::jsonb)
                     || jsonb_build_object('entryNodeIds', COALESCE(v_entry_new, '[]'::jsonb))
        WHERE id = v_new_template_id;
    END IF;

    RETURN v_new_template_id;
END;
$$;

COMMENT ON FUNCTION public.clone_workflow_template(UUID, TEXT, UUID) IS
    'Clone a workflow template (with steps and edges) into a new draft. Admin only.';

GRANT EXECUTE ON FUNCTION public.clone_workflow_template(UUID, TEXT, UUID) TO authenticated;

-- 3) Mark existing KP template as preset -----------------------------

UPDATE public.workflow_templates
SET is_preset = true,
    template_status = CASE
        WHEN template_status = 'archived' THEN template_status
        ELSE 'published'
    END,
    is_active = true
WHERE id = 'c1000001-0000-0000-0000-000000000001'::uuid;

-- 4) Seed skeleton presets -------------------------------------------

-- 4.1 "Простой агент" skeleton: input → agent → output
DO $$
DECLARE
    v_template_id UUID := 'c1000002-0000-0000-0000-000000000002'::uuid;
    v_input_id    UUID := 'c1000002-0001-0000-0000-000000000001'::uuid;
    v_agent_id    UUID := 'c1000002-0001-0000-0000-000000000002'::uuid;
    v_output_id   UUID := 'c1000002-0001-0000-0000-000000000003'::uuid;
BEGIN
    INSERT INTO public.workflow_templates (
        id, name, description, is_active, version,
        template_status, schema, is_preset
    ) VALUES (
        v_template_id,
        'Простой процесс (скелет)',
        'Минимальный шаблон: форма ввода → один AI-агент → итоговый документ. Подходит для старта — настройте агента под свою задачу.',
        true, 1, 'published',
        jsonb_build_object('entryNodeIds', jsonb_build_array(v_input_id::text)),
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_preset = true,
        is_active = true,
        template_status = 'published';

    INSERT INTO public.workflow_template_steps (
        id, template_id, step_order, name, description, node_type,
        agent_id, position_x, position_y, is_user_editable, auto_run,
        require_approval, input_schema, output_schema, tools, form_config,
        output_mode, node_key, stage_order
    ) VALUES
        (v_input_id, v_template_id, 1, 'Старт', 'Форма ввода: опишите задачу для агента.',
         'input', NULL, 80, 120, true, false, false,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
         jsonb_build_object('fields', jsonb_build_array(
             jsonb_build_object('key','query','label','Что нужно сделать?','type','textarea','required',true)
         )),
         'structured_json', 'start', 0),
        (v_agent_id, v_template_id, 2, 'AI Агент', 'Настройте модель и промпт под свою задачу.',
         'agent', NULL, 380, 120, true, false, true,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
         'structured_json', 'agent_main', 0),
        (v_output_id, v_template_id, 3, 'Итог', 'Итоговый результат процесса.',
         'output', NULL, 680, 120, true, false, false,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
         'structured_json', 'result', 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.workflow_template_edges (
        template_id, source_node_id, target_node_id, mapping, conditions
    ) VALUES
        (v_template_id, v_input_id, v_agent_id, '[]'::jsonb, '[]'::jsonb),
        (v_template_id, v_agent_id, v_output_id, '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT (template_id, source_node_id, target_node_id) DO NOTHING;
END $$;

-- 4.2 "С проверкой качества" skeleton: input → agent → quality_check → output
DO $$
DECLARE
    v_template_id UUID := 'c1000003-0000-0000-0000-000000000003'::uuid;
    v_input_id    UUID := 'c1000003-0001-0000-0000-000000000001'::uuid;
    v_agent_id    UUID := 'c1000003-0001-0000-0000-000000000002'::uuid;
    v_qc_id       UUID := 'c1000003-0001-0000-0000-000000000003'::uuid;
    v_output_id   UUID := 'c1000003-0001-0000-0000-000000000004'::uuid;
BEGIN
    INSERT INTO public.workflow_templates (
        id, name, description, is_active, version,
        template_status, schema, is_preset
    ) VALUES (
        v_template_id,
        'Процесс с проверкой качества (скелет)',
        'Ввод → AI-агент → автоматическая проверка результата → итоговый документ. Используйте, когда нужен контроль соответствия требованиям.',
        true, 1, 'published',
        jsonb_build_object('entryNodeIds', jsonb_build_array(v_input_id::text)),
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_preset = true,
        is_active = true,
        template_status = 'published';

    INSERT INTO public.workflow_template_steps (
        id, template_id, step_order, name, description, node_type,
        agent_id, position_x, position_y, is_user_editable, auto_run,
        require_approval, input_schema, output_schema, tools, form_config,
        output_mode, node_key, stage_order
    ) VALUES
        (v_input_id, v_template_id, 1, 'Старт', 'Форма ввода данных.',
         'input', NULL, 80, 120, true, false, false,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
         jsonb_build_object('fields', jsonb_build_array(
             jsonb_build_object('key','query','label','Задача','type','textarea','required',true)
         )),
         'structured_json', 'start', 0),
        (v_agent_id, v_template_id, 2, 'AI Агент', 'Основной агент — генерирует результат.',
         'agent', NULL, 360, 120, true, false, true,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
         'structured_json', 'agent_main', 0),
        (v_qc_id, v_template_id, 3, 'Проверка качества', 'Проверяет соответствие результата ожиданиям. Настройте правила проверки.',
         'quality_check', NULL, 640, 120, true, false, true,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
         'structured_json', 'quality', 0),
        (v_output_id, v_template_id, 4, 'Итог', 'Итоговый результат, одобренный после проверки.',
         'output', NULL, 920, 120, true, false, false,
         '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
         'structured_json', 'result', 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.workflow_template_edges (
        template_id, source_node_id, target_node_id, mapping, conditions
    ) VALUES
        (v_template_id, v_input_id, v_agent_id,  '[]'::jsonb, '[]'::jsonb),
        (v_template_id, v_agent_id, v_qc_id,     '[]'::jsonb, '[]'::jsonb),
        (v_template_id, v_qc_id, v_output_id,    '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT (template_id, source_node_id, target_node_id) DO NOTHING;
END $$;
