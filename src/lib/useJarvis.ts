import { useCallback, useEffect, useRef, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const dayLoss = useRef(0);

  const coinsRef = useRef(coins);
  const selRef = useRef(selected);
  const riskRef = useRef(risk);
  const alertsRef = useRef<AlertSettings>(defaultAlertSettings);
  coinsRef.current = coins;
  selRef.current = selected;
  riskRef.current = risk;

  useEffect(() => {
    let active = true;
    loadAlertSettings(userId)
      .then((s) => {
        if (active) alertsRef.current = s;
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
      } else {
        await supabase.from("bot_settings").insert({ user_id: userId });
      }

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

      const r = riskRef.current;
      const amount = Math.max(r.minTrade, Math.round(r.minTrade * (1 + Math.random() * 3)));
      const win = Math.random() * 100 < signal.confidence;
      const raw = win
        ? amount * (0.004 + Math.random() * 0.03)
        : -amount * (0.004 + Math.random() * 0.03);
      const pnl = Number(Math.max(-r.maxLossPerTrade, raw).toFixed(2));

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
          body: `Ordem simulada de ${amount}€ com confiança ${signal.confidence}%. ${signal.reason}`,
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
          confidence: signal.confidence,
          reason: signal.reason,
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
              confidence: signal.confidence,
              reason: signal.reason,
            },
            ...l,
          ].slice(0, 100),
        );
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
  };
}
