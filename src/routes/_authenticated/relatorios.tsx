import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { eur } from "@/lib/market";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";
import { Sparkline } from "@/components/Sparkline";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Relatórios de desempenho do Cripto Jarvis: resultado diário, semanal e mensal, taxa de acerto e histórico completo das operações simuladas.",
      },
      { property: "og:title", content: "Relatórios — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Desempenho da IA por período, taxa de acerto e histórico de operações.",
      },
    ],
  }),
  component: Relatorios,
});

type Period = 1 | 7 | 30;

function Relatorios() {
  const { user } = Route.useRouteContext();
  const [period, setPeriod] = useState<Period>(7);

  const { data, isLoading } = useQuery({
    queryKey: ["trades", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const trades = data ?? [];
  const since = useMemo(() => Date.now() - period * 24 * 3600 * 1000, [period]);
  const inPeriod = trades.filter((t) => new Date(t.created_at).getTime() >= since);

  const pnl = inPeriod.reduce((a, t) => a + Number(t.pnl), 0);
  const wins = inPeriod.filter((t) => Number(t.pnl) > 0).length;
  const winRate = inPeriod.length ? (wins / inPeriod.length) * 100 : 0;
  const volume = inPeriod.reduce((a, t) => a + Number(t.amount), 0);
  const best = inPeriod.reduce<number>((m, t) => Math.max(m, Number(t.pnl)), 0);
  const worst = inPeriod.reduce<number>((m, t) => Math.min(m, Number(t.pnl)), 0);

  const equity = useMemo(() => {
    const asc = [...inPeriod].reverse();
    let acc = 0;
    return asc.map((t) => (acc += Number(t.pnl)));
  }, [inPeriod]);

  const bySymbol = useMemo(() => {
    const map = new Map<string, { pnl: number; n: number; wins: number }>();
    for (const t of inPeriod) {
      const cur = map.get(t.symbol) ?? { pnl: 0, n: 0, wins: 0 };
      cur.pnl += Number(t.pnl);
      cur.n += 1;
      if (Number(t.pnl) > 0) cur.wins += 1;
      map.set(t.symbol, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
  }, [inPeriod]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">RELATÓRIOS</h1>
          <p className="text-xs text-muted-foreground">
            Desempenho da IA em modo simulação · {inPeriod.length} operações no período
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      <div className="mt-6 flex gap-2">
        {([1, 7, 30] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md border px-4 py-2 font-display text-[11px] tracking-widest ${
              period === p
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {p === 1 ? "DIÁRIO" : p === 7 ? "SEMANAL" : "MENSAL"}
          </button>
        ))}
      </div>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="RESULTADO" value={eur(pnl)} tone={pnl >= 0 ? "up" : "down"} />
        <Stat label="TAXA DE ACERTO" value={`${winRate.toFixed(1)}%`} />
        <Stat label="VOLUME NEGOCIADO" value={eur(volume)} />
        <Stat label="MELHOR / PIOR" value={`${eur(best)} / ${eur(worst)}`} />
      </section>

      <section className="hud-panel mt-6 p-5">
        <h2 className="mb-3 text-sm tracking-widest text-primary">CURVA DE RESULTADO</h2>
        {equity.length > 1 ? (
          <Sparkline data={equity} positive={pnl >= 0} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Ainda não existem operações suficientes neste período.
          </p>
        )}
      </section>

      <section className="hud-panel mt-6 p-5">
        <h2 className="mb-3 text-sm tracking-widest text-primary">DESEMPENHO POR MOEDA</h2>
        {bySymbol.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no período selecionado.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {bySymbol.map(([sym, s]) => (
              <div
                key={sym}
                className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2"
              >
                <span className="font-display text-xs tracking-widest">{sym}</span>
                <span className="text-xs text-muted-foreground">
                  {s.n} ops · {((s.wins / s.n) * 100).toFixed(0)}% acerto
                </span>
                <span className={s.pnl >= 0 ? "text-success" : "text-destructive"}>
                  {eur(s.pnl)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hud-panel mt-6 p-5">
        <h2 className="mb-3 text-sm tracking-widest text-primary">HISTÓRICO COMPLETO</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar histórico…</p>
        ) : inPeriod.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem operações registadas no período.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">DATA</th>
                  <th className="font-normal">MOEDA</th>
                  <th className="font-normal">AÇÃO</th>
                  <th className="font-normal">VALOR</th>
                  <th className="font-normal">CONF.</th>
                  <th className="text-right font-normal">P/L</th>
                </tr>
              </thead>
              <tbody>
                {inPeriod.map((t) => (
                  <tr key={t.id} className="border-t border-border/60">
                    <td className="py-2 text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("pt-PT")}
                    </td>
                    <td className="font-display tracking-widest">{t.symbol}</td>
                    <td className={t.action === "COMPRA" ? "text-primary" : "text-accent"}>
                      {t.action}
                    </td>
                    <td>{eur(Number(t.amount))}</td>
                    <td className="text-muted-foreground">{t.confidence}%</td>
                    <td
                      className={`text-right ${Number(t.pnl) >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {eur(Number(t.pnl))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <BottomNav />
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="hud-panel p-4">
      <p className="text-[10px] tracking-widest text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg ${
          tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
