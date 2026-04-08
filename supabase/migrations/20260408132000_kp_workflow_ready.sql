-- Make "КП по товарному знаку" workflow production-ready:
-- 1) add "Шпион" script definition
-- 2) convert step 5 to script node (spy-market-scan)
-- 3) tighten final КП output structure
-- 4) enforce explicit linear graph edges for deterministic routing

-- 1) Script registry: Spy scanner
INSERT INTO public.script_definitions (
  script_key,
  name,
  description,
  runtime,
  entrypoint,
  input_schema,
  output_schema
)
VALUES (
  'spy_market_scan',
  'Шпион: маркетплейсы и сайты',
  'Perplexity-поиск по ТЗ + скриншоты страниц + артефакты workflow',
  'supabase_edge_function',
  'spy-market-scan',
  '{
    "type":"object",
    "properties":{
      "trademark":{"type":"string"},
      "goods_services":{"type":"string"},
      "max_links":{"type":"number"},
      "take_screenshots":{"type":"boolean"}
    },
    "required":["trademark"]
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "results":{"type":"array"},
      "citations":{"type":"array"},
      "artifacts":{"type":"array"}
    }
  }'::jsonb
)
ON CONFLICT (script_key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  runtime = EXCLUDED.runtime,
  entrypoint = EXCLUDED.entrypoint,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema;

-- 2) Update template input schema for richer КП intake
UPDATE public.workflow_template_steps
SET
  input_schema = '{
    "fields": [
      {"name":"trademark","label":"Товарный знак / обозначение","type":"text","required":true},
      {"name":"contact_person","label":"Контактное лицо","type":"text","required":false},
      {"name":"email","label":"Email","type":"text","required":false},
      {"name":"phone","label":"Телефон","type":"text","required":false},
      {"name":"designation_type","label":"Вид обозначения","type":"select","required":true,"options":["Словесный","Изобразительный","Комбинированный","Объёмный"]},
      {"name":"goods_services","label":"Товары и услуги","type":"textarea","required":true},
      {"name":"applicant","label":"Заявитель","type":"text","required":false},
      {"name":"comment","label":"Комментарий к заявке","type":"textarea","required":false}
    ]
  }'::jsonb,
  form_config = '{
    "fields": [
      {"key":"trademark","type":"text","label":"Товарный знак / обозначение","required":true},
      {"key":"contact_person","type":"text","label":"Контактное лицо","required":false},
      {"key":"email","type":"text","label":"Email","required":false},
      {"key":"phone","type":"text","label":"Телефон","required":false},
      {"key":"designation_type","type":"select","label":"Вид обозначения","required":true,"options":[
        {"value":"Словесный","label":"Словесный"},
        {"value":"Изобразительный","label":"Изобразительный"},
        {"value":"Комбинированный","label":"Комбинированный"},
        {"value":"Объёмный","label":"Объёмный"}
      ]},
      {"key":"goods_services","type":"textarea","label":"Товары и услуги","required":true},
      {"key":"applicant","type":"text","label":"Заявитель","required":false},
      {"key":"comment","type":"textarea","label":"Комментарий к заявке","required":false}
    ]
  }'::jsonb
WHERE id = 'd1000001-0000-0000-0000-000000000001';

-- 3) Convert step 5 ("Поиск в открытых источниках") into script node "Шпион"
UPDATE public.workflow_template_steps
SET
  name = 'Шпион: поиск и скриншоты',
  description = 'Скрипт собирает ссылки (Perplexity), заходит на сайты/маркетплейсы и сохраняет скриншоты в артефакты проекта.',
  node_type = 'script',
  agent_id = NULL,
  script_config = '{
    "scriptKey":"spy_market_scan",
    "function_name":"spy-market-scan",
    "runtime":"supabase_edge_function",
    "timeoutSec":120,
    "retries":1,
    "params":{
      "max_links":12,
      "take_screenshots":true
    }
  }'::jsonb,
  input_schema = '{
    "type":"object",
    "properties":{
      "trademark":{"type":"string"},
      "goods_services":{"type":"string"},
      "mktu":{"type":"array"},
      "protectability":{"type":"object"},
      "conflicts":{"type":"array"}
    }
  }'::jsonb,
  output_schema = '{
    "type":"object",
    "properties":{
      "results":{"type":"array"},
      "citations":{"type":"array"},
      "artifacts":{"type":"array"},
      "notes":{"type":"string"}
    }
  }'::jsonb,
  auto_run = true,
  require_approval = true,
  is_user_editable = true
WHERE id = 'd1000001-0000-0000-0000-000000000005';

-- 4) Final step as explicit output node with structured КП layout
UPDATE public.workflow_template_steps
SET
  name = 'Итоговое КП',
  node_type = 'output',
  output_schema = '{
    "type":"object",
    "properties":{
      "title":{"type":"string"},
      "summary":{"type":"string"},
      "sections":{
        "type":"array",
        "items":{
          "type":"object",
          "properties":{
            "heading":{"type":"string"},
            "content":{"type":"string"}
          }
        }
      },
      "pricing":{"type":"array"},
      "recommendations":{"type":"array"},
      "human_readable":{
        "type":"object",
        "properties":{
          "title":{"type":"string"},
          "summary":{"type":"string"}
        }
      }
    }
  }'::jsonb,
  auto_run = false,
  require_approval = true,
  is_user_editable = true
WHERE id = 'd1000001-0000-0000-0000-000000000006';

-- 5) Ensure deterministic linear edges for this template
DELETE FROM public.workflow_template_edges
WHERE template_id = 'c1000001-0000-0000-0000-000000000001';

INSERT INTO public.workflow_template_edges (
  template_id,
  source_node_id,
  target_node_id,
  mapping,
  conditions
)
VALUES
(
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000002',
  '[{"sourcePath":"","targetPath":"","transform":"passthrough"}]'::jsonb,
  '[]'::jsonb
),
(
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000002',
  'd1000001-0000-0000-0000-000000000003',
  '[{"sourcePath":"","targetPath":"","transform":"passthrough"}]'::jsonb,
  '[]'::jsonb
),
(
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000003',
  'd1000001-0000-0000-0000-000000000004',
  '[{"sourcePath":"","targetPath":"","transform":"passthrough"}]'::jsonb,
  '[]'::jsonb
),
(
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000004',
  'd1000001-0000-0000-0000-000000000005',
  '[{"sourcePath":"","targetPath":"","transform":"passthrough"}]'::jsonb,
  '[]'::jsonb
),
(
  'c1000001-0000-0000-0000-000000000001',
  'd1000001-0000-0000-0000-000000000005',
  'd1000001-0000-0000-0000-000000000006',
  '[{"sourcePath":"","targetPath":"","transform":"passthrough"}]'::jsonb,
  '[]'::jsonb
);

