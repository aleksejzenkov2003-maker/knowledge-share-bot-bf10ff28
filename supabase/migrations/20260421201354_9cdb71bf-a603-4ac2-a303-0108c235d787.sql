-- Anthropic provider for Claude-based agents missing provider_id
UPDATE chat_roles
SET model_config = model_config || jsonb_build_object('provider_id','4ec816fb-1654-4a6f-8aeb-4bd2d6f1cfab')
WHERE name IN (
  '(ТЗ-отказ 0) Координатор-приёмщик',
  '(ТЗ-отказ 11) Сборщик правовых блоков',
  '(ТЗ-отказ 12) Редактор внутреннего заключения',
  '(ТЗ-отказ 13) Редактор проекта возражения',
  '(ТЗ-отказ 5a) Аналитик обозначения и перечня',
  '(ТЗ-отказ 7) Досье противопоставлений'
)
AND (model_config->>'provider_id') IS NULL;

-- Perplexity for sonar-pro agent missing provider_id
UPDATE chat_roles
SET model_config = model_config || jsonb_build_object('provider_id','a988f218-6d36-4848-82f5-a435408604fe')
WHERE name = '(ТЗ-отказ 3a) Аналитик заявителя'
  AND (model_config->>'provider_id') IS NULL;

-- Gemini for QC roles missing provider_id
UPDATE chat_roles
SET model_config = model_config || jsonb_build_object('provider_id','0bc14e53-be7f-4f42-88fd-b9809401085e')
WHERE name IN (
  '(ТЗ-отказ QC-аналитика)',
  '(ТЗ-отказ QC-аргументации)',
  '(ТЗ-отказ QC-полнота входа)',
  '(ТЗ-отказ QC-формалки)'
)
AND (model_config->>'provider_id') IS NULL;