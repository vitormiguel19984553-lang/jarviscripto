import { MIN_CONFIDENCE_CEIL, MIN_CONFIDENCE_FLOOR } from "@/lib/learning";
import type { StrategyState, SymbolStat } from "@/lib/strategy";

export function LearningPanel({
  strategy,
  stats,
}: {
  strategy: StrategyState;
  stats: SymbolStat[];
}) {
  const winRate = strategy.trades ? (strategy.wins / strategy.trades) * 100 : 0;
  const range = MIN_CONFIDENCE_CEIL - MIN_CONFIDENCE_FLOOR;
  const confPos = ((strategy.min_confidence - MIN_CONFIDENCE_FLOOR) / range) * 100;
  const sorted = [...stats].sort((a, b) => b.weight - a.weight).slice(0, 8);

  const sharpeTone =
    strategy.sharpe > 0.6 ? "text-success" : strategy.sharpe < 0 ? "text-destructive" : "";

  return (
    <section className="hud-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm tracking-widest text-primary">AUTO-APRENDIZAGEM DA IA</h2>
        <span className="font-display text-[10px] tracking-widest text-muted-foreground">
          {strategy.trades} OPERAÇÕES APRENDIDAS
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        O Jarvis avalia o desempenho ajustado ao risco (índice de Sharpe) e ajusta sozinho a
        confiança mínima exigida e a exposição a cada moeda. Tudo em modo simulação.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <p className="font-display text-[10px] tracking-widest text-muted-foreground">
            ÍNDICE DE SHARPE
          </p>
          <p className={`mt-1 font-display text-xl ${sharpeTone}`}>{strategy.sharpe.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <p className="font-display text-[10px] tracking-widest text-muted-foreground">
            TAXA DE ACERTO
          </p>
          <p className="mt-1 font-display text-xl">{winRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <p className="font-display text-[10px] tracking-widest text-muted-foreground">
            RESULTADO APRENDIDO
          </p>
          <p
            className={`mt-1 font-display text-xl ${
              strategy.total_pnl >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {strategy.total_pnl >= 0 ? "+" : ""}
            {strategy.total_pnl.toFixed(2)} €
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Confiança mínima exigida</span>
          <span className="font-display text-primary">{strategy.min_confidence.toFixed(1)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary/70 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, confPos))}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {strategy.last_adjust_at
            ? `Último ajuste automático: ${new Date(strategy.last_adjust_at).toLocaleString("pt-PT")}`
            : "Ainda sem ajustes — a IA precisa de mais operações para aprender."}
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="mt-5">
          <p className="font-display text-[10px] tracking-widest text-muted-foreground">
            EXPOSIÇÃO APRENDIDA POR MOEDA
          </p>
          <ul className="mt-2 space-y-2">
            {sorted.map((s) => (
              <li key={s.symbol} className="flex items-center gap-3">
                <span className="w-14 font-display text-xs">{s.symbol}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={`block h-full rounded-full ${
                      s.total_pnl >= 0 ? "bg-success/70" : "bg-destructive/70"
                    }`}
                    style={{ width: `${Math.min(100, (s.weight / 1.6) * 100)}%` }}
                  />
                </span>
                <span className="w-24 text-right text-[11px] text-muted-foreground">
                  peso {s.weight.toFixed(2)} · {s.trades}x
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
