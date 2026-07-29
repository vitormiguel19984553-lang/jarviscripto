import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchMarkets } from "@/lib/market";
import { useJarvis } from "@/lib/useJarvis";
import { CoinCard } from "@/components/CoinCard";
import { ControlPanel } from "@/components/ControlPanel";
import { LogsPanel } from "@/components/LogsPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cripto Jarvis — Assistente de Investimento com IA" },
      {
        name: "description",
        content:
          "Painel Jarvis com análise técnica por IA, paper trading simulado, gestão de risco e registo de operações em criptomoedas.",
      },
      { property: "og:title", content: "Cripto Jarvis — Assistente de Investimento com IA" },
      {
        property: "og:description",
        content:
          "Análise em tempo real, sinais de IA com nível de confiança e simulação de trading sem risco.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 60_000,
  });

  const coins = data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const engine = useJarvis(coins, selected);

  useEffect(() => {
    if (coins.length && !selected.length) setSelected(coins.slice(0, 4).map((c) => c.id));
  }, [coins, selected.length]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div
            className="grid size-12 place-items-center rounded-full border border-primary/50 bg-primary/10"
            style={{ animation: "pulse-ring 2.4s ease-in-out infinite" }}
          >
            <span className="font-display text-xs text-primary text-glow">CJ</span>
          </div>
          <div>
            <h1 className="text-xl text-glow sm:text-2xl">CRIPTO JARVIS</h1>
            <p className="text-xs text-muted-foreground">
              Assistente de investimento com IA · modo simulação (paper trading)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5">
          <span
            className={`size-2 rounded-full ${engine.running ? "bg-success" : "bg-muted-foreground"}`}
            style={engine.running ? { animation: "pulse-ring 1.2s infinite" } : undefined}
          />
          <span className="font-display text-[11px] tracking-widest">
            {engine.running ? "IA ATIVA" : "IA EM ESPERA"}
          </span>
        </div>
      </header>

      <p className="mt-3 text-xs text-muted-foreground">
        Aviso: as análises indicam apenas um nível de confiança estimado. Não existe lucro
        garantido — investir em criptomoedas envolve risco de perda total.
      </p>

      <section className="mt-6">
        <h2 className="mb-3 text-sm tracking-widest text-primary">MERCADO E SINAIS DA IA</h2>
        {isLoading && (
          <p className="text-sm text-muted-foreground">A sincronizar dados de mercado…</p>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            Não foi possível obter os dados de mercado. Tenta novamente dentro de momentos.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {coins.map((coin) => (
            <CoinCard
              key={coin.id}
              coin={coin}
              selected={selected.includes(coin.id)}
              onToggle={() => toggle(coin.id)}
            />
          ))}
        </div>
      </section>

      <div className="mt-6">
        <ControlPanel engine={engine} selectedCount={selected.length} />
      </div>

      <div className="mt-6">
        <LogsPanel logs={engine.logs} />
      </div>

      <footer className="mt-8 pb-4 text-center text-xs text-muted-foreground">
        Fase 1 · Próximas fases: contas e histórico na cloud, backtesting, relatórios e planos de
        subscrição.
      </footer>
    </main>
  );
}
