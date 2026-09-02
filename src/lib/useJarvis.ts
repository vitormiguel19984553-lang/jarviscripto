import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type Coin, analyse } from "@/lib/market";
import { supabase } from "@/integrations/supabase/client";
import {
  createAlert,
  defaultAlertSettings,
  loadAlertSettings,
  type AlertSettings,
} from "@/lib/alerts";
import {
  defaultStat,
  defaultStrategy,
  loadStrategy,
  loadSymbolStats,
  recordOutcome,
  type StrategyState,
  type SymbolStat,
} from "@/lib/strategy";
import { sizeForWeight, thresholdForSymbol } from "@/lib/learning";
import { patternFor, reviseConfidence, type MemoryRow } from "@/lib/brain";
import { loadPatternMemory, recordPattern } from "@/lib/brainStore";
import { limitsFor, type PlanTier } from "@/lib/plans";
import { loadPlan } from "@/lib/planStore";
import {
  amountWithAggression,
  instantLearningPenalty,
  passesAggression,
  thresholdWithAggression,
  type Aggression,
} from "@/lib/aggression";
import {
  defaultProtection,
  exitLabels,
  simulateProtectedTrade,
  type Protection,
} from "@/lib/protection";
import { cooldownMsFor } from "@/lib/aggression";
import {
  DEFAULT_DIVERSIFICATION_CAP,
  detectShock,
  diversificationRoom,
  hourlyCapReached,
  recentVolatility,
  scaleProtection,
} from "@/lib/risk";
import { resolveStrategy, type StrategyName } from "@/lib/strategies";
import { fetchSentiment, sentimentAdjust, type Sentiment } from "@/lib/sentiment";

/** Limite de capital fictício na carteira de simulação (€). */
export const SIM_CAPITAL_CAP = 100_000;

export type TradeLog = {
  id: string;
  time: Date;
  symbol: string;
  action: "COMPRA" | "VENDA";
  amount: number;
  pnl: number;
  confidence: number;
  reason: string;
};

export type Risk = {
  minTrade: number;
  maxLossPerTrade: number;
  maxLossPerDay: number;
};

