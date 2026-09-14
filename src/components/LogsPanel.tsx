import { useEffect, useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import type { TradeLog } from "@/lib/useJarvis";
import { eur } from "@/lib/market";
import { supabase } from "@/integrations/supabase/client";


/** Decompõe o motivo guardado em pontos legíveis. */
function isNote(log: TradeLog) {
  return log.kind === "note" || log.amount <= 0;
}

function explain(log: TradeLog): string[] {
  const parts = log.reason
    .split(/[;·]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return [
    `A IA registou confiança de ${log.confidence}% neste sinal.`,
    ...parts,
    isNote(log)
      ? "Nenhuma ordem foi executada — esta linha é apenas a avaliação da IA."
      : `Ordem simulada de ${eur(log.amount)} com resultado ${log.pnl >= 0 ? "+" : ""}${eur(log.pnl)}.`,
  ];
}

function LogRow({ log }: { log: TradeLog }) {
  const [open, setOpen] = useState(false);
  const note = isNote(log);
  return (
    <article
      className={`anim-rise rounded-md border p-3 text-sm transition-colors hover:border-primary/40 ${
        note ? "border-dashed border-border/70 bg-secondary/20" : "border-border bg-secondary/40"
      } ${!note && log.pnl > 0 ? "anim-flash-success" : ""} ${
        !note && log.pnl < 0 ? "anim-flash-error" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`font-display text-xs tracking-widest ${note ? "text-muted-foreground" : ""}`}
        >
          {note ? "ANÁLISE" : log.action} · {log.symbol}
        </span>
        {note ? (
          <span className="rounded border border-border px-1.5 py-0.5 font-display text-[10px] tracking-widest text-muted-foreground">
            SEM ORDEM
          </span>
        ) : (
          <span className={`font-semibold ${log.pnl >= 0 ? "text-success" : "text-destructive"}`}>
            {log.pnl >= 0 ? "+" : ""}
            {eur(log.pnl)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {log.time.toLocaleString("pt-PT")}
        {note ? "" : ` · ${eur(log.amount)}`} · confiança {log.confidence}%
      </p>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-display text-[10px] tracking-widest text-primary transition-all hover:bg-primary/20 active:scale-95"
      >
        <HelpCircle className="size-3" aria-hidden />
        PORQUÊ?
        <ChevronDown
          className={`size-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid overflow-hidden transition-all duration-300 ${
          open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <ul className="min-h-0 space-y-1 border-l border-primary/30 pl-3 text-xs text-muted-foreground">
          {explain(log).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

type RangeKey = "7d" | "30d" | "fix" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "ÚLTIMOS 7 DIAS" },
  { key: "30d", label: "ÚLTIMOS 30 DIAS" },
  { key: "fix", label: "DESDE A CORREÇÃO" },
  { key: "all", label: "TUDO" },
];

export function LogsPanel({ logs }: { logs: TradeLog[] }) {
  const [range, setRange] = useState<RangeKey>("7d");
  const [resetPoint, setResetPoint] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("reset_point_at")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (alive && data?.reset_point_at) setResetPoint(new Date(data.reset_point_at));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const since = (() => {
    if (range === "all") return null;
    if (range === "fix") return resetPoint;
    const days = range === "7d" ? 7 : 30;
    return new Date(Date.now() - days * 86_400_000);
  })();

  const visible = since ? logs.filter((l) => l.time >= since) : logs;
  const real = visible.filter((l) => l.amount > 0);
  const wins = real.filter((l) => l.pnl > 0).length;
  const total = visible.reduce((a, l) => a + l.pnl, 0);
  const hidden = logs.length - visible.length;

  return (
    <section className="hud-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm tracking-widest text-primary">REGISTO DE OPERAÇÕES</h2>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            Operações: <strong className="text-foreground">{real.length}</strong>
          </span>
          <span>
            Taxa de acerto:{" "}
            <strong className="text-foreground">
              {real.length ? Math.round((wins / real.length) * 100) : 0}%
            </strong>
          </span>
          <span>
            Resultado:{" "}
            <strong className={total >= 0 ? "text-success" : "text-destructive"}>
              {eur(total)}
            </strong>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {RANGES.map((r) => {
          const disabled = r.key === "fix" && !resetPoint;
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              disabled={disabled}
              title={
                r.key === "fix" && resetPoint
                  ? `Desde ${resetPoint.toLocaleDateString("pt-PT")}`
                  : undefined
              }
              className={`rounded-md border px-2 py-1 font-display text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-40 ${
                range === r.key
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {hidden > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {hidden} {hidden === 1 ? "operação mais antiga escondida" : "operações mais antigas escondidas"}{" "}
          — escolhe “TUDO” para ver todo o histórico.
        </p>
      )}

      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
        {!visible.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {logs.length
              ? "Sem operações neste período."
              : "Sem operações. Ativa a IA para começar a simulação."}
          </p>
        )}
        {visible.map((l) => (
          <LogRow key={l.id} log={l} />
        ))}
      </div>
    </section>
  );
}

