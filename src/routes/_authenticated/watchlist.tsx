import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { JarvisNav } from "@/components/JarvisNav";
import { Sparkline } from "@/components/Sparkline";
import { eur, fetchMarkets, pct } from "@/lib/market";
import {
  addToWatchlist,
  createPriceAlert,
  deletePriceAlert,
  directionLabels,
  listPriceAlerts,
  listWatchlist,
  removeFromWatchlist,
  setPriceAlertActive,
} from "@/lib/watchlist";

export const Route = createFileRoute("/_authenticated/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist e Alertas de Preço — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Guarda as tuas moedas favoritas e cria alertas de preço: o Cripto Jarvis avisa-te quando uma moeda sobe acima ou desce abaixo do valor que definires.",
      },
      { property: "og:title", content: "Watchlist e Alertas de Preço — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Moedas favoritas e avisos automáticos quando o preço chega ao teu alvo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    symbol: "bitcoin",
    direction: "above" as "above" | "below",
    price: "",
  });

  const markets = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets, refetchInterval: 60_000 });
  const watch = useQuery({ queryKey: ["watchlist", user.id], queryFn: () => listWatchlist(user.id) });
  const alerts = useQuery({
    queryKey: ["price-alerts", user.id],
    queryFn: () => listPriceAlerts(user.id),
  });

  const coins = markets.data ?? [];
  const coinById = new Map(coins.map((c) => [c.id, c]));
  const favorites = (watch.data ?? []).map((w) => w.symbol);

  const toggleFavorite = async (symbol: string) => {
    try {
      if (favorites.includes(symbol)) await removeFromWatchlist(user.id, symbol);
      else await addToWatchlist(user.id, symbol, favorites.length);
      await qc.invalidateQueries({ queryKey: ["watchlist", user.id] });
    } catch {
      toast.error("Não foi possível atualizar a watchlist.");
    }
  };

  const submitAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(form.price.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Indica um preço válido.");
      return;
    }
    try {
      await createPriceAlert({
        userId: user.id,
        symbol: form.symbol,
        direction: form.direction,
        targetPrice: price,
      });
      setForm((f) => ({ ...f, price: "" }));
      await qc.invalidateQueries({ queryKey: ["price-alerts", user.id] });
      toast.success("Alerta de preço criado.");
    } catch {
      toast.error("Não foi possível criar o alerta.");
    }
  };

  const refreshAlerts = () => qc.invalidateQueries({ queryKey: ["price-alerts", user.id] });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">WATCHLIST</h1>
          <p className="text-xs text-muted-foreground">
            Moedas favoritas e alertas de preço · verificação automática na cloud
          </p>
        </div>
        <JarvisNav />
      </header>

      <section className="mt-6">
        <h2 className="mb-3 text-sm tracking-widest text-primary">MERCADO</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {coins.map((c) => {
            const fav = favorites.includes(c.id);
            const up = (c.price_change_percentage_24h ?? 0) >= 0;
            return (
              <div key={c.id} className="hud-panel flex items-center gap-3 p-4">
                <img src={c.image} alt={`Logótipo ${c.name}`} className="size-8 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xs tracking-widest">
                    {c.symbol.toUpperCase()}
                  </p>
                  <p className="text-sm">{eur(c.current_price)}</p>
                  <p className={`text-xs ${up ? "text-primary" : "text-destructive"}`}>
                    {pct(c.price_change_percentage_24h)}
                  </p>
                </div>
                {c.sparkline_in_7d?.price?.length ? (
                  <Sparkline data={c.sparkline_in_7d.price} positive={up} />
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleFavorite(c.id)}
                  aria-label={fav ? `Remover ${c.name} da watchlist` : `Adicionar ${c.name} à watchlist`}
                  className={`shrink-0 rounded-md border px-2 py-1 font-display text-[11px] tracking-widest transition-colors ${
                    fav
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {fav ? "★" : "☆"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <form onSubmit={submitAlert} className="hud-panel space-y-3 p-5">
          <h2 className="text-sm tracking-widest text-primary">NOVO ALERTA DE PREÇO</h2>
          <label className="block text-xs text-muted-foreground">
            Moeda
            <select
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
            >
              {coins.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.symbol.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Condição
            <select
              value={form.direction}
              onChange={(e) =>
                setForm((f) => ({ ...f, direction: e.target.value as "above" | "below" }))
              }
              className="mt-1 w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
            >
              <option value="above">Subir acima de</option>
              <option value="below">Descer abaixo de</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Preço alvo (€)
            <input
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              inputMode="decimal"
              placeholder={
                coinById.get(form.symbol)
                  ? String(coinById.get(form.symbol)!.current_price)
                  : "50000"
              }
              className="mt-1 w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md border border-primary/60 bg-primary/10 px-3 py-2 font-display text-[11px] tracking-widest text-primary transition-colors hover:bg-primary/20"
          >
            CRIAR ALERTA
          </button>
        </form>

        <div className="hud-panel p-5">
          <h2 className="mb-3 text-sm tracking-widest text-primary">
            OS MEUS ALERTAS ({(alerts.data ?? []).length})
          </h2>
          {!(alerts.data ?? []).length && (
            <p className="text-xs text-muted-foreground">
              Ainda não tens alertas. Cria um para o Jarvis te avisar quando o preço chegar ao alvo.
            </p>
          )}
          <ul className="space-y-2">
            {(alerts.data ?? []).map((a) => {
              const coin = coinById.get(a.symbol);
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-display text-[11px] tracking-widest">
                      {coin?.symbol.toUpperCase() ?? a.symbol.toUpperCase()} ·{" "}
                      {directionLabels[a.direction]} {eur(a.target_price)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {coin ? `agora ${eur(coin.current_price)}` : "preço indisponível"}
                      {a.last_triggered_at
                        ? ` · disparado em ${new Date(a.last_triggered_at).toLocaleString("pt-PT")}`
                        : a.active
                          ? " · à espera"
                          : " · inativo"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await setPriceAlertActive(a.id, !a.active);
                        refreshAlerts();
                      }}
                      className="rounded-md border border-border px-2 py-1 font-display text-[10px] tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      {a.active ? "PAUSAR" : "ATIVAR"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deletePriceAlert(a.id);
                        refreshAlerts();
                      }}
                      className="rounded-md border border-destructive/50 px-2 py-1 font-display text-[10px] tracking-widest text-destructive"
                    >
                      APAGAR
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
