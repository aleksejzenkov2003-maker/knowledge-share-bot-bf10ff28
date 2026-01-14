-- Fix the view issue first (the extension warning is minor and acceptable)
-- The vector extension in public schema is acceptable for this use case

-- Fix: Replace SECURITY DEFINER view with SECURITY INVOKER view
DROP VIEW IF EXISTS public.safe_ai_providers;

CREATE VIEW public.safe_ai_providers 
WITH (security_invoker = true)
AS
SELECT 
    id,
    name,
    provider_type,
    CASE WHEN api_key IS NOT NULL THEN '***' || RIGHT(api_key, 4) ELSE NULL END AS api_key_masked,
    base_url,
    default_model,
    is_default,
    is_active,
    config,
    created_at,
    updated_at
FROM public.ai_providers;