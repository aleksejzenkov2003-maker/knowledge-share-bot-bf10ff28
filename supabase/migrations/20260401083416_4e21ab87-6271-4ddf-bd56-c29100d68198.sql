
-- Fix 1: Restrict profiles visibility for moderators to own department
DROP POLICY IF EXISTS "Users can view own profile or admins/moderators can view all" ON public.profiles;

CREATE POLICY "Users can view own profile or department members" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = id) 
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'moderator'::app_role) 
      AND department_id = get_user_department(auth.uid())
    )
  );

-- Fix 2: Restrict chat_logs to own department for moderators
DROP POLICY IF EXISTS "Admins and moderators can view all logs" ON public.chat_logs;

CREATE POLICY "Admins can view all logs, moderators own department" ON public.chat_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'moderator'::app_role) 
      AND department_id = get_user_department(auth.uid())
    )
  );

-- Fix 3: Replace cleanup functions with admin-only versions
CREATE OR REPLACE FUNCTION public.cleanup_expired_bitrix_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Only allow admins or service role
  IF NOT (has_role(auth.uid(), 'admin'::app_role)) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  DELETE FROM public.bitrix_sessions 
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_pii_mappings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Only allow admins or service role
  IF NOT (has_role(auth.uid(), 'admin'::app_role)) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  DELETE FROM public.pii_mappings 
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;
