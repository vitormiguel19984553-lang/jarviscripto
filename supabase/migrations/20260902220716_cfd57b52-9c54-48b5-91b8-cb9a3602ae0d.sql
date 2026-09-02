CREATE TABLE IF NOT EXISTS public.sim_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  coin_id text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  avg_entry_price numeric NOT NULL DEFAULT 0,
  invested numeric NOT NULL DEFAULT 0,
  peak_price numeric NOT NULL DEFAULT 0,
  entry_pattern_key text,
  entry_pattern_desc text,
  entry_confidence numeric NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sim_positions TO authenticated;
GRANT ALL ON public.sim_positions TO service_role;

ALTER TABLE public.sim_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sim_positions_own" ON public.sim_positions;
CREATE POLICY "sim_positions_own" ON public.sim_positions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS user_min_confidence numeric NOT NULL DEFAULT 55;