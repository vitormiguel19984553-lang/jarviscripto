/**
 * Auto-aprendizagem do Jarvis (puro, sem dependências de rede).
 * Serve o motor no browser e o motor no servidor.
 */

export const MIN_CONFIDENCE_FLOOR = 45;
export const MIN_CONFIDENCE_CEIL = 88;
export const WEIGHT_FLOOR = 0.2;
export const WEIGHT_CEIL = 1.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Índice de Sharpe simplificado sobre o resultado de cada operação. */
export function sharpeRatio(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / (pnls.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return Number(((mean / sd) * Math.sqrt(pnls.length)).toFixed(3));
}

/**
 * Ajusta a confiança mínima exigida à IA: sobe quando o desempenho ajustado ao
 * risco é fraco (exige sinais melhores), desce devagar quando é consistente.
 */
export function nextMinConfidence(
  current: number,
  input: { trades: number; wins: number; sharpe: number },
): number {
  if (input.trades < 8) return clamp(current, MIN_CONFIDENCE_FLOOR, MIN_CONFIDENCE_CEIL);
  const winRate = (input.wins / input.trades) * 100;
  let next = current;
  if (input.sharpe < 0 || winRate < 45) next += 2.5;
  else if (input.sharpe > 0.6 && winRate > 58) next -= 1.5;
  return Number(clamp(next, MIN_CONFIDENCE_FLOOR, MIN_CONFIDENCE_CEIL).toFixed(2));
}

/** Reforça moedas lucrativas e reduz exposição a padrões com perdas repetidas. */
export function nextWeight(weight: number, pnl: number): number {
  const step = pnl >= 0 ? 0.06 : -0.09;
  return Number(clamp(weight + step, WEIGHT_FLOOR, WEIGHT_CEIL).toFixed(3));
}

export const USER_CONFIDENCE_MIN = 45;
export const USER_CONFIDENCE_MAX = 90;

/**
 * Piso definido pelo utilizador: a IA continua a auto-ajustar a confiança
 * mínima, mas nunca desce abaixo do valor escolhido por quem opera.
 */
export function withUserFloor(learned: number, userFloor: number): number {
  const floor = clamp(Number(userFloor) || USER_CONFIDENCE_MIN, USER_CONFIDENCE_MIN, USER_CONFIDENCE_MAX);
  return Number(Math.max(learned, floor).toFixed(2));
}

/** Limite de confiança efetivo para uma moeda, dado o peso aprendido. */
export function thresholdForSymbol(minConfidence: number, weight: number): number {
  const adjusted = minConfidence + (1 - weight) * 12;
  return Number(clamp(adjusted, MIN_CONFIDENCE_FLOOR, 95).toFixed(2));
}


/** Tamanho da posição escalado pelo peso aprendido da moeda. */
export function sizeForWeight(baseAmount: number, weight: number): number {
  return Math.max(1, Math.round(baseAmount * clamp(weight, WEIGHT_FLOOR, WEIGHT_CEIL)));
}
