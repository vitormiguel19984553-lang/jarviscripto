REVOKE EXECUTE ON FUNCTION public.has_min_staff_level(uuid, text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.run_bot_tick() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;