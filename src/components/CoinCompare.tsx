import { useState } from "react";
import { analyse, eur, pct, type Coin } from "@/lib/market";

/** Comparação rápida entre até 3 moedas escolhidas. */
export function CoinCompare({ coins }: { coins: Coin[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id],
    );

  const rows = coins.filter((c) => picked.includes(c.id)).map((c) => ({ c, s: analyse(c) }));

  return (
    <section className="hud-panel p-5">
      <h2 className="text-sm tracking-widest text-primary">COMPARAÇÃO RÁPIDA</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Escolhe até 3 moedas para ver os sinais lado a lado.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {coins.map((c) => {
          const on = picked.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={`hud-btn px-2.5 py-1.5 text-[10px] ${on ? "hud-btn-primary" : "hud-btn-ghost"}`}
            >
              {c.symbol.toUpperCase()}
            </button>
          );
        })}
      </div>

      {!rows.length && (
        <p className="mt-4 text-xs text-muted-foreground">Nenhuma moeda selecionada.</p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="pb-2">Moeda</th>
                <th className="pb-2">Preço</th>
                <th className="pb-2">24H</th>
                <th className="pb-2">Sinal</th>
                <th className="pb-2">Confiança</th>
                <th className="pb-2">Confirmações</th>
                <th className="pb-2">RSI</th>
                <th className="pb-2">Vol.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, s }) => (
                <tr key={c.id} className="anim-rise border-t border-border/60">
                  <td className="py-2 font-display text-[11px]">{c.symbol.toUpperCase()}</td>
                  <td className="py-2">{eur(c.current_price)}</td>
                  <td
                    className={`py-2 ${
                      (c.price_change_percentage_24h ?? 0) >= 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {pct(c.price_change_percentage_24h)}
                  </td>
                  <td
                    className={`py-2 font-display text-[11px] ${
                      s.action === "COMPRAR"
                        ? "text-success"
                        : s.action === "VENDER"
                          ? "text-destructive"
                          : "text-warning"
                    }`}
                  >
                    {s.action}
                  </td>
                  <td className="py-2 text-primary">{s.confidence}%</td>
                  <td className="py-2 text-muted-foreground">
                    {s.agree}/{s.checks.length}
                  </td>
                  <td className="py-2 text-muted-foreground">{s.rsi.toFixed(0)}</td>
                  <td className="py-2 text-muted-foreground">{s.vol.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
