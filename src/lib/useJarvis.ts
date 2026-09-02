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
import {
  sizeForWeight,
  thresholdForSymbol,
  USER_CONFIDENCE_MAX,
  USER_CONFIDENCE_MIN,
  withUserFloor,
} from "@/lib/learning";
import { patternFor, reviseConfidence, type MemoryRow, type Pattern } from "@/lib/brain";
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
import { defaultProtection, exitLabels, type Protection } from "@/lib/protection";
import { afterBuy, closeResult, forcedExit, type SimPosition } from "@/lib/positions";
import { closePosition, loadPositions, savePeak, savePosition } from "@/lib/positionsStore";

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
  const [positions, setPositions] = useState<SimPosition[]>([]);
  const [minConfidence, setMinConfidence] = useState(55);
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
  const positionsRef = useRef<SimPosition[]>([]);
  const minConfRef = useRef(55);
  const availRef = useRef(0);
  const investRef = useRef(0);
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
  minConfRef.current = minConfidence;
  availRef.current = available;
  investRef.current = invested;


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
        setMinConfidence(
          Number((settings.data as { user_min_confidence?: number }).user_min_confidence ?? 55),
        );
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

      // Posições simuladas realmente detidas (persistidas na Cloud).
      try {
        const pos = await loadPositions(userId);
        if (active) {
          positionsRef.current = pos;
          setPositions(pos);
          const expo = new Map<string, number>();
          for (const p of pos) expo.set(p.symbol, p.invested);
          exposureRef.current = expo;
        }
      } catch {
        /* posições ausentes não bloqueiam o motor */
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

  /** Piso de confiança escolhido pelo utilizador (45–90%), igual em real e simulação. */
  const updateMinConfidence = (n: number) => {
    const v = Math.max(
      USER_CONFIDENCE_MIN,
      Math.min(USER_CONFIDENCE_MAX, Math.round(Number(n) || USER_CONFIDENCE_MIN)),
    );
    setMinConfidence(v);
    void persistSettings({ user_min_confidence: v });
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
      const r = riskRef.current;

      const logLine = (line: Omit<TradeLog, "id" | "time"> & { id?: string; time?: Date }) =>
        setLogs((l) =>
          [
            {
              id: line.id ?? `x-${Date.now()}`,
              time: line.time ?? new Date(),
              symbol: line.symbol,
              action: line.action,
              amount: line.amount,
              pnl: line.pnl,
              confidence: line.confidence,
              reason: line.reason,
            },
            ...l,
          ].slice(0, 100),
        );

      /** Aprendizagem simétrica: compras e vendas alimentam o mesmo cérebro. */
      const learnFrom = async (symbol: string, pnl: number, patterns: Pattern[]) => {
        pnlHistoryRef.current = [pnl, ...pnlHistoryRef.current].slice(0, 200);
        const stat = statsRef.current.get(symbol) ?? defaultStat(symbol);
        try {
          const res = await recordOutcome({
            userId,
            symbol,
            pnl,
            recentPnls: pnlHistoryRef.current,
            state: strategyRef.current,
            stat,
          });
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
        for (const p of patterns) {
          try {
            const mem = await loadPatternMemory(userId, p);
            await recordPattern(userId, p, mem.own, pnl);
          } catch {
            /* memória não bloqueia a operação */
          }
        }
      };

      /** Fecha a posição ao preço real de mercado e realiza o resultado. */
      const closeAt = async (
        pos: SimPosition,
        coin: Coin,
        note: string,
        confidence: number,
        sellPattern: Pattern | null,
      ) => {
        const price = coin.current_price;
        const res = closeResult(pos, price);
        const reason =
          `Saída de ${pos.symbol} a ${price.toFixed(4)}€ (entrada média ${pos.avg_entry_price.toFixed(4)}€, ${res.movePct}%) · ${note}`.trim();

        try {
          await closePosition(userId, pos.symbol);
        } catch {
          return;
        }
        positionsRef.current = positionsRef.current.filter((p) => p.symbol !== pos.symbol);
        setPositions([...positionsRef.current]);

        const nextAvailable = Number((availRef.current + res.proceeds).toFixed(2));
        const nextInvested = Number(Math.max(0, investRef.current - res.investedPart).toFixed(2));
        availRef.current = nextAvailable;
        investRef.current = nextInvested;
        setAvailable(nextAvailable);
        setInvested(nextInvested);
        void persistWallet(nextAvailable, nextInvested);

        exposureRef.current.set(
          pos.symbol,
          Math.max(0, (exposureRef.current.get(pos.symbol) ?? 0) - res.investedPart),
        );
        cooldownRef.current.set(pos.symbol, Date.now());
        tradeTimesRef.current = [Date.now(), ...tradeTimesRef.current].slice(0, 60);

        const { data } = await supabase
          .from("trades")
          .insert({
            user_id: userId,
            symbol: pos.symbol,
            action: "VENDA",
            amount: res.investedPart,
            pnl: res.pnl,
            confidence,
            reason,
          })
          .select()
          .single();

        logLine({
          id: data?.id,
          time: data ? new Date(data.created_at) : new Date(),
          symbol: pos.symbol,
          action: "VENDA",
          amount: res.investedPart,
          pnl: res.pnl,
          confidence,
          reason,
        });

        if (alertsRef.current.on_trade && Math.abs(res.pnl) >= alertsRef.current.min_pnl) {
          void createAlert({
            userId,
            kind: "trade",
            title: `VENDA ${pos.symbol} · ${res.pnl >= 0 ? "+" : ""}${res.pnl.toFixed(2)}€`,
            body: `Posição simulada de ${res.investedPart}€ fechada com confiança ${confidence}%. ${reason}`,
          }).catch(() => undefined);
        }

        const patterns: Pattern[] = [];
        if (pos.entry_pattern_key) {
          patterns.push({
            key: pos.entry_pattern_key,
            description: pos.entry_pattern_desc ?? pos.entry_pattern_key,
          });
        }
        if (sellPattern) patterns.push(sellPattern);
        await learnFrom(pos.symbol, res.pnl, patterns);

        if (res.pnl < 0) {
          dayLoss.current += Math.abs(res.pnl);
          if (dayLoss.current > r.maxLossPerDay) {
            setRunning(false);
            setHalted(true);
            if (alertsRef.current.on_risk_halt) {
              void createAlert({
                userId,
                kind: "risk_halt",
                title: "Automação parada — limite diário atingido",
                body: `A perda acumulada atingiu o limite de ${r.maxLossPerDay}€ por dia. O Jarvis desligou a automação por segurança.`,
              }).catch(() => undefined);
            }
          }
        }
      };

      // ── 1. Rede de segurança das posições abertas ─────────────────────────
      // Corre antes da IA: stop loss, take profit e trailing stop podem fechar
      // uma posição mesmo contra a vontade da IA.
      for (const pos of positionsRef.current) {
        const coin = coinsRef.current.find((c) => c.id === pos.coin_id);
        if (!coin) continue;
        const dyn = scaleProtection(protectionRef.current, recentVolatility(coin));
        const forced = forcedExit(pos, coin.current_price, dyn);
        if (!forced.exit) {
          if (coin.current_price > pos.peak_price) {
            pos.peak_price = coin.current_price;
            void savePeak(userId, pos.symbol, coin.current_price).catch(() => undefined);
          }
          continue;
        }
        await closeAt(
          pos,
          coin,
          `rede de segurança acionada: ${exitLabels[forced.exit]} (SL ${dyn.stopLossPct}% / TP ${dyn.takeProfitPct}%)`,
          pos.entry_confidence || 50,
          null,
        );
        return;
      }

      // Teto absoluto de operações por hora, definido pelo utilizador.
      if (hourlyCapReached(tradeTimesRef.current, freqRef.current)) return;

      // ── 2. Candidatos: a IA analisa compras e vendas no mesmo pipeline ────
      // Moedas detidas voltam a passar pelo analyse() para gerar uma decisão
      // genuína de VENDER/AGUARDAR, tal como as compras.
      const held = new Map(positionsRef.current.map((p) => [p.coin_id, p]));
      const candidates = pool
        .map((c) => ({ coin: c, signal: analyse(c), position: held.get(c.id) ?? null }))
        .filter(({ signal, position }) =>
          position ? signal.action === "VENDER" : signal.action === "COMPRAR",
        )
        .filter(({ signal }) => passesAggression(signal, aggressionRef.current));
      if (!candidates.length) return;

      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      const coin = picked.coin;
      const signal = picked.signal;
      const position = picked.position;
      const symbol = coin.symbol.toUpperCase();

      // Espera mínima entre operações na mesma moeda (depende do modo).
      const lastAt = cooldownRef.current.get(symbol) ?? 0;
      if (Date.now() - lastAt < cooldownMsFor(aggressionRef.current)) return;

      // Detetor de choque: movimento anormal trava novas entradas (as saídas
      // continuam permitidas, para não ficar preso num choque).
      if (!position) {
        const shock = detectShock(coin);
        if (shock.detected) {
          setShockNote(`${symbol}: ${shock.reason}`);
          if (alertsRef.current.on_risk_halt) {
            void createAlert({
              userId,
              kind: "shock",
              title: `Choque de mercado em ${symbol}`,
              body: shock.reason,
            }).catch(() => undefined);
          }
          return;
        }
      }

      const stat = statsRef.current.get(symbol) ?? defaultStat(symbol);
      // A IA só executa se o sinal superar o limite aprendido para esta moeda,
      // nunca abaixo do piso definido pelo utilizador.
      const threshold = thresholdWithAggression(
        thresholdForSymbol(
          withUserFloor(strategyRef.current.min_confidence, minConfRef.current),
          stat.weight,
        ),
        aggressionRef.current,
      );
      // Estratégia nomeada + regime de mercado desta moeda.
      const strat = resolveStrategy(strategyChoiceRef.current, signal, coin);
      let stratConfidence = strat.confidence;
      let sentimentNote = "";
      if (sentimentOnRef.current && sentimentRef.current) {
        const adj = sentimentAdjust(
          sentimentRef.current,
          signal.action as "COMPRAR" | "VENDER",
        );

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
      void memory;
      if (confidence < threshold) {
        if (memoryNote) {
          logLine({
            symbol,
            action: position ? "VENDA" : "COMPRA",
            amount: 0,
            pnl: 0,
            confidence,
            reason: `${position ? "Saída" : "Entrada"} evitada — ${memoryNote}.`,
          });
        }
        return;
      }

      const decisionNote =
        `${signal.reason} · ${strat.note}` +
        (sentimentNote ? ` · ${sentimentNote}` : "") +
        (memoryNote ? ` · ${memoryNote}` : "");

      // ── 3a. Decisão de VENDA da própria IA (caminho principal de saída) ───
      if (position) {
        await closeAt(position, coin, `decisão da IA: ${decisionNote}`, confidence, pattern);
        setShockNote("");
        return;
      }

      // ── 3b. Decisão de COMPRA: abre posição real no livro simulado ────────
      if (dayLoss.current >= r.maxLossPerDay) return;
      const base = Math.max(r.minTrade, Math.round(r.minTrade * (1 + Math.random() * 3)));
      let amount = amountWithAggression(sizeForWeight(base, stat.weight), aggressionRef.current);
      // Diversificação: nunca mais do que X% do capital numa só moeda.
      const room = diversificationRoom({
        totalCapital: capitalRef.current,
        exposureForSymbol: exposureRef.current.get(symbol) ?? 0,
        capPct: capRef.current,
      });
      if (room < r.minTrade) {
        logLine({
          symbol,
          action: "COMPRA",
          amount: 0,
          pnl: 0,
          confidence,
          reason: `Entrada evitada — limite de diversificação de ${capRef.current}% do capital atingido em ${symbol}.`,
        });
        return;
      }
      amount = Math.max(1, Math.min(amount, Math.floor(room)));
      if (amount > availRef.current) {
        logLine({
          symbol,
          action: "COMPRA",
          amount: 0,
          pnl: 0,
          confidence,
          reason: `Entrada evitada — saldo de simulação disponível insuficiente (${availRef.current.toFixed(2)}€).`,
        });
        return;
      }

      const nextPos = afterBuy(position, {
        symbol,
        coinId: coin.id,
        price: coin.current_price,
        amount,
        pattern,
        confidence,
      });
      let saved: SimPosition;
      try {
        saved = await savePosition(userId, nextPos);
      } catch {
        return;
      }
      positionsRef.current = [
        ...positionsRef.current.filter((p) => p.symbol !== symbol),
        saved,
      ];
      setPositions([...positionsRef.current]);

      const nextAvailable = Number((availRef.current - amount).toFixed(2));
      const nextInvested = Number((investRef.current + amount).toFixed(2));
      availRef.current = nextAvailable;
      investRef.current = nextInvested;
      setAvailable(nextAvailable);
      setInvested(nextInvested);
      void persistWallet(nextAvailable, nextInvested);

      exposureRef.current.set(symbol, (exposureRef.current.get(symbol) ?? 0) + amount);
      cooldownRef.current.set(symbol, Date.now());
      tradeTimesRef.current = [Date.now(), ...tradeTimesRef.current].slice(0, 60);
      setShockNote("");

      const buyReason = `Compra a ${coin.current_price.toFixed(4)}€ · ${decisionNote} (a posição fica aberta até a IA decidir vender ou a rede de segurança atuar)`;
      const { data } = await supabase
        .from("trades")
        .insert({
          user_id: userId,
          symbol,
          action: "COMPRA",
          amount,
          pnl: 0,
          confidence,
          reason: buyReason,
        })
        .select()
        .single();

      logLine({
        id: data?.id,
        time: data ? new Date(data.created_at) : new Date(),
        symbol,
        action: "COMPRA",
        amount,
        pnl: 0,
        confidence,
        reason: buyReason,
      });

      if (alertsRef.current.on_trade) {
        void createAlert({
          userId,
          kind: "trade",
          title: `COMPRA ${symbol} · ${amount}€`,
          body: `Posição simulada aberta com confiança ${confidence}%. ${buyReason}`,
        }).catch(() => undefined);
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
    positions,
    minConfidence,
    setMinConfidence: updateMinConfidence,
  };

}
