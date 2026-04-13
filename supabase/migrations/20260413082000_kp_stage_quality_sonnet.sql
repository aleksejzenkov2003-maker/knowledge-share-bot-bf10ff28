-- Add dedicated stage quality reviewer (Claude Sonnet 4.6)
-- and attach it to all content-producing steps in KP workflow.

INSERT INTO public.system_prompts (id, name, prompt_text, is_active)
VALUES (
  'a1000001-0000-0000-0000-000000000099',
  'QC: КП структура и релевантность',
  'Ты эксперт по юридическим КП для регистрации товарных знаков.
Проверяй каждый материал этапа по критериям:
1) релевантность задаче этапа;
2) фактическая и логическая согласованность;
3) полнота по входным данным;
4) структура и формат, пригодные для включения в КП;
5) ясность формулировок и деловой стиль.

Если материал хороший, подтверждай PASS.
Если материал можно исправить самостоятельно, выбирай REWRITE и давай улучшенную версию.
Если без новых данных от пользователя исправить невозможно, выбирай FAIL.

Всегда отвечай валидным JSON по схеме:
{
  "verdict": "PASS | REWRITE | FAIL",
  "feedback": "кратко, по делу",
  "corrected_output": "готовый исправленный материал (или пустая строка)",
  "structure_notes": ["ключевая заметка 1", "ключевая заметка 2"]
}',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  prompt_text = EXCLUDED.prompt_text,
  is_active = EXCLUDED.is_active;

INSERT INTO public.chat_roles (
  id,
  name,
  slug,
  description,
  is_active,
  is_project_mode,
  mention_trigger,
  system_prompt_id,
  allow_web_search,
  model_config
)
VALUES (
  'b1000001-0000-0000-0000-000000000099',
  'QC-Редактор КП',
  'kp-qc-sonnet-46',
  'Проверка качества и автопереписывание блоков КП по этапам',
  true,
  true,
  '@кпqc',
  'a1000001-0000-0000-0000-000000000099',
  false,
  '{"model":"claude-sonnet-4-6","provider_id":"4ec816fb-1654-4a6f-8aeb-4bd2d6f1cfab"}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  is_project_mode = EXCLUDED.is_project_mode,
  mention_trigger = EXCLUDED.mention_trigger,
  system_prompt_id = EXCLUDED.system_prompt_id,
  allow_web_search = EXCLUDED.allow_web_search,
  model_config = EXCLUDED.model_config;

-- Attach QC role to each content step of template "КП по товарному знаку"
UPDATE public.workflow_template_steps
SET quality_check_agent_id = 'b1000001-0000-0000-0000-000000000099'
WHERE template_id = 'c1000001-0000-0000-0000-000000000001'
  AND id IN (
    'd1000001-0000-0000-0000-000000000010', -- Досье клиента
    'd1000001-0000-0000-0000-000000000002', -- МКТУ
    'd1000001-0000-0000-0000-000000000003', -- Охраноспособность
    'd1000001-0000-0000-0000-000000000004', -- Конфликтность
    'd1000001-0000-0000-0000-000000000005', -- Шпион / web
    'd1000001-0000-0000-0000-000000000006'  -- Итоговое КП
  );
