
CREATE OR REPLACE FUNCTION public.clone_workflow_template(
  source_template_id uuid,
  new_name text,
  new_owner uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_template_id uuid := gen_random_uuid();
  src_schema jsonb;
  src_description text;
  step_map jsonb := '{}'::jsonb;
  old_id uuid;
  new_id uuid;
  new_entries jsonb := '[]'::jsonb;
  entry_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT schema, description INTO src_schema, src_description
  FROM public.workflow_templates WHERE id = source_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source template not found';
  END IF;

  -- Create new template (draft, not preset)
  INSERT INTO public.workflow_templates
    (id, name, description, created_by, is_active, is_preset, version, template_status, schema)
  VALUES
    (new_template_id, new_name, src_description, COALESCE(new_owner, auth.uid()),
     true, false, 1, 'draft', '{}'::jsonb);

  -- Clone steps, build id mapping
  FOR old_id, new_id IN
    WITH inserted AS (
      INSERT INTO public.workflow_template_steps (
        id, template_id, step_order, name, description, agent_id,
        input_schema, output_schema, is_user_editable, auto_run,
        prompt_override, position_x, position_y, node_type, script_config,
        require_approval, model, temperature, tools, form_config, output_mode,
        node_key, result_assembly_mode, result_template_id, quality_check_agent_id,
        stage_group, stage_order
      )
      SELECT
        gen_random_uuid(), new_template_id, step_order, name, description, agent_id,
        input_schema, output_schema, is_user_editable, auto_run,
        prompt_override, position_x, position_y, node_type, script_config,
        require_approval, model, temperature, tools, form_config, output_mode,
        node_key, result_assembly_mode, result_template_id, quality_check_agent_id,
        stage_group, stage_order
      FROM public.workflow_template_steps
      WHERE template_id = source_template_id
      RETURNING id AS new_id, step_order
    )
    SELECT s.id, i.new_id
    FROM public.workflow_template_steps s
    JOIN inserted i ON i.step_order = s.step_order
    WHERE s.template_id = source_template_id
  LOOP
    step_map := step_map || jsonb_build_object(old_id::text, to_jsonb(new_id::text));
  END LOOP;

  -- Clone edges using the id mapping
  INSERT INTO public.workflow_template_edges
    (template_id, source_node_id, target_node_id, source_handle, target_handle, mapping, conditions)
  SELECT
    new_template_id,
    (step_map ->> source_node_id::text)::uuid,
    (step_map ->> target_node_id::text)::uuid,
    source_handle, target_handle, mapping, conditions
  FROM public.workflow_template_edges
  WHERE template_id = source_template_id
    AND step_map ? source_node_id::text
    AND step_map ? target_node_id::text;

  -- Remap entryNodeIds in schema
  IF src_schema ? 'entryNodeIds' THEN
    FOR entry_id IN SELECT jsonb_array_elements_text(src_schema->'entryNodeIds')
    LOOP
      IF step_map ? entry_id THEN
        new_entries := new_entries || to_jsonb(step_map->>entry_id);
      END IF;
    END LOOP;
    UPDATE public.workflow_templates
    SET schema = jsonb_set(COALESCE(src_schema, '{}'::jsonb), '{entryNodeIds}', new_entries)
    WHERE id = new_template_id;
  END IF;

  RETURN new_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_workflow_template(uuid, text, uuid) TO authenticated;
