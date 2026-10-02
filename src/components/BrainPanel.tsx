import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { topRiskPatterns } from "@/lib/brainStore";
import { shapeLabel } from "@/lib/trajectory";
import { topShapes } from "@/lib/trajectoryStore";

/** Cérebro da IA: padrões memorizados e pareceres da segunda IA. */
export function BrainPanel({ userId }: { userId: string }) {
  const memory = useQuery({
    queryKey: ["ia-memoria", userId],
    queryFn: () => topRiskPatterns(userId, 5),
    refetchInterval: 60_000,
  });

  const opinions = useQuery({
    queryKey: ["ia-pareceres", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ia_pareceres")
        .select("id,symbol,model,verdict,rationale,confidence_before,confidence_after,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const shapes = useQuery({
    queryKey: ["ia-trajetorias", userId],
    queryFn: () => topShapes(supabase, userId, 6),
    refetchInterval: 60_000,
  });

  const loading = memory.isLoading || opinions.isLoading;

  return (
    <section className="hud-panel p-5">
      <h2 className="text-sm tracking-widest text-primary">CÉREBRO DA IA</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        A IA guarda padrões de mercado (não resultados isolados) e consulta-os antes de cada
        decisão.
      </p>

      {loading && (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-secondary/50" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Padrões com pior histórico
            </h3>
            <ul className="mt-2 space-y-2">
              {(memory.data ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">
                  Ainda sem padrões suficientes — a memória cresce a cada operação.
                </li>
              )}
              {(memory.data ?? []).map((m) => (
                <li
                  key={m.pattern_key}
                  className="rounded-md border border-border bg-secondary/40 p-3 text-xs"
                >
                  <p className="text-foreground">{m.description}</p>
                  <p className="mt-1 text-muted-foreground">
                    {m.trades} operações · {m.wins} acertos · {m.losses} perdas · resultado{" "}
                    <span className={m.total_pnl >= 0 ? "text-success" : "text-destructive"}>
                      {m.total_pnl.toFixed(2)}€
                    </span>{" "}
                    · penalização {m.confidence_penalty.toFixed(0)} pts
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Segunda opinião entre IAs
            </h3>
            <ul className="mt-2 space-y-2">
              {(opinions.data ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">
                  Sem pareceres registados. A revisão cruzada corre na automação 24/7 dos planos Pro
                  Max e Enterprise.
                </li>
              )}
              {(opinions.data ?? []).map((o) => (
                <li
                  key={o.id}
                  className="rounded-md border border-border bg-secondary/40 p-3 text-xs"
                >
                  <p className="font-display text-[11px] tracking-widest text-primary">
                    {o.symbol} · {o.verdict.toUpperCase()}
                  </p>
                  <p className="mt-1 text-muted-foreground">{o.rationale}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {o.model} · confiança {o.confidence_before ?? "—"}% →{" "}
                    {o.confidence_after ?? "—"}% · {new Date(o.created_at).toLocaleString("pt-PT")}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Trajetórias típicas depois da entrada
            </h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {(shapes.data ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">
                  Ainda sem trajetórias — a IA regista o percurso do preço (+1, +5, +15, +30 e +60
                  min) de cada posição e aprende a forma típica de cada padrão.
                </li>
              )}
              {(shapes.data ?? []).map((t) => (
                <li
                  key={`${t.pattern_key}-${t.shape}`}
                  className="rounded-md border border-border bg-secondary/40 p-3 text-xs"
                >
                  <p className="font-display text-[11px] tracking-widest text-primary">
                    {shapeLabel(t.shape).toUpperCase()}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t.trades} casos · {t.wins} acertos · pico médio +{t.avg_peak_pct.toFixed(2)}%
                    aos ~{Math.round(t.avg_peak_min)}min · fecho médio{" "}
                    <span className={t.avg_final_pct >= 0 ? "text-success" : "text-destructive"}>
                      {t.avg_final_pct.toFixed(2)}%
                    </span>
                  </p>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                    padrão: {t.pattern_key.replaceAll("|", " · ").replaceAll("_", " ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
