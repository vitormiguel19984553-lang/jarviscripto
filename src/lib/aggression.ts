import type { Signal } from "@/lib/market";

export type Aggression = "passivo" | "moderado" | "agressivo";

export const AGGRESSION_LIST: Aggression[] = ["passivo", "moderado", "agressivo"];

export type AggressionProfile = {
  key: Aggression;
  label: string;
  description: string;
  /** Ajuste (em pontos) à confiança mínima exigida. */
  confidenceDelta: number;
  /** Multiplicador do valor de cada ordem. */
  sizeFactor: number;
  /** Exige confirmações extra (tendência de alta + RSI fora de sobrecompra). */
  requireConfirmations: boolean;
  /** Probabilidade de o motor deixar passar a oportunidade (menos operações). */
  skipChance: number;
  /** Aprendizagem imediata: penalização extra após cada perda. */
  instantLearning: boolean;
};

export const aggressionProfiles: Record<Aggression, AggressionProfile> = {
  passivo: {
    key: "passivo",
    label: "PASSIVO",
    description:
      "Mais confirmações, confiança mínima mais alta e menos operações. Prioriza preservar o capital.",
    confidenceDelta: 8,
    sizeFactor: 0.8,
    requireConfirmations: true,
    skipChance: 0.5,
    instantLearning: false,
  },
  moderado: {
    key: "moderado",
    label: "MODERADO",
    description: "Comportamento equilibrado — o padrão do Jarvis.",
    confidenceDelta: 0,
    sizeFactor: 1,
    requireConfirmations: false,
    skipChance: 0,
    instantLearning: false,
  },
  agressivo: {
    key: "agressivo",
    label: "AGRESSIVO",
    description:
      "Mais operações e confiança mínima mais baixa, com ordens menores para controlar o risco total e aprendizagem imediata após cada perda.",
    confidenceDelta: -7,
    sizeFactor: 0.6,
    requireConfirmations: false,
    skipChance: 0,
    instantLearning: true,
  },
};

export const profileFor = (mode: string | null | undefined): AggressionProfile =>
  aggressionProfiles[(mode as Aggression) ?? "moderado"] ?? aggressionProfiles.moderado;

/** Limite de confiança final para o modo escolhido (nunca abaixo de 30). */
export function thresholdWithAggression(threshold: number, mode: string | null | undefined) {
  return Math.max(30, threshold + profileFor(mode).confidenceDelta);
}

/** Valor da ordem ajustado ao modo. O limite diário de perda aplica-se sempre. */
export function amountWithAggression(amount: number, mode: string | null | undefined) {
  return Math.max(1, Math.round(amount * profileFor(mode).sizeFactor));
}

/**
 * Decide se o sinal passa o filtro do modo escolhido.
 * O modo passivo exige tendência de alta e RSI fora de sobrecompra, e deixa
 * passar parte das oportunidades para reduzir o número de operações.
 */
export function passesAggression(signal: Signal, mode: string | null | undefined) {
  const p = profileFor(mode);
  if (p.requireConfirmations) {
    if (signal.action === "COMPRAR" && (signal.trend !== "alta" || signal.rsi > 72)) return false;
    if (signal.action === "VENDER" && signal.trend !== "baixa") return false;
  }
  if (p.skipChance > 0 && Math.random() < p.skipChance) return false;
  return true;
}

/** Penalização extra à confiança mínima após uma perda (aprendizagem imediata). */
export function instantLearningPenalty(mode: string | null | undefined, pnl: number) {
  return profileFor(mode).instantLearning && pnl < 0 ? 2 : 0;
}
