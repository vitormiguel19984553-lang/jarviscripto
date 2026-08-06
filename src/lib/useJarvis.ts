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
  defaultProtection,
  exitLabels,
  simulateProtectedTrade,
  type Protection,
} from "@/lib/protection";



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
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState<StrategyState>(defaultStrategy);
  const [symbolStats, setSymbolStats] = useState<SymbolStat[]>([]);
  const [plan, setPlan] = useState<PlanTier>("normal");
  const dayLoss = useRef(0);

  const coinsRef = useRef(coins);
  const selRef = useRef(selected);
  const riskRef = useRef(risk);
  const protectionRef = useRef(protection);
  const alertsRef = useRef<AlertSettings>(defaultAlertSettings);
  const strategyRef = useRef<StrategyState>(defaultStrategy);
  const statsRef = useRef<Map<string, SymbolStat>>(new Map());
  const pnlHistoryRef = useRef<number[]>([]);
  const planRef = useRef<PlanTier>("normal");
  coinsRef.current = coins;
  selRef.current = selected;
  riskRef.current = risk;
  protectionRef.current = protection;


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
        setAvailable(Number(wallet.data.available));
        setInvested(Number(wallet.data.invested));
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
      await supabase
        .from("wallets")
        .upsert(
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
      const coin = pool[Math.floor(Math.random() * pool.length)];
      const signal = analyse(coin);
      if (signal.action === "AGUARDAR") return;

      const symbol = coin.symbol.toUpperCase();
      const st = strategyRef.current;
      const stat = statsRef.current.get(symbol) ?? defaultStat(symbol);
      // A IA só executa se o sinal superar o limite aprendido para esta moeda.
      const threshold = thresholdForSymbol(st.min_confidence, stat.weight);
      if (signal.confidence < threshold) return;

      // Cérebro da IA: consultar a memória de padrões antes de decidir.
      const pattern = patternFor(signal, coin);
      let memory: MemoryRow | null = null;
      let memoryNote = "";
      let confidence = signal.confidence;
      try {
        const mem = await loadPatternMemory(userId, pattern);
        memory = mem.own;
        const revised = reviseConfidence(signal.confidence, mem.own, mem.global);
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
      const amount = sizeForWeight(base, stat.weight);
      // Proteções de ordem: a saída acontece no take profit, stop loss ou
      // trailing stop, conforme o caminho simulado do preço.
      const sim = simulateProtectedTrade(
        amount,
        confidence / 100,
        protectionRef.current,
        Math.max(0.2, Math.min(1.5, Math.abs(coin.price_change_percentage_24h ?? 0) / 6 || 0.6)),
      );
      const pnl = Number(Math.max(-r.maxLossPerTrade, sim.pnl).toFixed(2));
      const exitReason =
        `${signal.reason} · saída por ${exitLabels[sim.exit]} (${sim.movePct}%)` +
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

  const deposit = (amount: number) => {
    if (amount <= 0) return;
    const a = available + amount;
    setAvailable(a);
    void persistWallet(a, invested);
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
    plan,
    limits: limitsFor(plan),

  };
}
