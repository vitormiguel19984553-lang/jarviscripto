/**
 * Proteções de ordem: take profit, stop loss e trailing stop.
 *
 * A simulação percorre um caminho de preço curto para a ordem e sai na
 * primeira proteção acionada, devolvendo o resultado em euros e o motivo.
 */

export type Protection = {
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
};

export const defaultProtection: Protection = {
  takeProfitPct: 2.5,
  stopLossPct: 1.5,
  trailingStopPct: 1,
};

export type ProtectionExit = "take_profit" | "stop_loss" | "trailing_stop" | "fecho";

export const exitLabels: Record<ProtectionExit, string> = {
  take_profit: "take profit",
  stop_loss: "stop loss",
  trailing_stop: "trailing stop",
  fecho: "fecho normal",
};

/**
 * Simula a ordem passo a passo. `bias` (0–1) é a probabilidade de cada passo
 * ser favorável — vem da confiança do sinal da IA.
 */
export function simulateProtectedTrade(
  amount: number,
  bias: number,
  p: Protection,
  volatilityPct = 0.6,
  steps = 24,
): { pnl: number; exit: ProtectionExit; movePct: number } {
  const tp = Math.max(0.1, p.takeProfitPct);
  const sl = Math.max(0.1, p.stopLossPct);
  const trail = Math.max(0, p.trailingStopPct);

  let movePct = 0;
  let peakPct = 0;
  let exit: ProtectionExit = "fecho";

  for (let i = 0; i < steps; i++) {
    const up = Math.random() < bias;
    movePct += (up ? 1 : -1) * volatilityPct * (0.4 + Math.random());
    peakPct = Math.max(peakPct, movePct);

    if (movePct >= tp) {
      movePct = tp;
      exit = "take_profit";
      break;
    }
    if (movePct <= -sl) {
      movePct = -sl;
      exit = "stop_loss";
      break;
    }
    if (trail > 0 && peakPct > trail && movePct <= peakPct - trail) {
      movePct = peakPct - trail;
      exit = "trailing_stop";
      break;
    }
  }

  return {
    pnl: Number(((amount * movePct) / 100).toFixed(2)),
    exit,
    movePct: Number(movePct.toFixed(2)),
  };
}