export function useJarvis(userId: string, coins: Coin[]) {
  const [available, setAvailable] = useState(0);
  const [invested, setInvested] = useState(0);
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [durationHours, setDurationHours] = useState(5);
  const [remaining, setRemaining] = useState(0);
  const [risk, setRisk] = useState<Risk>({
    minTrade: 25,
    maxLossPerTrade: 15,
    maxLossPerDay: 60,
  });
  const [halted, setHalted] = useState(false);
  const [protection, setProtection] = useState<Protection>(defaultProtection);
  const [aggression, setAggression] = useState<Aggression>("moderado");
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState<StrategyState>(defaultStrategy);
  const [symbolStats, setSymbolStats] = useState<SymbolStat[]>([]);
  const [plan, setPlan] = useState<PlanTier>("normal");
  const [maxTradesPerHour, setMaxTradesPerHour] = useState(6);
  const [diversificationCap, setDiversificationCap] = useState(DEFAULT_DIVERSIFICATION_CAP);
  const [useSentiment, setUseSentiment] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [strategyChoice, setStrategyChoice] = useState<StrategyName | "auto">("auto");
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [shockNote, setShockNote] = useState<string>("");
  const dayLoss = useRef(0);

  const coinsRef = useRef(coins);
  const selRef = useRef(selected);
  const riskRef = useRef(risk);
  const protectionRef = useRef(protection);
  const aggressionRef = useRef<Aggression>("moderado");
  const alertsRef = useRef<AlertSettings>(defaultAlertSettings);
  const strategyRef = useRef<StrategyState>(defaultStrategy);
  const statsRef = useRef<Map<string, SymbolStat>>(new Map());
  const pnlHistoryRef = useRef<number[]>([]);
  const planRef = useRef<PlanTier>("normal");
  const freqRef = useRef(6);
  const capRef = useRef(DEFAULT_DIVERSIFICATION_CAP);
  const sentimentOnRef = useRef(false);
  const sentimentRef = useRef<Sentiment | null>(null);
  const strategyChoiceRef = useRef<StrategyName | "auto">("auto");
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const tradeTimesRef = useRef<number[]>([]);
  const exposureRef = useRef<Map<string, number>>(new Map());
  const capitalRef = useRef(0);
  coinsRef.current = coins;
  selRef.current = selected;
  riskRef.current = risk;
  protectionRef.current = protection;
  aggressionRef.current = aggression;
  freqRef.current = maxTradesPerHour;
  capRef.current = diversificationCap;
  sentimentOnRef.current = useSentiment;
  sentimentRef.current = sentiment;
  strategyChoiceRef.current = strategyChoice;
  capitalRef.current = available + invested;

  useEffect(() => {
    let active = true;
    loadAlertSettings(userId)
      .then((s) => {
        if (active) alertsRef.current = s;
      })
      .catch(() => undefined);
    loadPlan(userId)
      .then((p) => {
        if (!active) return;
        planRef.current = p;
        setPlan(p);
        // O plano limita a duração máxima da automação no browser.
        const allowed = limitsFor(p).clientHours;
        setDurationHours((h) => (allowed.includes(h) ? h : allowed[allowed.length - 1]));
      })
      .catch(() => undefined);
    Promise.all([loadStrategy(userId), loadSymbolStats(userId)])
      .then(([st, stats]) => {
        if (!active) return;
        strategyRef.current = st;
        setStrategy(st);
        const map = new Map(stats.map((s) => [s.symbol, s]));
        statsRef.current = map;
        setSymbolStats(stats);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  // Sentimento de mercado (opcional, atualizado de 10 em 10 minutos)
  useEffect(() => {
    if (!useSentiment) {
      setSentiment(null);
      return;
    }
    let active = true;
    const load = () =>
      fetchSentiment()
        .then((s) => {
          if (active) setSentiment(s);
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 600_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [useSentiment]);

  // Carregar carteira, definições e histórico da Cloud
  useEffect(() => {
    let active = true;
    (async () => {
      const [wallet, settings, trades] = await Promise.all([
        supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("bot_settings").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("trades")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (!active) return;

      if (wallet.data) {
        const storedAvailable = Number(wallet.data.available);
        const storedInvested = Number(wallet.data.invested);
        const cappedInvested = Math.min(Math.max(0, storedInvested), SIM_CAPITAL_CAP);
        const cappedAvailable = Math.min(
          Math.max(0, storedAvailable),
          Math.max(0, SIM_CAPITAL_CAP - cappedInvested),
        );
        setAvailable(cappedAvailable);
        setInvested(cappedInvested);
        if (cappedAvailable !== storedAvailable || cappedInvested !== storedInvested) {
          const { error } = await supabase
            .from("wallets")
            .update({
              available: cappedAvailable,
              invested: cappedInvested,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          if (error) toast.error("Não foi possível corrigir o capital virtual acima do limite.");
          else toast.info("A carteira de simulação foi ajustada ao limite de 100.000 €.");
        }
      } else {
        await supabase.from("wallets").insert({ user_id: userId });
        setAvailable(10000);
      }

      if (settings.data) {
        setDurationHours(settings.data.duration_hours);
        setSelected(settings.data.selected_coins ?? []);
        setRisk({
          minTrade: Number(settings.data.min_trade),
          maxLossPerTrade: Number(settings.data.max_loss_trade),
          maxLossPerDay: Number(settings.data.max_loss_day),
        });
        setAggression((settings.data.aggression as Aggression) ?? "moderado");
        setMaxTradesPerHour(Number(settings.data.max_trades_per_hour ?? 6));
        setDiversificationCap(
          Number(settings.data.diversification_cap_pct ?? DEFAULT_DIVERSIFICATION_CAP),
        );
        setUseSentiment(Boolean(settings.data.use_sentiment));
        setSandbox(Boolean(settings.data.sandbox_mode));
        setStrategyChoice(((settings.data.strategy as StrategyName | "auto") ?? "auto"));
        setProtection({
          takeProfitPct: Number(settings.data.take_profit_pct ?? defaultProtection.takeProfitPct),
          stopLossPct: Number(settings.data.stop_loss_pct ?? defaultProtection.stopLossPct),
          trailingStopPct: Number(
            settings.data.trailing_stop_pct ?? defaultProtection.trailingStopPct,
          ),
        });
      } else {
        await supabase.from("bot_settings").insert({ user_id: userId });
      }

      pnlHistoryRef.current = (trades.data ?? []).map((t) => Number(t.pnl));

      setLogs(
        (trades.data ?? []).map((t) => ({
          id: t.id,
          time: new Date(t.created_at),
          symbol: t.symbol,
          action: t.action as "COMPRA" | "VENDA",
          amount: Number(t.amount),
          pnl: Number(t.pnl),
          confidence: t.confidence,
          reason: t.reason,
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const persistWallet = useCallback(
    async (nextAvailable: number, nextInvested: number) => {
      await supabase.from("wallets").upsert(
        {
          user_id: userId,
          available: nextAvailable,
          invested: nextInvested,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    },
    [userId],
  );

  const persistSettings = useCallback(
    async (patch: Record<string, unknown>) => {
      await supabase
        .from("bot_settings")
        .upsert(
          { user_id: userId, updated_at: new Date().toISOString(), ...patch },
          { onConflict: "user_id" },
        );
    },
    [userId],
  );

  const toggleCoin = (id: string) => {
    setSelected((s) => {
      if (!s.includes(id) && s.length >= limitsFor(planRef.current).maxCoins) {
        toast.error(
          `O plano ${limitsFor(planRef.current).label} permite até ${limitsFor(planRef.current).maxCoins} moedas em simultâneo.`,
        );
        return s;
      }
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      void persistSettings({ selected_coins: next });
      return next;
    });
  };

  const updateRisk = (next: Risk) => {
    setRisk(next);
    void persistSettings({
      min_trade: next.minTrade,
      max_loss_trade: next.maxLossPerTrade,
      max_loss_day: next.maxLossPerDay,
    });
  };

  const updateProtection = (next: Protection) => {
    setProtection(next);
    void persistSettings({
      take_profit_pct: next.takeProfitPct,
      stop_loss_pct: next.stopLossPct,
      trailing_stop_pct: next.trailingStopPct,
    });
  };

  const updateAggression = (next: Aggression) => {
    setAggression(next);
    void persistSettings({ aggression: next });
  };

  const updateMaxTradesPerHour = (n: number) => {
    const v = Math.max(1, Math.min(20, Math.round(n)));
    setMaxTradesPerHour(v);
    void persistSettings({ max_trades_per_hour: v });
  };

  const updateDiversificationCap = (n: number) => {
    const v = Math.max(5, Math.min(100, Math.round(n)));
    setDiversificationCap(v);
    void persistSettings({ diversification_cap_pct: v });
  };

  const updateUseSentiment = (v: boolean) => {
    setUseSentiment(v);
    void persistSettings({ use_sentiment: v });
  };

  const updateSandbox = (v: boolean) => {
    setSandbox(v);
    void persistSettings({ sandbox_mode: v });
  };

  const updateStrategyChoice = (v: StrategyName | "auto") => {
    setStrategyChoice(v);
    void persistSettings({ strategy: v });
  };

  const updateDuration = (h: number) => {
    setDurationHours(h);
    void persistSettings({ duration_hours: h });
  };

  const stopAll = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    setHalted(true);
  }, []);

  const start = useCallback(() => {
    setHalted(false);
    setRemaining(durationHours * 3600);
    setRunning(true);
  }, [durationHours]);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const engine = setInterval(async () => {
      const pool = coinsRef.current.filter((c) => selRef.current.includes(c.id));
      if (!pool.length) return;
      // Teto absoluto de operações por hora, definido pelo utilizador.
      if (hourlyCapReached(tradeTimesRef.current, freqRef.current)) return;
      const coin = pool[Math.floor(Math.random() * pool.length)];
      const symbolKey = coin.symbol.toUpperCase();
      // Espera mínima entre operações na mesma moeda (depende do modo).
      const lastAt = cooldownRef.current.get(symbolKey) ?? 0;
      if (Date.now() - lastAt < cooldownMsFor(aggressionRef.current)) return;
      const signal = analyse(coin);
      if (signal.action === "AGUARDAR") return;
      // Detetor de choque: movimento anormal trava novas entradas.
      const shock = detectShock(coin);
      if (shock.detected) {
        setShockNote(`${symbolKey}: ${shock.reason}`);
        if (alertsRef.current.on_risk_halt) {
          void createAlert({
            userId,
            kind: "shock",
            title: `Choque de mercado em ${symbolKey}`,
            body: shock.reason,
          }).catch(() => undefined);
        }
        return;
      }
      // Modo de agressividade: filtra o sinal antes de qualquer decisão.
      if (!passesAggression(signal, aggressionRef.current)) return;

      const symbol = coin.symbol.toUpperCase();
      const st = strategyRef.current;
      const stat = statsRef.current.get(symbol) ?? defaultStat(symbol);
      // A IA só executa se o sinal superar o limite aprendido para esta moeda.
      const threshold = thresholdWithAggression(
        thresholdForSymbol(st.min_confidence, stat.weight),
        aggressionRef.current,
      );
      // Estratégia nomeada + regime de mercado desta moeda.
      const strat = resolveStrategy(strategyChoiceRef.current, signal, coin);
      let stratConfidence = strat.confidence;
      let sentimentNote = "";
      if (sentimentOnRef.current && sentimentRef.current) {
        const adj = sentimentAdjust(sentimentRef.current, signal.action);
        stratConfidence = Math.max(5, Math.min(95, Math.round(stratConfidence + adj.points)));
        sentimentNote = adj.note;
      }
      if (stratConfidence < threshold) return;

      // Cérebro da IA: consultar a memória de padrões antes de decidir.
      const pattern = patternFor(signal, coin);
      let memory: MemoryRow | null = null;
      let memoryNote = "";
      let confidence = stratConfidence;
      try {
        const mem = await loadPatternMemory(userId, pattern);
        memory = mem.own;
        const revised = reviseConfidence(stratConfidence, mem.own, mem.global);
        confidence = revised.confidence;
        memoryNote = revised.note;
      } catch {
        /* a memória nunca bloqueia a operação */
      }
      if (confidence < threshold) {
        if (memoryNote) {
          setLogs((l) =>
            [
              {
                id: `mem-${Date.now()}`,
                time: new Date(),
                symbol,
                action: "VENDA" as const,
                amount: 0,
                pnl: 0,
                confidence,
                reason: `Entrada evitada — ${memoryNote}.`,
              },
              ...l,
            ].slice(0, 100),
          );
        }
        return;
      }

      const r = riskRef.current;
      const base = Math.max(r.minTrade, Math.round(r.minTrade * (1 + Math.random() * 3)));
      let amount = amountWithAggression(sizeForWeight(base, stat.weight), aggressionRef.current);
      // Diversificação: nunca mais do que X% do capital numa só moeda.
      const room = diversificationRoom({
        totalCapital: capitalRef.current,
        exposureForSymbol: exposureRef.current.get(symbol) ?? 0,
        capPct: capRef.current,
      });
      if (room < r.minTrade) {
        setLogs((l) =>
          [
            {
              id: `cap-${Date.now()}`,
              time: new Date(),
              symbol,
              action: "VENDA" as const,
              amount: 0,
              pnl: 0,
              confidence,
              reason: `Entrada evitada — limite de diversificação de ${capRef.current}% do capital atingido em ${symbol}.`,
            },
            ...l,
          ].slice(0, 100),
        );
        return;
      }
      amount = Math.max(1, Math.min(amount, Math.floor(room)));
      // Proteções de ordem: a saída acontece no take profit, stop loss ou
      // trailing stop, conforme o caminho simulado do preço.
      // Proteções escaladas pela volatilidade recente desta moeda.
      const coinVol = recentVolatility(coin);
      const dynamicProtection = scaleProtection(protectionRef.current, coinVol);
      const sim = simulateProtectedTrade(amount, confidence / 100, dynamicProtection, coinVol);
      const pnl = Number(Math.max(-r.maxLossPerTrade, sim.pnl).toFixed(2));
      const exitReason =
        `${signal.reason} · ${strat.note} · SL ${dynamicProtection.stopLossPct}% / TP ${dynamicProtection.takeProfitPct}% (volatilidade ${coinVol.toFixed(2)}%) · saída por ${exitLabels[sim.exit]} (${sim.movePct}%)` +
        (sentimentNote ? ` · ${sentimentNote}` : "") +
        (memoryNote ? ` · ${memoryNote}` : "");

      if (pnl < 0 && dayLoss.current + Math.abs(pnl) > r.maxLossPerDay) {
        setRunning(false);
        setHalted(true);
        if (alertsRef.current.on_risk_halt) {
          void createAlert({
            userId,
            kind: "risk_halt",
            title: "Automação parada — limite diário atingido",
            body: `A perda acumulada aproximou-se do limite de ${r.maxLossPerDay}€ por dia. O Jarvis desligou a automação por segurança.`,
          }).catch(() => undefined);
        }
        return;
      }
      if (pnl < 0) dayLoss.current += Math.abs(pnl);

      const action = signal.action === "COMPRAR" ? ("COMPRA" as const) : ("VENDA" as const);
      if (alertsRef.current.on_trade && Math.abs(pnl) >= alertsRef.current.min_pnl) {
        void createAlert({
          userId,
          kind: "trade",
          title: `${action} ${coin.symbol.toUpperCase()} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}€`,
          body: `Ordem simulada de ${amount}€ com confiança ${confidence}%. ${exitReason}`,
        }).catch(() => undefined);
      }

      tradeTimesRef.current = [Date.now(), ...tradeTimesRef.current].slice(0, 60);
      cooldownRef.current.set(symbol, Date.now());
      exposureRef.current.set(symbol, (exposureRef.current.get(symbol) ?? 0) + amount);
      setShockNote("");

      const { data } = await supabase
        .from("trades")
        .insert({
          user_id: userId,
          symbol: coin.symbol.toUpperCase(),
          action,
          amount,
          pnl,
          confidence,
          reason: exitReason,
        })
        .select()
        .single();

      setInvested((v) => {
        const next = Number((v + pnl).toFixed(2));
        setAvailable((a) => {
          void persistWallet(a, next);
          return a;
        });
        return next;
      });

      if (data) {
        setLogs((l) =>
          [
            {
              id: data.id,
              time: new Date(data.created_at),
              symbol: data.symbol,
              action,
              amount,
              pnl,
              confidence,
              reason: exitReason,
            },
            ...l,
          ].slice(0, 100),
        );
      }

      // Auto-aprendizagem: registar resultado e reajustar a estratégia.
      pnlHistoryRef.current = [pnl, ...pnlHistoryRef.current].slice(0, 200);
      try {
        const res = await recordOutcome({
          userId,
          symbol,
          pnl,
          recentPnls: pnlHistoryRef.current,
          state: strategyRef.current,
          stat,
        });
        // Modo agressivo: aprendizagem imediata — cada perda sobe logo a fasquia.
        const extra = instantLearningPenalty(aggressionRef.current, pnl);
        if (extra) {
          res.state = {
            ...res.state,
            min_confidence: Math.min(90, res.state.min_confidence + extra),
          };
        }
        strategyRef.current = res.state;
        statsRef.current.set(symbol, res.stat);
        setStrategy(res.state);
        setSymbolStats([...statsRef.current.values()]);
      } catch {
        /* aprendizagem não bloqueia a operação */
      }

      // Memória: guardar o resultado deste padrão para decisões futuras.
      try {
        await recordPattern(userId, pattern, memory, pnl);
      } catch {
        /* memória não bloqueia a operação */
      }
    }, 4000);
    return () => clearInterval(engine);
  }, [running, userId, persistWallet]);

  const transfer = (amount: number, toInvest: boolean) => {
    if (amount <= 0) return;
    if (toInvest && amount <= available) {
      const a = available - amount;
      const i = invested + amount;
      setAvailable(a);
      setInvested(i);
      void persistWallet(a, i);
    } else if (!toInvest && amount <= invested) {
      const a = available + amount;
      const i = invested - amount;
      setAvailable(a);
      setInvested(i);
      void persistWallet(a, i);
    }
  };

  /**
   * Capital fictício máximo da simulação. Impede "criar" dinheiro sem limite
   * na carteira virtual — o dinheiro real vive sempre na Binance do utilizador.
   */
  const deposit = (amount: number): { ok: boolean; reason?: string } => {
    if (amount <= 0) return { ok: false, reason: "Indica um montante acima de zero." };
    const total = available + invested;
    if (total >= SIM_CAPITAL_CAP) {
      return {
        ok: false,
        reason: `A carteira de simulação já atingiu o limite de ${SIM_CAPITAL_CAP.toLocaleString("pt-PT")} € de capital fictício.`,
      };
    }
    const allowed = Math.min(amount, SIM_CAPITAL_CAP - total);
    const a = available + allowed;
    setAvailable(a);
    void persistWallet(a, invested);
    return allowed < amount
      ? {
          ok: true,
          reason: `Só foram adicionados ${allowed.toLocaleString("pt-PT")} € (limite de capital fictício).`,
        }
      : { ok: true };
  };

  return {
    loading,
    available,
    invested,
    logs,
    selected,
    toggleCoin,
    running,
    setRunning,
    durationHours,
    setDurationHours: updateDuration,
    remaining,
    risk,
    setRisk: updateRisk,
    halted,
    start,
    stopAll,
    transfer,
    deposit,
    strategy,
    symbolStats,
    protection,
    setProtection: updateProtection,
    aggression,
    setAggression: updateAggression,
    plan,
    limits: limitsFor(plan),
    maxTradesPerHour,
    setMaxTradesPerHour: updateMaxTradesPerHour,
    diversificationCap,
    setDiversificationCap: updateDiversificationCap,
    useSentiment,
    setUseSentiment: updateUseSentiment,
    sandbox,
    setSandbox: updateSandbox,
    strategyChoice,
    setStrategyChoice: updateStrategyChoice,
    sentiment,
    shockNote,
  };
}
