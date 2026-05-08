REVOKE EXECUTE ON FUNCTION public.cleanup_expired_bitrix_sessions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_expired_bitrix_sessions() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_pii_mappings() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_expired_pii_mappings() TO service_role;