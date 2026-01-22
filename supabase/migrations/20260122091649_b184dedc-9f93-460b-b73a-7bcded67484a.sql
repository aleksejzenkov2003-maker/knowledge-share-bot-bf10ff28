-- Add portal_domain to department_api_keys for mapping Bitrix portals to departments
ALTER TABLE public.department_api_keys 
ADD COLUMN IF NOT EXISTS portal_domain TEXT;

-- Create unique index for portal domain lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_department_api_keys_portal_domain 
ON public.department_api_keys(portal_domain) 
WHERE portal_domain IS NOT NULL AND is_active = true;

-- Create bitrix_sessions table for JWT session management
CREATE TABLE IF NOT EXISTS public.bitrix_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  bitrix_user_id TEXT NOT NULL,
  portal_domain TEXT NOT NULL,
  jwt_token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bitrix_sessions_user ON public.bitrix_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bitrix_sessions_expires ON public.bitrix_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_bitrix_sessions_token_hash ON public.bitrix_sessions(jwt_token_hash);

-- Enable RLS
ALTER TABLE public.bitrix_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for bitrix_sessions
CREATE POLICY "Admins can manage bitrix sessions"
ON public.bitrix_sessions
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Users can view own sessions"
ON public.bitrix_sessions
FOR SELECT
USING (user_id = auth.uid());

-- Function to cleanup expired sessions (can be called via cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_bitrix_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.bitrix_sessions 
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;