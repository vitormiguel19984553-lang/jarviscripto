/**
 * Contexto de decisão partilhado.
 *
 * Traduz o mesmo raciocínio do motor no servidor (`/api/public/bot-tick`) para
 * qualquer superfície do interface: limite de confiança efetivo (aprendido +
 * piso do utilizador + peso da moeda + ajuste do modo de agressividade) e
 * executabilidade real (saldo em cotação para comprar, moeda detida para
 * vender). Módulo puro — não faz pedidos de rede.
 */

import type { Coin, Signal } from "@/lib/market";
import { passesAggression, thresholdWithAggression } from "@/lib/aggression";
import { thresholdForSymbol, withUserFloor } from "@/lib/learning";

/** Mínimo prático por ordem na Binance Spot (em moeda de cotação). */
export const REAL_MIN_ORDER = 5;

export type RealContext = {
  /** Saldo livre na moeda de cotação (USDT/USDC). */
  quoteFree: number;
  /** Nome da moeda de cotação usada nas ordens. */
  quote: string;
  /** Quantidade detida por símbolo (BTC, ETH, …). */
  holdings: Record<string, number>;
  /** Valor configurado por ordem real. */
  orderAmount: number;
  /** Bloqueio global (ex.: parada de emergência, ligação não verificada). */
  blocked: string | null;
};

export type DecisionStatus =
  | "ready"
  | "no_signal"
  | "below_threshold"
  | "mode_filtered"
  | "no_balance"
  | "no_holdings"
  | "blocked";

export type NodeDecision = {
  status: DecisionStatus;
  /** Verdadeiro só quando a IA colocaria a ordem real agora. */
  executable: boolean;
  /** Tem sinal técnico com confiança suficiente, mesmo que não executável. */
  hasEdge: boolean;
  threshold: number;
  label: string;
  detail: string;
};

export type EvaluateArgs = {
  coin: Coin;
  signal: Signal;
  /** Quantidade da posição no livro (0 quando não há posição). */
  held: number;
  /** Saldo livre desta moeda na Binance do utilizador. */
  realFree: number;
  aggression: string | null | undefined;
  learnedConfidence: number;
  userFloor: number;
  weight: number;
  real: RealContext;
};

/** Limite de confiança efetivo para esta moeda, igual ao usado no servidor. */
export function effectiveThreshold(args: {
  aggression: string | null | undefined;
  learnedConfidence: number;
  userFloor: number;
  weight: number;
}) {
  return thresholdWithAggression(
    thresholdForSymbol(withUserFloor(args.learnedConfidence, args.userFloor), args.weight),
    args.aggression,
  );
}

/**
 * Avalia um nó do mapa mental no contexto do modo real: mesma ordem de
 * filtros do motor no servidor (sinal → agressividade → confiança → saldo).
 */
export function evaluateRealNode(args: EvaluateArgs): NodeDecision {
  const { signal, held, real } = args;
  const threshold = effectiveThreshold(args);
  const wants = held > 0 ? "VENDER" : "COMPRAR";

  if (real.blocked) {
    return {
      status: "blocked",
      executable: false,
      hasEdge: signal.confidence >= threshold && signal.action === wants,
      threshold,
      label: "BLOQUEADO",
      detail: real.blocked,
    };
  }

  if (signal.action !== wants) {
    return {
      status: "no_signal",
      executable: false,
      hasEdge: false,
      threshold,
      label: held > 0 ? "SEM SINAL DE VENDA" : "SEM SINAL DE COMPRA",
      detail:
        held > 0
          ? "Tens esta moeda, mas a IA ainda não vê um sinal de venda — mantém a posição."
          : "A IA não vê uma entrada de compra nesta moeda neste momento.",
    };
  }

  if (!passesAggression(signal, args.aggression)) {
    return {
      status: "mode_filtered",
      executable: false,
      hasEdge: signal.confidence >= threshold,
      threshold,
      label: "FILTRADO PELO MODO",
      detail: `O modo de agressividade escolhido exige mais confirmações (alinhamento ${signal.alignment}) antes de agir.`,
    };
  }

  if (signal.confidence < threshold) {
    return {
      status: "below_threshold",
      executable: false,
      hasEdge: false,
      threshold,
      label: "CONFIANÇA INSUFICIENTE",
      detail: `Confiança ${signal.confidence}% abaixo do limite real exigido (${threshold.toFixed(0)}%) para esta moeda.`,
    };
  }

  if (held > 0) {
    if (args.realFree <= 0) {
      return {
        status: "no_holdings",
        executable: false,
        hasEdge: true,
        threshold,
        label: "SEM MOEDA PARA VENDER",
        detail: "Não há saldo desta moeda na tua Binance para executar a venda.",
      };
    }
    return {
      status: "ready",
      executable: true,
      hasEdge: true,
      threshold,
      label: "VENDA REAL PRONTA",
      detail: `Sinal de venda acima do limite real (${threshold.toFixed(0)}%) e tens a moeda em carteira.`,
    };
  }

  const needed = Math.max(REAL_MIN_ORDER, real.orderAmount);
  if (real.quoteFree < needed) {
    return {
      status: "no_balance",
      executable: false,
      hasEdge: true,
      threshold,
      label: "SALDO REAL INSUFICIENTE",
      detail: `Precisas de ${needed.toFixed(2)} ${real.quote} livres e tens ${real.quoteFree.toFixed(2)} ${real.quote}.`,
    };
  }

  return {
    status: "ready",
    executable: true,
    hasEdge: true,
    threshold,
    label: "COMPRA REAL PRONTA",
    detail: `Confiança ${signal.confidence}% acima do limite real (${threshold.toFixed(0)}%) e há ${real.quoteFree.toFixed(2)} ${real.quote} livres.`,
  };
}
