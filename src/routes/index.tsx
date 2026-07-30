import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchMarkets, analyse, eur, pct } from "@/lib/market";
import { Sparkline } from "@/components/Sparkline";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cripto Jarvis — Assistente de Investimento com IA" },
      {
        name: "description",
        content:
          "Análise técnica com IA, sinais com nível de confiança e trading simulado em criptomoedas, com carteira e histórico guardados na cloud.",
      },
      { property: "og:title", content: "Cripto Jarvis — Assistente de Investimento com IA" },
      {
        property: "og:description",
        content: "Sinais de IA em tempo real e paper trading sem risco.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data } = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets, refetchInterval: 60_000 });
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl text-glow sm:text-3xl">CRIPTO JARVIS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assistente de investimento em criptomoedas com IA · modo simulação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/planos"
            className="rounded-md border border-border bg-secondary/60 px-4 py-2 font-display text-xs tracking-widest hover:bg-secondary"
          >
            PLANOS
          </Link>
          <Link
            to={signedIn ? "/dashboard" : "/auth"}
            className="rounded-md bg-primary px-4 py-2 font-display text-xs text-primary-foreground"
          >
            {signedIn ? "ABRIR PAINEL" : "ENTRAR / CRIAR CONTA"}
          </Link>
        </div>
      </header>

      <p className="mt-3 text-xs text-muted-foreground">
        Aviso: as análises indicam apenas um nível de confiança estimado. Não existe lucro
        garantido — investir em criptomoedas envolve risco de perda total.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm tracking-widest text-primary">SINAIS PÚBLICOS DA IA</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(data ?? []).map((coin) => {
            const s = analyse(coin);
            const up = (coin.price_change_percentage_24h ?? 0) >= 0;
            return (
              <article key={coin.id} className="hud-panel p-4">
                <div className="flex items-center gap-3">
                  <img src={coin.image} alt={coin.name} className="size-8 rounded-full" />
                  <div className="min-w-0">
                    <p className="font-display text-sm">{coin.symbol.toUpperCase()}</p>
                    <p className="truncate text-xs text-muted-foreground">{coin.name}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <p className="font-display text-lg text-glow">{eur(coin.current_price)}</p>
                  <p className={`text-sm ${up ? "text-success" : "text-destructive"}`}>
                    {pct(coin.price_change_percentage_24h)}
                  </p>
                </div>
                <Sparkline data={coin.sparkline_in_7d?.price ?? []} positive={up} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Sinal: <span className="text-primary">{s.action}</span> · confiança{" "}
                  {s.confidence}%
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="hud-panel mt-8 p-6 text-center">
        <h2 className="text-lg">CONTA E HISTÓRICO NA CLOUD</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Cria conta para ativar a automação, definir limites de risco e guardar a tua carteira
          simulada e todas as operações — disponíveis em qualquer dispositivo.
        </p>
        <Link
          to={signedIn ? "/dashboard" : "/auth"}
          className="mt-4 inline-block rounded-md bg-primary px-5 py-2 font-display text-xs text-primary-foreground"
        >
          {signedIn ? "ABRIR PAINEL" : "COMEÇAR AGORA"}
        </Link>
      </section>
    </main>
  );
}
