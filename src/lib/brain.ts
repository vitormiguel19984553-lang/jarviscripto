import type { Coin, Signal } from "@/lib/market";

/**
 * Cérebro da IA: identificação de padrões de mercado e memória de resultados.
 * Módulo puro — serve o motor no browser e o motor no servidor.
 */

export type MemoryRow = {
  pattern_key: string;
  description: string;
  trades: number;
  wins: number;
  losses: number;
  total_pnl: number;
  confidence_penalty: number;
};

export type Pattern = { key: string; description: string };

const rsiBucket = (r: number) =>
  r >= 70 ? "rsi_alto" : r <= 35 ? "rsi_baixo" : "rsi_neutro";
const volBucket = (v: number) => (v > 1.2 ? "vol_alta" : v < 0.5 ? "vol_baixa" : "vol_media");

const labels: Record<string, string> = {
  rsi_alto: "RSI acima de 70",
  rsi_baixo: "RSI abaixo de 35",
  rsi_neutro: "RSI neutro",
  vol_alta: "volatilidade alta",
  vol_media: "volatilidade média",
  vol_baixa: "volatilidade baixa",
};

/** Padrão generalizado (não é um resultado isolado) do contexto de mercado. */
export function patternFor(signal: Signal, coin?: Coin): Pattern {
  const rb = rsiBucket(signal.rsi);
  const vb = volBucket(signal.vol);
  const move = (coin?.price_change_percentage_24h ?? 0) >= 0 ? "24h_positivo" : "24h_negativo";
  const key = `${rb}|tendencia_${signal.trend}|${vb}|${move}|${signal.action.toLowerCase()}`;
  const description = `${labels[rb]} em mercado de ${signal.trend} com ${labels[vb]} e 24h ${
    move === "24h_positivo" ? "positivas" : "negativas"
  } (sinal de ${signal.action.toLowerCase()})`;
  return { key, description };
}

/** Taxa de perda observada para o padrão. */
export function lossRate(row: MemoryRow): number {
  if (!row.trades) return 0;
  return Math.round((row.losses / row.trades) * 100);
}

/**
 * Penalização de confiança sugerida para o padrão: cresce com a taxa de perda
 * e só é considerada depois de haver amostra suficiente.
 */
export function nextPenalty(row: MemoryRow): number {
  if (row.trades < 4) return 0;
  const lr = lossRate(row);
  const base = lr > 70 ? 12 : lr > 55 ? 7 : lr > 45 ? 3 : 0;
  const pnlBias = row.total_pnl < 0 ? 3 : -2;
  return Number(Math.min(18, Math.max(0, base + pnlBias)).toFixed(2));
}

/** Confiança revista pela memória (a memória só reduz, nunca inflaciona). */
export function reviseConfidence(
  confidence: number,
  own: MemoryRow | null,
  global: MemoryRow | null,
): { confidence: number; penalty: number; note: string } {
  const ownPenalty = own ? own.confidence_penalty : 0;
  // A camada agregada e anónima pesa menos que a memória do próprio utilizador.
  const globalPenalty = global ? global.confidence_penalty * 0.4 : 0;
  const penalty = Number(Math.min(20, ownPenalty + globalPenalty).toFixed(2));
  if (penalty <= 0) return { confidence, penalty: 0, note: "" };

  const note = own
    ? `memória da IA: este padrão teve ${lossRate(own)}% de perdas em ${own.trades} operações (confiança reduzida em ${penalty.toFixed(0)} pontos)`
    : `memória agregada da plataforma associou este padrão a perdas (confiança reduzida em ${penalty.toFixed(0)} pontos)`;

  return {
    confidence: Math.max(5, Math.round(confidence - penalty)),
    penalty,
    note,
  };
}

/** Estado seguinte da memória depois de conhecer o resultado da operação. */
export function applyOutcome(row: MemoryRow, pnl: number): MemoryRow {
  const next: MemoryRow = {
    ...row,
    trades: row.trades + 1,
    wins: row.wins + (pnl > 0 ? 1 : 0),
    losses: row.losses + (pnl <= 0 ? 1 : 0),
    total_pnl: Number((row.total_pnl + pnl).toFixed(2)),
  };
  next.confidence_penalty = nextPenalty(next);
  return next;
}

export function emptyRow(pattern: Pattern): MemoryRow {
  return {
    pattern_key: pattern.key,
    description: pattern.description,
    trades: 0,
    wins: 0,
    losses: 0,
    total_pnl: 0,
    confidence_penalty: 0,
  };
}

/** Frase que a IA pode citar nos logs e no chat. */
export function explain(row: MemoryRow): string {
  return `${row.description}: ${row.trades} operações, ${row.wins} acertos, ${row.losses} perdas, resultado ${row.total_pnl.toFixed(2)}€.`;
}
