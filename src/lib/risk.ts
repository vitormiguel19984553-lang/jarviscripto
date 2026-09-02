/**
 * Camada de risco partilhada: proteções dinâmicas, diversificação,
 * frequência de operações e deteção de choque de mercado.
 *
 * Estas regras aplicam-se de forma idêntica em modo simulado e em modo real.
 */

import type { Coin } from "@/lib/market";
import { volatility } from "@/lib/market";
import type { Protection } from "@/lib/protection";

/**
 * Escala o take profit / stop loss / trailing com a volatilidade recente da
 * moeda: moedas mais calmas ficam com alvos apertados, moedas agitadas ganham
 * espaço para respirar (dentro de limites seguros).
 */
export function scaleProtection(base: Protection, volatilityPct: number): Protection {
  const factor = Math.max(0.6, Math.min(2.2, volatilityPct / 0.6 || 1));
  const round = (v: number) => Number(v.toFixed(2));
  return {
    takeProfitPct: round(Math.max(0.4, Math.min(12, base.takeProfitPct * factor))),
    stopLossPct: round(Math.max(0.3, Math.min(8, base.stopLossPct * factor))),
    trailingStopPct: round(Math.max(0, Math.min(6, base.trailingStopPct * factor))),
  };
}

/** Volatilidade recente (%) usada para escalar as proteções. */
export function recentVolatility(coin: Coin): number {
  const series = coin.sparkline_in_7d?.price ?? [];
  if (series.length < 12) {
    return Math.max(0.2, Math.min(2, Math.abs(coin.price_change_percentage_24h ?? 0) / 6 || 0.6));
  }
  return Math.max(0.15, Math.min(3, volatility(series.slice(-72))));
}

export const DEFAULT_DIVERSIFICATION_CAP = 25;

/**
 * Teto de exposição por moeda: nunca mais do que `capPct` % do capital total
 * numa única moeda.
 */
export function diversificationRoom(args: {
  totalCapital: number;
  exposureForSymbol: number;
  capPct: number;
}): number {
  const cap = (Math.max(1, Math.min(100, args.capPct)) / 100) * Math.max(0, args.totalCapital);
  return Number(Math.max(0, cap - Math.max(0, args.exposureForSymbol)).toFixed(2));
}

/** Verdadeiro quando o limite de operações por hora já foi atingido. */
export function hourlyCapReached(timestamps: number[], maxPerHour: number, now = Date.now()) {
  const cap = Math.max(1, Math.min(20, Math.round(maxPerHour)));
  return timestamps.filter((t) => now - t < 3_600_000).length >= cap;
}

export type Shock = {
  detected: boolean;
  movePct: number;
  reason: string;
};

/**
 * Choque de mercado: movimento anormal numa janela curta (últimas ~6 leituras)
 * comparado com a volatilidade típica da moeda. Enquanto durar, o motor não
 * abre novas posições.
 */
export function detectShock(coin: Coin): Shock {
  const series = coin.sparkline_in_7d?.price ?? [];
  if (series.length < 24) return { detected: false, movePct: 0, reason: "" };
  const window = series.slice(-6);
  const movePct = (window[window.length - 1] / window[0] - 1) * 100;
  const typical = Math.max(0.2, volatility(series.slice(-72)));
  const limit = Math.max(3, typical * 6);
  const detected = Math.abs(movePct) >= limit;
  return {
    detected,
    movePct: Number(movePct.toFixed(2)),
    reason: detected
      ? `Movimento anormal de ${movePct.toFixed(2)}% numa janela curta (normal ≈ ${typical.toFixed(2)}%). Entradas em pausa.`
      : "",
  };
}
