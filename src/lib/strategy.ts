import { supabase } from "@/integrations/supabase/client";
import { nextMinConfidence, nextWeight, sharpeRatio } from "@/lib/learning";

/**
 * Estado de aprendizagem da estratégia.
 *
 * A tabela `strategy_state` tem uma linha por (utilizador, moeda) e ainda uma
 * linha global identificada pelo símbolo `*`. A linha global serve de
 * referência quando uma moeda ainda tem histórico curto, para que uma moeda
 * nova não herde nem confiança exagerada nem castigo de outra moeda.
 */

export const GLOBAL_SYMBOL = "*";

export type StrategyState = {
  symbol: string;
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
  symbol: GLOBAL_SYMBOL,
  min_confidence: 55,
  trades: 0,
  wins: 0,
  losses: 0,
  total_pnl: 0,
  sharpe: 0,
  last_adjust_at: null,
};

export const emptyStrategyFor = (symbol: string): StrategyState => ({
  ...defaultStrategy,
  symbol,
});

const SELECT = "symbol,min_confidence,trades,wins,losses,total_pnl,sharpe,last_adjust_at";

type Row = {
  symbol: string;
  min_confidence: number | string;
  trades: number;
  wins: number;
  losses: number;
  total_pnl: number | string;
  sharpe: number | string;
  last_adjust_at: string | null;
};

const norm = (r: Row): StrategyState => ({
  symbol: r.symbol,
  min_confidence: Number(r.min_confidence),
  trades: r.trades,
  wins: r.wins,
  losses: r.losses,
  total_pnl: Number(r.total_pnl),
  sharpe: Number(r.sharpe),
  last_adjust_at: r.last_adjust_at,
});

/** Linha global (média/referência do utilizador). */
export async function loadStrategy(userId: string): Promise<StrategyState> {
  const { data, error } = await supabase
    .from("strategy_state")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("symbol", GLOBAL_SYMBOL)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await supabase
      .from("strategy_state")
      .insert({ user_id: userId, symbol: GLOBAL_SYMBOL })
      .select("symbol")
      .maybeSingle();
    return defaultStrategy;
  }
  return norm(data as Row);
}

/** Todas as linhas: global + uma por moeda. */
export async function loadStrategyStates(
  userId: string,
): Promise<{ global: StrategyState; bySymbol: Map<string, StrategyState> }> {
  const { data, error } = await supabase.from("strategy_state").select(SELECT).eq("user_id", userId);
  if (error) throw error;
  const rows = (data ?? []).map((r) => norm(r as Row));
  const bySymbol = new Map<string, StrategyState>();
  let global = defaultStrategy;
  for (const r of rows) {
    if (r.symbol === GLOBAL_SYMBOL) global = r;
    else bySymbol.set(r.symbol, r);
  }
  return { global, bySymbol };
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

/** Estado seguinte de uma linha de aprendizagem, dado o resultado realizado. */
export function advanceStrategy(
  state: StrategyState,
  args: { pnl: number; recentPnls: number[]; nowIso: string },
): StrategyState {
  const trades = state.trades + 1;
  const wins = state.wins + (args.pnl > 0 ? 1 : 0);
  const losses = state.losses + (args.pnl <= 0 ? 1 : 0);
  const sharpe = sharpeRatio(args.recentPnls.slice(0, 60));
  const minConfidence = nextMinConfidence(state.min_confidence, { trades, wins, sharpe });
  return {
    symbol: state.symbol,
    min_confidence: minConfidence,
    trades,
    wins,
    losses,
    total_pnl: Number((state.total_pnl + args.pnl).toFixed(2)),
    sharpe,
    last_adjust_at:
      minConfidence !== state.min_confidence ? args.nowIso : state.last_adjust_at,
  };
}

/**
 * Registra o resultado de uma operação: aprende na moeda em causa (linha
 * própria), mantém a linha global como referência e ajusta o peso da moeda.
 */
export async function recordOutcome(opts: {
  userId: string;
  symbol: string;
  pnl: number;
  recentPnls: number[];
  symbolPnls?: number[];
  state: StrategyState;
  symbolState?: StrategyState;
  stat: SymbolStat;
}): Promise<{ state: StrategyState; symbolState: StrategyState; stat: SymbolStat }> {
  const { userId, symbol, pnl, recentPnls, state, stat } = opts;
  const nowIso = new Date().toISOString();

  const next = advanceStrategy({ ...state, symbol: GLOBAL_SYMBOL }, { pnl, recentPnls, nowIso });
  const nextSymbol = advanceStrategy(opts.symbolState ?? emptyStrategyFor(symbol), {
    pnl,
    recentPnls: opts.symbolPnls ?? [pnl],
    nowIso,
  });

  const nextStat: SymbolStat = {
    symbol,
    trades: stat.trades + 1,
    wins: stat.wins + (pnl > 0 ? 1 : 0),
    total_pnl: Number((stat.total_pnl + pnl).toFixed(2)),
    weight: nextWeight(stat.weight, pnl),
  };

  await Promise.all([
    supabase
      .from("strategy_state")
      .upsert(
        { user_id: userId, ...next, updated_at: nowIso },
        { onConflict: "user_id,symbol" },
      ),
    supabase
      .from("strategy_state")
      .upsert(
        { user_id: userId, ...nextSymbol, symbol, updated_at: nowIso },
        { onConflict: "user_id,symbol" },
      ),
    supabase
      .from("strategy_symbol_stats")
      .upsert(
        { user_id: userId, ...nextStat, updated_at: nowIso },
        { onConflict: "user_id,symbol" },
      ),
  ]);

  return { state: next, symbolState: nextSymbol, stat: nextStat };
}

export const defaultStat = (symbol: string): SymbolStat => ({
  symbol,
  trades: 0,
  wins: 0,
  total_pnl: 0,
  weight: 1,
});
