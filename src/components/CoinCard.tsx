import { type Coin, type Signal, analyse, eur, pct } from "@/lib/market";
import { Sparkline } from "./Sparkline";

function ActionBadge({ signal }: { signal: Signal }) {
  const tone =
    signal.action === "COMPRAR"
      ? "bg-success/15 text-success border-success/40"
      : signal.action === "VENDER"
        ? "bg-destructive/15 text-destructive border-destructive/40"
        : "bg-warning/15 text-warning border-warning/40";
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-display text-[10px] tracking-widest ${tone}`}
    >
      {signal.action}
    </span>
  );
}

export function CoinCard({
  coin,
  selected,
  onToggle,
}: {
  coin: Coin;
  selected: boolean;
  onToggle: () => void;
}) {
  const signal = analyse(coin);
  const up = (coin.price_change_percentage_24h ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`hud-panel group w-full p-4 text-left transition-all duration-300 hover:-translate-y-0.5 ${
        selected ? "ring-1 ring-primary/70" : "opacity-80 hover:opacity-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <img src={coin.image} alt={coin.name} className="size-8 rounded-full" loading="lazy" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm">{coin.symbol.toUpperCase()}</p>
          <p className="truncate text-xs text-muted-foreground">{coin.name}</p>
        </div>
        <ActionBadge signal={signal} />
      </div>

      <div className="mt-3 flex items-end justify-between">
        <p className="font-display text-lg text-glow">{eur(coin.current_price)}</p>
        <p className={`text-sm font-semibold ${up ? "text-success" : "text-destructive"}`}>
          {pct(coin.price_change_percentage_24h)}
        </p>
      </div>

      <Sparkline data={coin.sparkline_in_7d?.price ?? []} positive={up} />

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Confiança da IA</span>
          <span className="text-primary">{signal.confidence}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{signal.reason}</p>
      </div>
    </button>
  );
}
