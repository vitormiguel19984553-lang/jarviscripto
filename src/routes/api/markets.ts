import { createFileRoute } from "@tanstack/react-router";
import { fetchMarketsFromSource } from "@/lib/market-source";

/**
 * Proxy de mercado: a chamada à fonte é feita no servidor (CoinGecko demo ou
 * Binance), com cache curta e erro explícito para o frontend.
 */
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

        try {
          const payload = await fetchMarketsFromSource();
          cache = { at: now, payload };
          return Response.json(payload, {
            headers: { "x-cache": "miss", "cache-control": "public, max-age=30" },
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error("[api/markets] fonte de mercado indisponível:", reason);
          if (cache) {
            return Response.json(cache.payload, { headers: { "x-cache": "stale" } });
          }
          return Response.json(
            {
              error: "market_unavailable",
              message: "Não foi possível contactar a fonte de dados de mercado.",
              reason,
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
