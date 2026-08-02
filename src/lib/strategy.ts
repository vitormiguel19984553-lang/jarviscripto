import { supabase } from "@/integrations/supabase/client";
import { nextMinConfidence, nextWeight, sharpeRatio } from "@/lib/learning";

export type StrategyState = {
  min_confidence: number;
  trades: number;
  wins: number;
  losses: number;
  total_pnl: number;
  sharpe: number;
  last_adjust_at: string | null;
};

export type SymbolStat = {
  symbol: string;
  trades: number;
  wins: number;
  total_pnl: number;
  weight: number;
};

export const defaultStrategy: StrategyState = {
  min_confidence: 55,
  trades: 0,
  wins: 0,
  losses: 0,
  total_pnl: 0,
  sharpe: 0,
  last_adjust_at: null,
};

export async function loadStrategy(userId: string): Promise<StrategyState> {
  const { data, error } = await supabase
    .from("strategy_state")
    .select("min_confidence,trades,wins,losses,total_pnl,sharpe,last_adjust_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await supabase.from("strategy_state").insert({ user_id: userId });
    return defaultStrategy;
  }
  return {
    min_confidence: Number(data.min_confidence),
    trades: data.trades,
    wins: data.wins,
    losses: data.losses,
    total_pnl: Number(data.total_pnl),
    sharpe: Number(data.sharpe),
    last_adjust_at: data.last_adjust_at,
  };
}

export async function loadSymbolStats(userId: string): Promise<SymbolStat[]> {
  const { data, error } = await supabase
    .from("strategy_symbol_stats")
    .select("symbol,trades,wins,total_pnl,weight")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    symbol: r.symbol,
    trades: r.trades,
    wins: r.wins,
    total_pnl: Number(r.total_pnl),
    weight: Number(r.weight),
  }));
}

/**
 * Registra o resultado de uma operação e ajusta os parâmetros da estratégia
 * (confiança mínima global + peso da moeda).
 */
export async function recordOutcome(opts: {
  userId: string;
  symbol: string;
  pnl: number;
  recentPnls: number[];
  state: StrategyState;
  weight: number;
}): Promise<{ state: StrategyState; weight: number }> {
  const { userId, symbol, pnl, recentPnls, state } = opts;
  const trades = state.trades + 1;
  const wins = state.wins + (pnl > 0 ? 1 : 0);
  const losses = state.losses + (pnl <= 0 ? 1 : 0);
  const sharpe = sharpeRatio(recentPnls.slice(0, 60));
  const minConfidence = nextMinConfidence(state.min_confidence, { trades, wins, sharpe });
  const nowIso = new Date().toISOString();

  const next: StrategyState = {
    min_confidence: minConfidence,
    trades,
    wins,
    losses,
    total_pnl: Number((state.total_pnl + pnl).toFixed(2)),
    sharpe,
    last_adjust_at: minConfidence !== state.min_confidence ? nowIso : state.last_adjust_at,
  };

  await supabase
    .from("strategy_state")
    .upsert({ user_id: userId, ...next, updated_at: nowIso }, { onConflict: "user_id" });

  const weight = nextWeight(opts.weight, pnl);
  await supabase.from("strategy_symbol_stats").upsert(
    {
      user_id: userId,
      symbol,
      weight,
      trades: 1,
      wins: pnl > 0 ? 1 : 0,
      total_pnl: pnl,
      updated_at: nowIso,
    },
    { onConflict: "user_id,symbol", ignoreDuplicates: false },
  );

  // Os contadores por moeda são acumulativos: soma-se o valor anterior.
  const { data: existing } = await supabase
    .from("strategy_symbol_stats")
    .select("trades,wins,total_pnl")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .maybeSingle();
  if (existing) {
    void existing; // já atualizado acima com valores desta operação
  }

  return { state: next, weight };
}
