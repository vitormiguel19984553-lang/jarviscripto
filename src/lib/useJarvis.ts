import { useCallback, useEffect, useRef, useState } from "react";
import { type Coin, analyse } from "@/lib/market";

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

const DEFAULT_RISK: Risk = { minTrade: 25, maxLossPerTrade: 15, maxLossPerDay: 60 };

export function useJarvis(coins: Coin[], selected: string[]) {
  const [available, setAvailable] = useState(10000);
  const [invested, setInvested] = useState(2500);
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [running, setRunning] = useState(false);
  const [durationHours, setDurationHours] = useState(5);
  const [remaining, setRemaining] = useState(0);
  const [risk, setRisk] = useState<Risk>(DEFAULT_RISK);
  const [halted, setHalted] = useState(false);
  const dayLoss = useRef(0);

  const coinsRef = useRef(coins);
  const selRef = useRef(selected);
  coinsRef.current = coins;
  selRef.current = selected;

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
    const engine = setInterval(() => {
      const pool = coinsRef.current.filter((c) => selRef.current.includes(c.id));
      if (!pool.length) return;
      const coin = pool[Math.floor(Math.random() * pool.length)];
      const signal = analyse(coin);
      if (signal.action === "AGUARDAR") return;

      const amount = Math.max(risk.minTrade, Math.round(risk.minTrade * (1 + Math.random() * 3)));
      const win = Math.random() * 100 < signal.confidence;
      const raw = win
        ? amount * (0.004 + Math.random() * 0.03)
        : -amount * (0.004 + Math.random() * 0.03);
      const pnl = Math.max(-risk.maxLossPerTrade, Number(raw.toFixed(2)));

      if (pnl < 0 && dayLoss.current + Math.abs(pnl) > risk.maxLossPerDay) {
        setRunning(false);
        setHalted(true);
        return;
      }
      if (pnl < 0) dayLoss.current += Math.abs(pnl);

      setInvested((v) => Number((v + pnl).toFixed(2)));
      setLogs((l) =>
        [
          {
            id: crypto.randomUUID(),
            time: new Date(),
            symbol: coin.symbol.toUpperCase(),
            action: signal.action === "COMPRAR" ? ("COMPRA" as const) : ("VENDA" as const),
            amount,
            pnl,
            confidence: signal.confidence,
            reason: signal.reason,
          },
          ...l,
        ].slice(0, 60),
      );
    }, 4000);
    return () => clearInterval(engine);
  }, [running, risk]);

  const transfer = (amount: number, toInvest: boolean) => {
    if (amount <= 0) return;
    if (toInvest && amount <= available) {
      setAvailable((v) => v - amount);
      setInvested((v) => v + amount);
    } else if (!toInvest && amount <= invested) {
      setInvested((v) => v - amount);
      setAvailable((v) => v + amount);
    }
  };

  const deposit = (amount: number) => amount > 0 && setAvailable((v) => v + amount);

  return {
    available,
    invested,
    logs,
    running,
    setRunning,
    durationHours,
    setDurationHours,
    remaining,
    risk,
    setRisk,
    halted,
    start,
    stopAll,
    transfer,
    deposit,
  };
}
