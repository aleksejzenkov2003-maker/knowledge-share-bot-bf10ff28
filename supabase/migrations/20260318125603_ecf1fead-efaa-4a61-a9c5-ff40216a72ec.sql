-- Fix roles referencing deleted provider b64fe514 -> use Gemini provider 0bc14e53
UPDATE chat_roles SET model_config = jsonb_set(model_config::jsonb, '{provider_id}', '"0bc14e53-be7f-4f42-88fd-b9809401085e"')
WHERE model_config->>'provider_id' = 'b64fe514-2665-49b8-81f8-b70a98a77003';

-- Fix Reputation role: gemini-2.5-flash should use Gemini provider, not Anthropic
UPDATE chat_roles SET model_config = jsonb_set(model_config::jsonb, '{provider_id}', '"0bc14e53-be7f-4f42-88fd-b9809401085e"')
WHERE id = 'e0a2da40-6d80-4cd7-a0ef-402ddd6b5771';

-- Fix claude-3-opus-20240229 -> claude-haiku-4-5 (closest available)
UPDATE chat_roles SET model_config = '{"model": "claude-haiku-4-5", "provider_id": "4ec816fb-1654-4a6f-8aeb-4bd2d6f1cfab"}'::jsonb
WHERE id = 'f8b07ea5-bc7d-42eb-aff5-9e413263481c';

-- Fix claude-3-5-sonnet-20241022 -> claude-sonnet-4-6 (current equivalent)
UPDATE chat_roles SET model_config = jsonb_set(model_config::jsonb, '{model}', '"claude-sonnet-4-6"')
WHERE model_config->>'model' = 'claude-3-5-sonnet-20241022';

-- Fix gpt-4o -> gpt-4.1 (current equivalent)
UPDATE chat_roles SET model_config = jsonb_set(model_config::jsonb, '{model}', '"gpt-4.1"')
WHERE model_config->>'model' = 'gpt-4o';

-- Fix OpenAI provider default_model from gpt-4o to gpt-4.1
UPDATE ai_providers SET default_model = 'gpt-4.1' WHERE id = 'a76f89cc-3df5-4ca5-a854-6082e894c4bf';

-- Fix Anthropic provider default_model 
UPDATE ai_providers SET default_model = 'claude-sonnet-4-6' WHERE id = '4ec816fb-1654-4a6f-8aeb-4bd2d6f1cfab'