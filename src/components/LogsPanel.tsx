import type { TradeLog } from "@/lib/useJarvis";
import { eur } from "@/lib/market";

export function LogsPanel({ logs }: { logs: TradeLog[] }) {
  const wins = logs.filter((l) => l.pnl > 0).length;
  const total = logs.reduce((a, l) => a + l.pnl, 0);

  return (
    <section className="hud-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm tracking-widest text-primary">REGISTO DE OPERAÇÕES</h2>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            Operações: <strong className="text-foreground">{logs.length}</strong>
          </span>
          <span>
            Taxa de acerto:{" "}
            <strong className="text-foreground">
              {logs.length ? Math.round((wins / logs.length) * 100) : 0}%
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

      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
        {!logs.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem operações. Ativa a IA para começar a simulação.
          </p>
        )}
        {logs.map((l) => (
          <article
            key={l.id}
            className="rounded-md border border-border bg-secondary/40 p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-xs tracking-widest">
                {l.action} · {l.symbol}
              </span>
              <span className={`font-semibold ${l.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                {l.pnl >= 0 ? "+" : ""}
                {eur(l.pnl)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {l.time.toLocaleString("pt-PT")} · {eur(l.amount)} · confiança {l.confidence}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{l.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
