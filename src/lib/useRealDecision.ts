/**
 * Contexto de decisão real para o interface.
 *
 * Reúne os mesmos dados que o motor no servidor usa em cada tick (modo real,
 * agressividade, confiança aprendida, piso do utilizador, pesos por moeda,
 * posições abertas e saldo real na Binance) e devolve um avaliador por moeda.
 */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Coin, Signal } from "@/lib/market";
import {
  evaluateRealNode,
  REAL_MIN_ORDER,
  type NodeDecision,
  type RealContext,
} from "@/lib/decisionContext";
import { refreshRealBalance } from "@/lib/wallet";

type Ctx = {
  realMode: boolean;
  aggression: string;
  learnedConfidence: number;
  userFloor: number;
  weights: Record<string, number>;
  positions: Record<string, number>;
  real: RealContext;
  waitReason: string | null;
};

async function loadContext(userId: string): Promise<Ctx> {
  const [settings, connection, strategy, stats, positions] = await Promise.all([
    supabase
      .from("bot_settings")
      .select("real_mode,aggression,user_min_confidence,real_trade_amount")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("exchange_connections")
      .select("real_trading_enabled,verified_at,last_balance")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("strategy_state").select("min_confidence").eq("user_id", userId).maybeSingle(),
    supabase.from("strategy_symbol_stats").select("symbol,weight").eq("user_id", userId),
    supabase.from("sim_positions").select("symbol,quantity").eq("user_id", userId),
  ]);

  const s = settings.data;
  const conn = connection.data;
  const realMode = Boolean(s?.real_mode && conn?.real_trading_enabled);

  const weights: Record<string, number> = {};
  for (const row of stats.data ?? []) weights[row.symbol] = Number(row.weight);
  const held: Record<string, number> = {};
  for (const row of positions.data ?? []) held[row.symbol] = Number(row.quantity);

  const real: RealContext = {
    quoteFree: 0,
    quote: "USDT",
    holdings: {},
    orderAmount: Number(s?.real_trade_amount ?? REAL_MIN_ORDER),
    blocked: null,
  };

  if (realMode) {
    if (!conn?.verified_at) {
      real.blocked = "Ligação à Binance ainda não verificada — faz a verificação só de leitura.";
    } else {
      const res = await refreshRealBalance();
      if (!res.ok) real.blocked = res.error;
      else {
        for (const a of res.balance.assets) real.holdings[a.asset.toUpperCase()] = a.free;
        const usdt = real.holdings["USDT"] ?? 0;
        const usdc = real.holdings["USDC"] ?? 0;
        real.quote = usdc > usdt ? "USDC" : "USDT";
        real.quoteFree = Math.max(usdt, usdc);
        if (!res.balance.canTrade) {
          real.blocked = "A chave da Binance não tem permissão de negociação (Spot Trading).";
        }
      }
    }
  }

  return {
    realMode,
    aggression: s?.aggression ?? "moderado",
    learnedConfidence: Number(strategy.data?.min_confidence ?? 55),
    userFloor: Number(s?.user_min_confidence ?? 55),
    weights,
    positions: held,
    real,
    waitReason: null,
  };
}

export type RealDecisionApi = {
  realMode: boolean;
  loading: boolean;
  evaluate: (coin: Coin, signal: Signal) => NodeDecision | null;
  quote: string;
  quoteFree: number;
  blocked: string | null;
};

export function useRealDecision(userId: string): RealDecisionApi {
  const ctx = useQuery({
    queryKey: ["real-decision-context", userId],
    queryFn: () => loadContext(userId),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const data = ctx.data;
  const evaluate = useCallback(
    (coin: Coin, signal: Signal): NodeDecision | null => {
      if (!data?.realMode) return null;
      const symbol = coin.symbol.toUpperCase();
      return evaluateRealNode({
        coin,
        signal,
        held: data.positions[symbol] ?? 0,
        realFree: data.real.holdings[symbol] ?? 0,
        aggression: data.aggression,
        learnedConfidence: data.learnedConfidence,
        userFloor: data.userFloor,
        weight: data.weights[symbol] ?? 1,
        real: data.real,
      });
    },
    [data],
  );

  return {
    realMode: Boolean(data?.realMode),
    loading: ctx.isLoading,
    evaluate,
    quote: data?.real.quote ?? "USDT",
    quoteFree: data?.real.quoteFree ?? 0,
    blocked: data?.real.blocked ?? null,
  };
}
