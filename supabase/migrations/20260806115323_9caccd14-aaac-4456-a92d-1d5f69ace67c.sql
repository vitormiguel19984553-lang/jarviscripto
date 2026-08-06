CREATE TABLE public.ia_memoria (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_key text NOT NULL,
  description text NOT NULL DEFAULT '',
  trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  total_pnl numeric NOT NULL DEFAULT 0,
  confidence_penalty numeric NOT NULL DEFAULT 0,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, pattern_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_memoria TO authenticated;
GRANT ALL ON public.ia_memoria TO service_role;
ALTER TABLE public.ia_memoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ia memoria" ON public.ia_memoria FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read all ia memoria" ON public.ia_memoria FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_ia_memoria_updated_at BEFORE UPDATE ON public.ia_memoria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ia_memoria_global (
  pattern_key text NOT NULL PRIMARY KEY,
  description text NOT NULL DEFAULT '',
  trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  total_pnl numeric NOT NULL DEFAULT 0,
  confidence_penalty numeric NOT NULL DEFAULT 0,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ia_memoria_global TO authenticated;
GRANT ALL ON public.ia_memoria_global TO service_role;
ALTER TABLE public.ia_memoria_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read global memory" ON public.ia_memoria_global FOR SELECT TO authenticated
  USING (true);
CREATE TRIGGER update_ia_memoria_global_updated_at BEFORE UPDATE ON public.ia_memoria_global
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ia_pareceres (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  model text NOT NULL,
  verdict text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  confidence_before numeric,
  confidence_after numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_pareceres TO authenticated;
GRANT ALL ON public.ia_pareceres TO service_role;
ALTER TABLE public.ia_pareceres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ia pareceres" ON public.ia_pareceres FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read all ia pareceres" ON public.ia_pareceres FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX ia_pareceres_user_created_idx ON public.ia_pareceres (user_id, created_at DESC);