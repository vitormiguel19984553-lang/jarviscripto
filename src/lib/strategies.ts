/**
 * Estratégias nomeadas + deteção de regime de mercado.
 *
 * Cada estratégia dá pesos diferentes aos mesmos indicadores técnicos já
 * calculados em `analyse()`. O regime de mercado (tendência / lateral /
 * volátil) é detetado por moeda e indica qual a estratégia mais adequada.
 */

import type { Coin, Signal, IndicatorCheck } from "@/lib/market";

export type StrategyName = "trend" | "reversion" | "breakout" | "momentum";

export const strategyLabels: Record<StrategyName, string> = {
  trend: "Seguir tendência",
  reversion: "Reversão à média",
  breakout: "Rompimento",
  momentum: "Momento",
};

export const strategyExplain: Record<StrategyName, string> = {
  trend: "Entra a favor da tendência confirmada em vários horizontes.",
  reversion: "Procura exageros (RSI/bandas) e aposta no regresso à média.",
  breakout: "Valoriza rompimentos de bandas com volume e volatilidade.",
  momentum: "Segue a força recente do preço (momento e MACD).",
};

export type Regime = "tendencia" | "lateral" | "volatil";

export const regimeLabels: Record<Regime, string> = {
  tendencia: "em tendência",
  lateral: "lateral",
  volatil: "volátil",
};

/** Família de indicador, derivada do nome usado em `analyse()`. */
type Family = "mm" | "macd" | "rsi" | "bands" | "momentum" | "vol" | "liquidity" | "alignment";

function familyOf(check: IndicatorCheck): Family {
  const n = check.name.toLowerCase();
  if (n.includes("macd")) return "macd";
  if (n.includes("rsi")) return "rsi";
  if (n.includes("bollinger")) return "bands";
  if (n.includes("momento")) return "momentum";
  if (n.includes("volatilidade")) return "vol";
  if (n.includes("liquidez")) return "liquidity";
  if (n.includes("alinhamento")) return "alignment";
  return "mm";
}

/** Multiplicadores por estratégia (1 = peso original do indicador). */
const weights: Record<StrategyName, Record<Family, number>> = {
  trend: { mm: 1.5, macd: 1.2, rsi: 0.5, bands: 0.6, momentum: 1, vol: 1, liquidity: 1, alignment: 1.6 },
  reversion: { mm: 0.5, macd: 0.6, rsi: 1.8, bands: 1.7, momentum: 0.5, vol: 0.7, liquidity: 1, alignment: 0.6 },
  breakout: { mm: 1, macd: 1.1, rsi: 0.7, bands: 1.8, momentum: 1.3, vol: 0.4, liquidity: 1.4, alignment: 1 },
  momentum: { mm: 1.1, macd: 1.5, rsi: 0.6, bands: 0.7, momentum: 1.9, vol: 0.9, liquidity: 1, alignment: 1.2 },
};

/** Deteta o regime da moeda a partir do sinal técnico já calculado. */
export function detectRegime(signal: Signal, coin?: Coin): Regime {
  const change24 = Math.abs(coin?.price_change_percentage_24h ?? 0);
  if (signal.vol > 1.15 || change24 > 8) return "volatil";
  const aligned = signal.alignment >= Math.max(3, signal.timeframes.length - 1);
  if (aligned) return "tendencia";
  return "lateral";
}

/** Estratégia preferida para cada regime de mercado. */
export function bestStrategyFor(regime: Regime): StrategyName {
  if (regime === "tendencia") return "trend";
  if (regime === "lateral") return "reversion";
  return "breakout";
}

export type StrategyScore = {
  strategy: StrategyName;
  regime: Regime;
  confidence: number;
  note: string;
};

/** Reavalia a confiança do sinal com os pesos da estratégia escolhida. */
export function scoreWithStrategy(signal: Signal, strategy: StrategyName, coin?: Coin): StrategyScore {
  const regime = detectRegime(signal, coin);
  const w = weights[strategy];
  const raw = signal.checks.reduce((acc, c) => acc + c.points * w[familyOf(c)], 0);
  const confidence = Math.max(5, Math.min(95, Math.round(50 + raw)));
  return {
    strategy,
    regime,
    confidence,
    note: `estratégia ${strategyLabels[strategy].toLowerCase()} · mercado ${regimeLabels[regime]}`,
  };
}

/**
 * Escolhe a estratégia: quando o utilizador pede "auto", usa a mais adequada
 * ao regime detetado; caso contrário respeita a escolha manual.
 */
export function resolveStrategy(
  choice: StrategyName | "auto",
  signal: Signal,
  coin?: Coin,
): StrategyScore {
  const regime = detectRegime(signal, coin);
  const name = choice === "auto" ? bestStrategyFor(regime) : choice;
  return scoreWithStrategy(signal, name, coin);
}
