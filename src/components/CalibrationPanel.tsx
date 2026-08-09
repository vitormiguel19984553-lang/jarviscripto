import { calibration, calibrationVerdict } from "@/lib/calibration";
import type { TradeLog } from "@/lib/useJarvis";

/** Calibração de confiança: o que a IA prometeu vs. o que aconteceu. */
export function CalibrationPanel({ logs }: { logs: TradeLog[] }) {
  const { buckets, trades, error } = calibration(logs);
  const tone = error <= 6 ? "text-success" : error <= 14 ? "text-warning" : "text-destructive";

  return (
    <section className="hud-panel anim-rise p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm tracking-widest text-primary">CALIBRAÇÃO DE CONFIANÇA</h2>
        <span className="font-display text-[10px] tracking-widest text-muted-foreground">
          {trades} OPERAÇÕES ANALISADAS · ERRO MÉDIO{" "}
          <strong className={tone}>{error.toFixed(1)} pts</strong>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{calibrationVerdict(error, trades)}</p>

      <div className="mt-4 space-y-2.5">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-md border border-border bg-secondary/30 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-display text-[11px] tracking-widest">{b.label}</span>
              <span className="text-muted-foreground">
                {b.trades ? (
                  <>
                    acerto real{" "}
                    <strong
                      className={
                        b.gap >= -5
                          ? "text-success"
                          : b.gap >= -15
                            ? "text-warning"
                            : "text-destructive"
                      }
                    >
                      {b.observed.toFixed(0)}%
                    </strong>{" "}
                    · anunciado {b.promised.toFixed(0)}% · {b.trades} ops
                  </>
                ) : (
                  "sem operações neste intervalo"
                )}
              </span>
            </div>
            <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${b.observed}%` }}
              />
              {b.trades > 0 && (
                <span
                  className="absolute top-[-3px] h-3.5 w-0.5 rounded bg-accent"
                  style={{ left: `${Math.min(99, b.promised)}%` }}
                  aria-hidden
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Barra = acerto observado · marca dourada = confiança anunciada pela IA.
      </p>
    </section>
  );
}
