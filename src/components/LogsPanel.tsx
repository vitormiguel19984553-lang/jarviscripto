import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import type { TradeLog } from "@/lib/useJarvis";
import { eur } from "@/lib/market";

/** Decompõe o motivo guardado em pontos legíveis. */
function explain(log: TradeLog): string[] {
  const parts = log.reason
    .split(/[;·]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return [
    `A IA registou confiança de ${log.confidence}% neste sinal.`,
    ...parts,
    log.amount > 0
      ? `Ordem simulada de ${eur(log.amount)} com resultado ${log.pnl >= 0 ? "+" : ""}${eur(log.pnl)}.`
      : "Nenhuma ordem foi executada — a IA evitou a entrada.",
  ];
}

function LogRow({ log }: { log: TradeLog }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`anim-rise rounded-md border border-border bg-secondary/40 p-3 text-sm transition-colors hover:border-primary/40 ${
        log.pnl > 0 ? "anim-flash-success" : log.pnl < 0 ? "anim-flash-error" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-xs tracking-widest">
          {log.action} · {log.symbol}
        </span>
        <span className={`font-semibold ${log.pnl >= 0 ? "text-success" : "text-destructive"}`}>
          {log.pnl >= 0 ? "+" : ""}
          {eur(log.pnl)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {log.time.toLocaleString("pt-PT")} · {eur(log.amount)} · confiança {log.confidence}%
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

export function LogsPanel({ logs }: { logs: TradeLog[] }) {
  const real = logs.filter((l) => l.amount > 0);
  const wins = real.filter((l) => l.pnl > 0).length;
  const total = logs.reduce((a, l) => a + l.pnl, 0);

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

      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
        {!logs.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem operações. Ativa a IA para começar a simulação.
          </p>
        )}
        {logs.map((l) => (
          <LogRow key={l.id} log={l} />
        ))}
      </div>
    </section>
  );
}
