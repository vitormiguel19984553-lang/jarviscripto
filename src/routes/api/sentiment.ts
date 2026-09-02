import { createFileRoute } from "@tanstack/react-router";

/** Proxy com cache para o Fear & Greed Index (alternative.me). */
const CACHE_MS = 10 * 60_000;
let cache: { at: number; payload: unknown } | null = null;

const labels: Record<string, string> = {
  "Extreme Fear": "medo extremo",
  Fear: "medo",
  Neutral: "neutro",
  Greed: "ganância",
  "Extreme Greed": "ganância extrema",
};

export const Route = createFileRoute("/api/sentiment")({
  server: {
    handlers: {
      GET: async () => {
        const now = Date.now();
        if (cache && now - cache.at < CACHE_MS) return Response.json(cache.payload);
        try {
          const res = await fetch("https://api.alternative.me/fng/?limit=1");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as {
            data?: { value: string; value_classification: string; timestamp: string }[];
          };
          const row = body.data?.[0];
          if (!row) throw new Error("resposta vazia");
          const payload = {
            value: Number(row.value),
            label: labels[row.value_classification] ?? row.value_classification.toLowerCase(),
            updatedAt: new Date(Number(row.timestamp) * 1000).toISOString(),
          };
          cache = { at: now, payload };
          return Response.json(payload);
        } catch (err) {
          console.error("[api/sentiment] indisponível:", err instanceof Error ? err.message : err);
          if (cache) return Response.json(cache.payload);
          return Response.json({ error: "sentiment_unavailable" }, { status: 502 });
        }
      },
    },
  },
});
