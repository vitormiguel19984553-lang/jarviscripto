import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/market";
import { useJarvis } from "@/lib/useJarvis";
import { CoinCard } from "@/components/CoinCard";
import { ControlPanel } from "@/components/ControlPanel";
import { LogsPanel } from "@/components/LogsPanel";
import { supabase } from "@/integrations/supabase/client";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";
import { ServerBotPanel } from "@/components/ServerBotPanel";
import { LearningPanel } from "@/components/LearningPanel";
import { BrainPanel } from "@/components/BrainPanel";
import { MindMap } from "@/components/MindMap";
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { SecondOpinionFeed } from "@/components/SecondOpinionFeed";
import { CoinCompare } from "@/components/CoinCompare";

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

const tabs = [
  { id: "mercado", label: "MERCADO" },
  { id: "carteira", label: "CARTEIRAS" },
  { id: "mapa", label: "MAPA MENTAL" },
  { id: "automacao", label: "AUTOMAÇÃO" },
  { id: "cerebro", label: "CÉREBRO" },
  { id: "logs", label: "LOGS" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function CoinSkeleton() {
  return <div className="hud-panel h-40 animate-pulse bg-secondary/40" />;
}

function ProfileMenu({
  email,
  plan,
  onSignOut,
}: {
  email: string;
  plan: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Menu de perfil"
        className="grid size-9 place-items-center rounded-full border border-border bg-secondary/60 font-display text-[11px] text-primary"
      >
        {email.slice(0, 2).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-md border border-border bg-card p-3 shadow-lg">
          <p className="truncate text-xs text-foreground">{email}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Plano {plan} · modo simulação</p>
          <button
            onClick={onSignOut}
            className="hud-btn hud-btn-ghost mt-3 w-full px-3 py-2 text-[11px]"
          >
            SAIR
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("mercado");
  const market = useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 60_000,
    retry: 2,
  });
  const coins = market.data ?? [];
  const engine = useJarvis(user.id, coins);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  return (
    <main className="hud-particles mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className="grid size-10 place-items-center rounded-full border border-primary/50 bg-primary/10 sm:size-12"
            style={{ animation: "pulse-ring 2.4s ease-in-out infinite" }}
          >
            <span className="font-display text-xs text-primary text-glow">CJ</span>
          </div>
          <div>
            <h1 className="text-lg text-glow sm:text-2xl">CRIPTO JARVIS</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {user.email} · plano {engine.limits.label} · modo simulação
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden md:block">
            <JarvisNav />
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5">
            <span
              className={`size-2 rounded-full ${engine.running ? "live-dot bg-success" : "bg-muted-foreground"}`}
            />
            <span className="font-display text-[11px] tracking-widest">
              {engine.running ? "IA ATIVA" : "IA EM ESPERA"}
            </span>
          </div>
          <div className="md:hidden">
            <ProfileMenu email={user.email ?? ""} plan={engine.limits.label} onSignOut={signOut} />
          </div>
          <button
            onClick={signOut}
            className="hud-btn hud-btn-ghost hidden px-3 py-1.5 text-[11px] md:block"
          >
            SAIR
          </button>
        </div>
      </header>

      <nav className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`hud-btn shrink-0 px-3 py-2 text-[11px] ${
              tab === t.id
                ? "border border-primary/60 bg-primary/15 text-primary shadow-[0_0_20px_-8px_var(--primary)]"
                : "border border-transparent bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {engine.loading && (
        <p className="mt-4 text-sm text-muted-foreground">A carregar a tua conta…</p>
      )}

      {tab === "mercado" && (
        <section className="mt-5">
          <h2 className="mb-3 text-sm tracking-widest text-primary">MERCADO E SINAIS DA IA</h2>
          {market.isError && (
            <div className="hud-panel p-5">
              <p className="text-sm text-destructive">
                Sinais indisponíveis: {(market.error as Error).message}
              </p>
              <button
                onClick={() => market.refetch()}
                className="hud-btn hud-btn-ghost mt-3 px-3 py-2 text-xs text-primary"
              >
                TENTAR NOVAMENTE
              </button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {market.isLoading && [0, 1, 2, 3].map((i) => <CoinSkeleton key={i} />)}
            {coins.map((coin) => (
              <CoinCard
                key={coin.id}
                coin={coin}
                selected={engine.selected.includes(coin.id)}
                onToggle={() => engine.toggleCoin(coin.id)}
              />
            ))}
          </div>
          <div className="mt-6">
            <CoinCompare coins={coins} />
          </div>
        </section>
      )}

      {tab === "carteira" && (
        <div key="carteira" className="anim-rise mt-5">
          <WalletPanel userId={user.id} engine={engine} />
        </div>
      )}

      {tab === "mapa" && (
        <div key="mapa" className="anim-rise mt-5">
          <MindMap coins={coins} logs={engine.logs} running={engine.running} userId={user.id} />
        </div>
      )}

      {tab === "automacao" && (
        <div key="automacao" className="anim-rise mt-5 space-y-6">
          <ControlPanel engine={engine} selectedCount={engine.selected.length} />
          <ServerBotPanel
            userId={user.id}
            hours={[...engine.limits.serverHours]}
            planLabel={engine.limits.label}
          />
          <SecondOpinionFeed
            userId={user.id}
            available={engine.limits.secondOpinion}
            planLabel={engine.limits.label}
          />
        </div>
      )}

      {tab === "cerebro" && (
        <div key="cerebro" className="anim-rise mt-5 space-y-6">
          <BrainPanel userId={user.id} />
          <CalibrationPanel logs={engine.logs} />
          <LearningPanel strategy={engine.strategy} stats={engine.symbolStats} />
        </div>
      )}

      {tab === "logs" && (
        <div key="logs" className="anim-rise mt-5">
          <LogsPanel logs={engine.logs} />
        </div>
      )}

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Simulação · cérebro da IA com memória de padrões, revisão cruzada entre modelos e limites
        por plano.
      </footer>

      <BottomNav />
    </main>
  );
}
