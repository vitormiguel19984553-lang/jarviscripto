import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, pct } from "@/lib/market";
import { backtest, defaultConfig, type BacktestConfig } from "@/lib/backtest";
import { JarvisNav } from "@/components/JarvisNav";
import { Sparkline } from "@/components/Sparkline";

export const Route = createFileRoute("/_authenticated/backtest")({
  head: () => ({
    meta: [
      { title: "Backtesting — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Testa a estratégia da IA do Cripto Jarvis sobre os últimos 7 dias de mercado: retorno, taxa de acerto, drawdown e comparação com comprar e manter.",
      },
      { property: "og:title", content: "Backtesting — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Simula a estratégia da IA sobre dados reais dos últimos 7 dias.",
      },
    ],
  }),
  component: Backtest,
});

function Backtest() {
  const [cfg, setCfg] = useState<BacktestConfig>(defaultConfig);
  const { data, isLoading } = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });

  const results = useMemo(
    () => (data ?? []).map((c) => backtest(c, cfg)).sort((a, b) => b.totalReturnPct - a.totalReturnPct),
    [data, cfg],
  );

  const totalTrades = results.reduce((a, r) => a + r.trades.length, 0);
  const avgReturn = results.length
    ? results.reduce((a, r) => a + r.totalReturnPct, 0) / results.length
    : 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">BACKTESTING</h1>
          <p className="text-xs text-muted-foreground">
            Estratégia aplicada às últimas 168 horas de mercado real · {totalTrades} operações
            simuladas
          </p>
        </div>
        <JarvisNav />
      </header>

      <section className="hud-panel mt-6 grid gap-5 p-5 sm:grid-cols-3">
        <Slider
          label="CONFIANÇA MÍNIMA"
          suffix="%"
          min={40}
          max={90}
          value={cfg.minConfidence}
          onChange={(v) => setCfg({ ...cfg, minConfidence: v })}
        />
        <Slider
          label="TAKE PROFIT"
          suffix="%"
          min={0.5}
          max={10}
          step={0.5}
          value={cfg.takeProfit}
          onChange={(v) => setCfg({ ...cfg, takeProfit: v })}
        />
        <Slider
          label="STOP LOSS"
          suffix="%"
          min={0.5}
          max={10}
          step={0.5}
          value={cfg.stopLoss}
          onChange={(v) => setCfg({ ...cfg, stopLoss: v })}
        />
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        Retorno médio da estratégia nas moedas analisadas:{" "}
        <span className={avgReturn >= 0 ? "text-success" : "text-destructive"}>
          {pct(avgReturn)}
        </span>
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">A carregar dados de mercado…</p>
      ) : (
        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {results.map((r) => (
            <article key={r.coinId} className="hud-panel p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-sm tracking-widest">{r.symbol}</h2>
                <span
                  className={`text-sm ${r.totalReturnPct >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {pct(r.totalReturnPct)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">{r.name}</p>
              <div className="my-3">
                {r.equity.length > 1 && (
                  <Sparkline data={r.equity} up={r.totalReturnPct >= 0} />
                )}
              </div>
              <dl className="space-y-1 text-[11px] text-muted-foreground">
                <Row k="Operações" v={`${r.trades.length} (${r.wins}G / ${r.losses}P)`} />
                <Row k="Taxa de acerto" v={`${r.winRate.toFixed(0)}%`} />
                <Row k="Drawdown máx." v={`${r.maxDrawdownPct.toFixed(2)}%`} />
                <Row k="Comprar e manter" v={pct(r.buyHoldPct)} />
              </dl>
            </article>
          ))}
        </section>
      )}

      <p className="mt-6 pb-4 text-center text-xs text-muted-foreground">
        Resultados históricos não garantem desempenho futuro. Tudo aqui é simulação.
      </p>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt>{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[10px] tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="text-primary">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </label>
  );
}
