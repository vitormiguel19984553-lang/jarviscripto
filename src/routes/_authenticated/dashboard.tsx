import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/market";
import { useJarvis } from "@/lib/useJarvis";
import { CoinCard } from "@/components/CoinCard";
import { ControlPanel } from "@/components/ControlPanel";
import { LogsPanel } from "@/components/LogsPanel";
import { supabase } from "@/integrations/supabase/client";
import { JarvisNav } from "@/components/JarvisNav";
import { ServerBotPanel } from "@/components/ServerBotPanel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Painel pessoal do Cripto Jarvis: carteira simulada, automação da IA, limites de risco e histórico de operações guardado na cloud.",
      },
      { property: "og:title", content: "Painel — Cripto Jarvis" },
      {
        property: "og:description",
        content: "A tua carteira simulada e o histórico de operações da IA.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 60_000,
  });
  const coins = data ?? [];
  const engine = useJarvis(user.id, coins);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

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
            <p className="text-xs text-muted-foreground">{user.email} · modo simulação</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <JarvisNav />

          <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5">
            <span
              className={`size-2 rounded-full ${engine.running ? "bg-success" : "bg-muted-foreground"}`}
            />
            <span className="font-display text-[11px] tracking-widest">
              {engine.running ? "IA ATIVA" : "IA EM ESPERA"}
            </span>
          </div>
          <button
            onClick={signOut}
            className="rounded-md border border-border bg-secondary/60 px-3 py-1.5 font-display text-[11px] hover:bg-secondary"
          >
            SAIR
          </button>
        </div>
      </header>

      {engine.loading && (
        <p className="mt-4 text-sm text-muted-foreground">A carregar a tua conta…</p>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm tracking-widest text-primary">MERCADO E SINAIS DA IA</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {coins.map((coin) => (
            <CoinCard
              key={coin.id}
              coin={coin}
              selected={engine.selected.includes(coin.id)}
              onToggle={() => engine.toggleCoin(coin.id)}
            />
          ))}
        </div>
      </section>

      <div className="mt-6">
        <ControlPanel engine={engine} selectedCount={engine.selected.length} />
      </div>

      <div className="mt-6">
        <ServerBotPanel userId={user.id} />
      </div>

      <div className="mt-6">
        <LogsPanel logs={engine.logs} />
      </div>

      <footer className="mt-8 pb-4 text-center text-xs text-muted-foreground">
        Fase 2 · Carteira, definições e histórico guardados na cloud. A seguir: backtesting,
        relatórios semanais/mensais e planos de subscrição.
      </footer>
    </main>
  );
}
