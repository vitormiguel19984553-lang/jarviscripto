REVOKE EXECUTE ON FUNCTION public.run_bot_tick() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_bot_tick() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_bot_tick() FROM authenticated;