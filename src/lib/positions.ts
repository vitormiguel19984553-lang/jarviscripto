/**
 * Carteira de posições simuladas (moedas realmente "detidas" na simulação).
 *
 * Módulo puro e partilhado: o motor no browser, o motor no servidor e o modo
 * real usam exatamente a mesma matemática de entrada, saída e proteções. A
 * única diferença entre simulação e dinheiro real é onde a ordem é colocada
 * (livro simulado vs Binance do utilizador).
 */

import type { Protection, ProtectionExit } from "@/lib/protection";
import type { Pattern } from "@/lib/brain";

export type SimPosition = {
  id?: string;
  symbol: string;
  coin_id: string;
  quantity: number;
  avg_entry_price: number;
  invested: number;
  peak_price: number;
  entry_pattern_key: string | null;
  entry_pattern_desc: string | null;
  entry_confidence: number;
  /** Memória de trajetórias (opcional; ver src/lib/trajectory.ts). */
  opened_at?: string | null;
  trajectory?: unknown;
  tp_cap_pct?: number | null;
  trajectory_note?: string | null;
};

/** Variação (%) da posição face ao preço médio de entrada. */
export function movePct(pos: SimPosition, price: number): number {
  if (!pos.avg_entry_price) return 0;
  return Number(((price / pos.avg_entry_price - 1) * 100).toFixed(2));
}

/**
 * Rede de segurança: take profit, stop loss e trailing stop calculados sobre
 * o preço real de mercado. Corre antes da decisão da IA e pode fechar a
 * posição mesmo que a IA queira manter.
 */
export function forcedExit(
  pos: SimPosition,
  price: number,
  p: Protection,
): { exit: ProtectionExit | null; movePct: number } {
  const move = movePct(pos, price);
  const peak = Math.max(pos.peak_price || pos.avg_entry_price, price);
  const peakPct = pos.avg_entry_price ? (peak / pos.avg_entry_price - 1) * 100 : 0;

  if (move >= Math.max(0.1, p.takeProfitPct)) return { exit: "take_profit", movePct: move };
  if (move <= -Math.max(0.1, p.stopLossPct)) return { exit: "stop_loss", movePct: move };
  if (p.trailingStopPct > 0 && peakPct > p.trailingStopPct && move <= peakPct - p.trailingStopPct) {
    return { exit: "trailing_stop", movePct: move };
  }
  return { exit: null, movePct: move };
}

/**
 * Estado da posição depois de uma compra (preço médio ponderado).
 *
 * `quantity` deve ser passada quando a quantidade real preenchida é conhecida
 * (ordem real na Binance). Nunca se reaproveita a quantidade de uma posição já
 * fechada: quando não há posição atual, a quantidade é sempre recalculada a
 * partir do preço desta compra.
 */
export function afterBuy(
  current: SimPosition | null,
  args: {
    symbol: string;
    coinId: string;
    price: number;
    amount: number;
    quantity?: number;
    pattern: Pattern;
    confidence: number;
  },
): SimPosition {
  const filled =
    args.quantity && args.quantity > 0 ? args.quantity : args.price > 0 ? args.amount / args.price : 0;
  const base = current && current.quantity > 0 && current.invested > 0 ? current : null;
  const quantity = Number(((base?.quantity ?? 0) + filled).toFixed(10));
  const invested = Number(((base?.invested ?? 0) + args.amount).toFixed(2));
  return {
    ...(base?.id ? { id: base.id } : {}),
    symbol: args.symbol,
    coin_id: args.coinId,
    quantity,
    avg_entry_price: quantity > 0 ? Number((invested / quantity).toFixed(10)) : args.price,
    invested,
    peak_price: Math.max(base?.peak_price ?? 0, args.price),
    entry_pattern_key: base?.entry_pattern_key ?? args.pattern.key,
    entry_pattern_desc: base?.entry_pattern_desc ?? args.pattern.description,
    entry_confidence: base?.entry_confidence ?? args.confidence,
  };
}

/**
 * Deteta uma entrada média implausível (ex.: moeda de cotação errada ou valor
 * herdado de uma posição antiga). Devolve a descrição do problema ou null.
 */
export function entryAnomaly(
  pos: SimPosition,
  marketPrice: number,
  tolerancePct = 10,
): string | null {
  if (!pos.avg_entry_price || !marketPrice) return null;
  const diff = (pos.avg_entry_price / marketPrice - 1) * 100;
  if (Math.abs(diff) <= tolerancePct) return null;
  return `entrada média ${pos.avg_entry_price.toFixed(4)} difere ${diff.toFixed(2)}% do preço de mercado ${marketPrice.toFixed(4)}`;
}

/** Posição aberta há menos de `seconds` segundos (carência da rede de segurança). */
export function isFreshPosition(openedAt: string | null | undefined, seconds = 90): boolean {
  if (!openedAt) return false;
  const t = new Date(openedAt).getTime();
  return Number.isFinite(t) && Date.now() - t < seconds * 1000;
}


/** Resultado de fechar (parcial ou totalmente) uma posição ao preço atual. */
export function closeResult(
  pos: SimPosition,
  price: number,
  fraction = 1,
): { pnl: number; proceeds: number; investedPart: number; quantity: number; movePct: number } {
  const f = Math.max(0.01, Math.min(1, fraction));
  const quantity = Number((pos.quantity * f).toFixed(10));
  const investedPart = Number((pos.invested * f).toFixed(2));
  const proceeds = Number((quantity * price).toFixed(2));
  return {
    pnl: Number((proceeds - investedPart).toFixed(2)),
    proceeds,
    investedPart,
    quantity,
    movePct: movePct(pos, price),
  };
}

/** Posição depois de uma saída parcial (null quando fecha por completo). */
export function afterSell(pos: SimPosition, fraction: number, price: number): SimPosition | null {
  if (fraction >= 1) return null;
  const quantity = Number((pos.quantity * (1 - fraction)).toFixed(10));
  if (quantity <= 0) return null;
  return {
    ...pos,
    quantity,
    invested: Number((pos.invested * (1 - fraction)).toFixed(2)),
    peak_price: Math.max(pos.peak_price, price),
  };
}

export const emptyPositionFor = (symbol: string, coinId: string): SimPosition => ({
  symbol,
  coin_id: coinId,
  quantity: 0,
  avg_entry_price: 0,
  invested: 0,
  peak_price: 0,
  entry_pattern_key: null,
  entry_pattern_desc: null,
  entry_confidence: 0,
});
