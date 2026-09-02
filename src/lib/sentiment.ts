/**
 * Sentimento de mercado (Fear & Greed Index).
 *
 * É uma leitura de SENTIMENTO, sempre apresentada em separado dos sinais
 * técnicos, e entra apenas como pequeno ajuste opcional à confiança.
 */

export type Sentiment = {
  value: number;
  label: string;
  updatedAt: string;
};

export async function fetchSentiment(): Promise<Sentiment> {
  const res = await fetch("/api/sentiment", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("Sentimento indisponível");
  return res.json();
}

/** Ajuste em pontos de confiança (limitado a ±6) para uma direção. */
export function sentimentAdjust(
  sentiment: Sentiment | null | undefined,
  action: "COMPRAR" | "VENDER",
): { points: number; note: string } {
  if (!sentiment) return { points: 0, note: "" };
  const v = sentiment.value;
  // Medo extremo favorece compras; ganância extrema favorece cautela.
  const bias = (50 - v) / 10;
  const points = Math.max(-6, Math.min(6, action === "COMPRAR" ? bias : -bias));
  return {
    points: Number(points.toFixed(1)),
    note: `sentimento ${sentiment.value}/100 (${sentiment.label})`,
  };
}
