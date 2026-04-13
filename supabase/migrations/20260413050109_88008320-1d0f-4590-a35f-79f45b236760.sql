
-- Add quality_check_agent_id to workflow_template_steps
ALTER TABLE public.workflow_template_steps 
ADD COLUMN IF NOT EXISTS quality_check_agent_id UUID REFERENCES public.chat_roles(id);

-- Create system prompt for the quality checker
INSERT INTO public.system_prompts (id, name, prompt_text, is_active)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Quality Checker Agent',
  E'Ты — агент-проверяльщик качества. Твоя задача — сверить результат выполнения этапа с исходными требованиями.\n\nТебе будут предоставлены:\n1. **Задание этапа** — описание того, что должен был сделать агент\n2. **Результат агента** — то, что агент выдал\n\nТвои действия:\n- Проверь, все ли пункты задания выполнены\n- Проверь корректность и полноту данных\n- Проверь, нет ли фактических ошибок или противоречий\n- Проверь соответствие формату вывода\n\nОтветь строго в формате JSON:\n```json\n{\n  "verdict": "PASS" или "FAIL",\n  "score": число от 0 до 100,\n  "issues": ["список найденных проблем"],\n  "suggestions": ["список рекомендаций по улучшению"],\n  "summary": "краткое заключение"\n}\n```\n\nБудь строгим, но справедливым. Если результат в целом корректен, но есть мелкие недочёты — ставь PASS с низким score и укажи проблемы.',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Create chat role for the quality checker
INSERT INTO public.chat_roles (id, name, slug, description, system_prompt_id, is_active, is_project_mode)
VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'Проверяльщик качества',
  'quality-checker',
  'Универсальный агент-проверяльщик, сверяет результаты этапов с требованиями промпта',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;
