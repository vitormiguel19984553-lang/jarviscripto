CREATE TABLE IF NOT EXISTS public.bot_cron_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id bigint,
  endpoint text NOT NULL,
  status_code integer,
  error_text text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT ON public.bot_cron_log TO authenticated;
GRANT ALL ON public.bot_cron_log TO service_role;

ALTER TABLE public.bot_cron_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view bot cron log"
ON public.bot_cron_log FOR SELECT TO authenticated
USING (public.has_min_staff_level(auth.uid(), 'gerente'));

CREATE INDEX IF NOT EXISTS bot_cron_log_triggered_at_idx ON public.bot_cron_log (triggered_at DESC);

CREATE OR REPLACE FUNCTION public.run_bot_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cfg public.bot_cron_config;
  req_id bigint;
BEGIN
  SELECT * INTO cfg FROM public.bot_cron_config WHERE id;
  IF cfg IS NULL THEN RETURN; END IF;

  -- Preenche o estado das chamadas anteriores ainda sem resposta registada.
  UPDATE public.bot_cron_log l
  SET status_code = r.status_code,
      error_text = NULLIF(r.error_msg, ''),
      resolved_at = now()
  FROM net._http_response r
  WHERE r.id = l.request_id AND l.status_code IS NULL;

  SELECT net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('content-type', 'application/json', 'x-bot-secret', cfg.token),
    body := '{}'::jsonb
  ) INTO req_id;

  INSERT INTO public.bot_cron_log (request_id, endpoint) VALUES (req_id, cfg.endpoint);

  DELETE FROM public.bot_cron_log WHERE triggered_at < now() - interval '7 days';
END;
$function$;