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

/**
 * Valor de referência (na moeda da carteira) de uma posição "normal". Posições
 * abaixo deste valor são consideradas pequenas e ganham saídas mais apertadas.
 */
export const SMALL_POSITION_REFERENCE = 100;

/**
 * Rede de segurança mais firme para posições pequenas: quanto menor o valor
 * investido, mais apertados ficam o take profit, o stop loss e o trailing, para
 * que a posição não fique aberta indefinidamente à espera do sinal da IA.
 *
 * O caminho de venda raciocinado da IA continua intacto — isto apenas endurece
 * o backstop. Pode ser desligado pelo utilizador (`fastExit = false`).
 */
export function protectionForPosition(args: {
  base: Protection;
  volatilityPct: number;
  positionValue: number;
  fastExit: boolean;
  reference?: number;
}): Protection {
  const scaled = scaleProtection(args.base, args.volatilityPct);
  if (!args.fastExit) return scaled;

  const reference = Math.max(1, args.reference ?? SMALL_POSITION_REFERENCE);
  const ratio = Math.max(0, args.positionValue) / reference;
  // 0.40 para posições minúsculas, 1 a partir do valor de referência.
  const sizeFactor = Math.max(0.4, Math.min(1, Math.sqrt(ratio) || 0.4));
  const round = (v: number) => Number(v.toFixed(2));

  const takeProfitPct = round(Math.max(0.3, scaled.takeProfitPct * sizeFactor));
  const stopLossPct = round(Math.max(0.25, scaled.stopLossPct * sizeFactor));
  // Trailing sempre ativo em saídas rápidas: no máximo 40% do take profit.
  const trailingBase = scaled.trailingStopPct > 0 ? scaled.trailingStopPct : takeProfitPct;
  const trailingStopPct = round(Math.max(0.2, Math.min(trailingBase, takeProfitPct * 0.4)));

  return { takeProfitPct, stopLossPct, trailingStopPct };
}

/** Direção de operação escolhida pelo utilizador. */
export type TradeDirection = "compra" | "venda" | "ambos";

export const TRADE_DIRECTIONS: { key: TradeDirection; label: string; description: string }[] = [
  {
    key: "compra",
    label: "SÓ COMPRA",
    description:
      "A IA só abre novas posições. As saídas ficam por conta do take profit, stop loss e trailing.",
  },
  {
    key: "venda",
    label: "SÓ VENDA",
    description:
      "A IA não abre novas posições — apenas gere e fecha as moedas que já tens em carteira.",
  },
  {
    key: "ambos",
    label: "AMBOS",
    description: "A IA raciocina sobre compras e vendas (comportamento normal).",
  },
];

export const asTradeDirection = (v: unknown): TradeDirection =>
  v === "compra" || v === "venda" ? v : "ambos";

/** Verdadeiro quando a direção escolhida permite este sinal. */
export function directionAllows(
  direction: TradeDirection,
  action: "COMPRAR" | "VENDER" | "AGUARDAR",
): boolean {
  if (action === "COMPRAR") return direction !== "venda";
  if (action === "VENDER") return direction !== "compra";
  return false;
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
