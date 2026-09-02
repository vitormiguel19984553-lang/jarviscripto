import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const tones: Record<string, string> = {
  concorda: "border-success/50 bg-success/10 text-success",
  cautela: "border-warning/50 bg-warning/10 text-warning",
  discorda: "border-destructive/50 bg-destructive/10 text-destructive",
  sem_revisao: "border-border bg-secondary/40 text-muted-foreground",
};

const labels: Record<string, string> = {
  concorda: "CONCORDA",
  cautela: "CAUTELA",
  discorda: "DISCORDA",
  sem_revisao: "SEM REVISÃO",
};

type ModelOpinionRow = {
  model?: string;
  label?: string;
  verdict: string;
  rationale?: string;
};

/** Revisão cruzada entre IAs, visível fora dos logs. */
export function SecondOpinionFeed({
  userId,
  available,
  planLabel,
}: {
  userId: string;
  available: boolean;
  planLabel: string;
}) {
  const q = useQuery({
    queryKey: ["segunda-ia", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ia_pareceres")
        .select(
          "id,symbol,model,verdict,rationale,opinions,confidence_before,confidence_after,created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
    refetchInterval: 45_000,
  });

  const rows = q.data ?? [];
  const counts = rows.reduce<Record<string, number>>((a, r) => {
    a[r.verdict] = (a[r.verdict] ?? 0) + 1;
    return a;
  }, {});

  return (
    <section className="hud-panel anim-rise p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm tracking-widest text-primary">SEGUNDA IA · REVISÃO CRUZADA</h2>
        <div className="flex flex-wrap gap-1.5">
          {["concorda", "cautela", "discorda"].map((v) => (
            <span
              key={v}
              className={`rounded-full border px-2 py-0.5 font-display text-[9px] tracking-widest ${tones[v]}`}
            >
              {labels[v]} {counts[v] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {available
          ? "Antes de cada ordem da automação, dois modelos independentes revêem o raciocínio em paralelo. Se divergirem, o veredicto é no mínimo cautela e a ordem é reduzida."
          : `A revisão cruzada está disponível nos planos Pro Max e Enterprise (tens o plano ${planLabel}).`}
      </p>

      {q.isLoading && (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-secondary/50" />
          ))}
        </div>
      )}

      {!q.isLoading && (
        <ul className="mt-4 space-y-2">
          {!rows.length && (
            <li className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Sem pareceres ainda. Aparecem aqui quando a automação na cloud corre com revisão
              cruzada ativa.
            </li>
          )}
          {rows.map((o) => (
            <li
              key={o.id}
              className={`anim-pop rounded-md border p-3 text-xs ${tones[o.verdict] ?? tones.sem_revisao}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-[11px] tracking-widest">
                  {o.symbol} · {labels[o.verdict] ?? o.verdict.toUpperCase()}
                </span>
                <span className="font-display text-[10px] tracking-widest opacity-80">
                  {o.confidence_before ?? "—"}% → {o.confidence_after ?? "—"}%
                </span>
              </div>
              <p className="mt-1 leading-snug text-foreground/80">{o.rationale}</p>
              {Array.isArray(o.opinions) && o.opinions.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {(o.opinions as ModelOpinionRow[]).map((m, i) => (
                    <li
                      key={`${o.id}-${m.model ?? i}`}
                      className="rounded border border-border/60 bg-background/40 p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-display text-[10px] tracking-widest text-primary">
                          {m.label ?? m.model}
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 font-display text-[9px] tracking-widest ${
                            tones[m.verdict] ?? tones.sem_revisao
                          }`}
                        >
                          {labels[m.verdict] ?? String(m.verdict).toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 leading-snug text-foreground/70">{m.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[10px] opacity-70">
                {o.model} · {new Date(o.created_at).toLocaleString("pt-PT")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
