import { analyseSeries, type Coin } from "@/lib/market";

export type BacktestTrade = {
  index: number;
  entry: number;
  exit: number;
  pnlPct: number;
};

export type BacktestResult = {
  coinId: string;
  symbol: string;
  name: string;
  trades: BacktestTrade[];
  wins: number;
  losses: number;
  winRate: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  buyHoldPct: number;
  equity: number[];
};

export type BacktestConfig = {
  /** Confiança mínima para abrir posição (0-100). */
  minConfidence: number;
  /** Take profit em % */
  takeProfit: number;
  /** Stop loss em % */
  stopLoss: number;
};

export const defaultConfig: BacktestConfig = {
  minConfidence: 62,
  takeProfit: 2.5,
  stopLoss: 1.5,
};

/** Aplica a estratégia da IA ponto a ponto sobre a série de 7 dias (1 ponto/hora). */
export function backtest(coin: Coin, cfg: BacktestConfig): BacktestResult {
  const series = coin.sparkline_in_7d?.price ?? [];
  const trades: BacktestTrade[] = [];
  const equity: number[] = [];
  let capital = 100;
  let peak = 100;
  let maxDd = 0;
  let openAt: number | null = null;
  let openIdx = 0;

  for (let i = 50; i < series.length; i++) {
    const window = series.slice(0, i + 1);
    const price = window[window.length - 1];
    // Mesma fórmula de pontuação do motor ao vivo (`analyse`).
    const signal = analyseSeries(window, {
      total_volume: coin.total_volume,
      market_cap: coin.market_cap,
    });
    const confidence = signal.confidence;
    const trendUp = signal.trend === "alta";

    if (openAt === null) {
      if (confidence >= cfg.minConfidence && trendUp) {
        openAt = price;
        openIdx = i;
      }
    } else {
      const change = (price / openAt - 1) * 100;
      const exitNow =
        change >= cfg.takeProfit ||
        change <= -cfg.stopLoss ||
        signal.action === "VENDER" ||
        i === series.length - 1;
      if (exitNow) {
        trades.push({ index: openIdx, entry: openAt, exit: price, pnlPct: change });
        capital *= 1 + change / 100;
        openAt = null;
      }
    }

    peak = Math.max(peak, capital);
    maxDd = Math.max(maxDd, ((peak - capital) / peak) * 100);
    equity.push(capital);
  }

  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const losses = trades.length - wins;
  const first = series[50] ?? series[0] ?? 0;
  const last = series[series.length - 1] ?? first;

  return {
    coinId: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    trades,
    wins,
    losses,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    totalReturnPct: capital - 100,
    maxDrawdownPct: maxDd,
    buyHoldPct: first ? (last / first - 1) * 100 : 0,
    equity,
  };
}
