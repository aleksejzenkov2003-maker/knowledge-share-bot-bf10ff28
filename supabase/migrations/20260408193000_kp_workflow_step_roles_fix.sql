-- Ensure each KP workflow step is bound to the intended role/node
-- and not accidentally reusing one agent prompt across all steps.

-- Template: КП по товарному знаку
-- c1000001-0000-0000-0000-000000000001

-- Step 2: Досье клиента
UPDATE public.workflow_template_steps
SET
  node_type = 'agent',
  agent_id = 'b1000001-0000-0000-0000-000000000010'
WHERE id = 'd1000001-0000-0000-0000-000000000010'
  AND template_id = 'c1000001-0000-0000-0000-000000000001';

-- Step 3: Анализ МКТУ
UPDATE public.workflow_template_steps
SET
  node_type = 'agent',
  agent_id = 'b1000001-0000-0000-0000-000000000001'
WHERE id = 'd1000001-0000-0000-0000-000000000002'
  AND template_id = 'c1000001-0000-0000-0000-000000000001';

-- Step 4: Охраноспособность
UPDATE public.workflow_template_steps
SET
  node_type = 'agent',
  agent_id = 'b1000001-0000-0000-0000-000000000002'
WHERE id = 'd1000001-0000-0000-0000-000000000003'
  AND template_id = 'c1000001-0000-0000-0000-000000000001';

-- Step 5: Анализ конфликтности
UPDATE public.workflow_template_steps
SET
  node_type = 'agent',
  agent_id = 'b1000001-0000-0000-0000-000000000003'
WHERE id = 'd1000001-0000-0000-0000-000000000004'
  AND template_id = 'c1000001-0000-0000-0000-000000000001';

-- Step 6: Поиск в открытых источниках / Шпион
UPDATE public.workflow_template_steps
SET
  node_type = CASE
    WHEN script_config IS NOT NULL AND script_config <> '{}'::jsonb THEN 'script'
    ELSE 'agent'
  END,
  agent_id = CASE
    WHEN script_config IS NOT NULL AND script_config <> '{}'::jsonb THEN NULL
    ELSE 'b1000001-0000-0000-0000-000000000004'
  END
WHERE id = 'd1000001-0000-0000-0000-000000000005'
  AND template_id = 'c1000001-0000-0000-0000-000000000001';

-- Step 7: Итоговое КП
UPDATE public.workflow_template_steps
SET
  node_type = 'output',
  agent_id = 'b1000001-0000-0000-0000-000000000005'
WHERE id = 'd1000001-0000-0000-0000-000000000006'
  AND template_id = 'c1000001-0000-0000-0000-000000000001';

