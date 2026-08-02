CREATE TABLE public.strategy_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  min_confidence NUMERIC NOT NULL DEFAULT 55,
  trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  sharpe NUMERIC NOT NULL DEFAULT 0,
  last_adjust_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_state TO authenticated;
GRANT ALL ON public.strategy_state TO service_role;
ALTER TABLE public.strategy_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own strategy state" ON public.strategy_state
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_symbol_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  weight NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_symbol_stats TO authenticated;
GRANT ALL ON public.strategy_symbol_stats TO service_role;
ALTER TABLE public.strategy_symbol_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own symbol stats" ON public.strategy_symbol_stats
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_strategy_state_updated_at BEFORE UPDATE ON public.strategy_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_strategy_symbol_stats_updated_at BEFORE UPDATE ON public.strategy_symbol_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();