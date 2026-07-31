CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.bot_cron_config (
  id BOOLEAN NOT NULL PRIMARY KEY DEFAULT true CHECK (id),
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  endpoint TEXT NOT NULL
);
GRANT ALL ON public.bot_cron_config TO service_role;
ALTER TABLE public.bot_cron_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bot_cron_config (id, endpoint)
VALUES (true, 'https://project--fa52b442-cf5e-4c1c-b16f-f1a93d863a95.lovable.app/api/public/bot-tick')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_bot_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE cfg public.bot_cron_config;
BEGIN
  SELECT * INTO cfg FROM public.bot_cron_config WHERE id;
  IF cfg IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('content-type', 'application/json', 'x-bot-secret', cfg.token),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_bot_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('cripto-jarvis-bot-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cripto-jarvis-bot-tick');

SELECT cron.schedule('cripto-jarvis-bot-tick', '* * * * *', 'SELECT public.run_bot_tick();');