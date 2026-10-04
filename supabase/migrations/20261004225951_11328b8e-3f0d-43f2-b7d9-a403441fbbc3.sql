ALTER TABLE public.sim_positions
  ADD COLUMN IF NOT EXISTS trajectory jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tp_cap_pct numeric,
  ADD COLUMN IF NOT EXISTS trajectory_note text;
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS trajectory jsonb,
  ADD COLUMN IF NOT EXISTS trajectory_shape text;

CREATE TABLE IF NOT EXISTS public.ia_trajetorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_key text NOT NULL,
  shape text NOT NULL,
  trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  total_pnl numeric NOT NULL DEFAULT 0,
  avg_peak_pct numeric NOT NULL DEFAULT 0,
  avg_peak_min numeric NOT NULL DEFAULT 0,
  avg_final_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pattern_key, shape)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_trajetorias TO authenticated;
GRANT ALL ON public.ia_trajetorias TO service_role;
ALTER TABLE public.ia_trajetorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trajectories select" ON public.ia_trajetorias FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own trajectories insert" ON public.ia_trajetorias FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own trajectories update" ON public.ia_trajetorias FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own trajectories delete" ON public.ia_trajetorias FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ia_trajetorias_user_pattern ON public.ia_trajetorias(user_id, pattern_key);