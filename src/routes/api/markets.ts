import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy de mercado: a chamada à CoinGecko passa a ser feita no servidor,
 * com cache curta (45s) e erro explícito para o frontend.
 */
const COINS = [
  "bitcoin",
  "ethereum",
  "solana",
  "cardano",
  "ripple",
  "chainlink",
  "avalanche-2",
  "polkadot",
];

const CACHE_MS = 45_000;
let cache: { at: number; payload: unknown } | null = null;

export const Route = createFileRoute("/api/markets")({
  server: {
    handlers: {
      GET: async () => {
        const now = Date.now();
        if (cache && now - cache.at < CACHE_MS) {
          return Response.json(cache.payload, {
            headers: { "x-cache": "hit", "cache-control": "public, max-age=30" },
          });
        }

        const url =
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=" +
          COINS.join(",") +
          "&sparkline=true&price_change_percentage=24h";

        try {
          const res = await fetch(url, { headers: { accept: "application/json" } });
          if (!res.ok) {
            if (cache) {
              return Response.json(cache.payload, { headers: { "x-cache": "stale" } });
            }
            return Response.json(
              { error: "market_unavailable", message: "A fonte de dados de mercado recusou o pedido." },
              { status: 502 },
            );
          }
          const payload = await res.json();
          cache = { at: now, payload };
          return Response.json(payload, {
            headers: { "x-cache": "miss", "cache-control": "public, max-age=30" },
          });
        } catch {
          if (cache) {
            return Response.json(cache.payload, { headers: { "x-cache": "stale" } });
          }
          return Response.json(
            { error: "market_unavailable", message: "Não foi possível contactar a fonte de dados." },
            { status: 502 },
          );
        }
      },
    },
  },
});
