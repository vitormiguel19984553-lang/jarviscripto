export type Coin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number;
  market_cap: number;
  sparkline_in_7d?: { price: number[] };
};

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

export async function fetchMarkets(): Promise<Coin[]> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=" +
    COINS.join(",") +
    "&sparkline=true&price_change_percentage=24h";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao obter dados de mercado");
  return res.json();
}

export const eur = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: v < 10 ? 4 : 2,
  }).format(v);

export const pct = (v: number | null | undefined) =>
  `${(v ?? 0) >= 0 ? "+" : ""}${(v ?? 0).toFixed(2)}%`;

/** Média móvel simples do último ponto. */
function sma(series: number[], period: number) {
  const slice = series.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** RSI clássico (Wilder simplificado). */
export function rsi(series: number[], period = 14) {
  if (series.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = series.length - period; i < series.length; i++) {
    const d = series[i] - series[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Volatilidade = desvio-padrão dos retornos, em %. */
export function volatility(series: number[]) {
  const rets: number[] = [];
  for (let i = 1; i < series.length; i++) rets.push(series[i] / series[i - 1] - 1);
  const m = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length || 1);
  return Math.sqrt(v) * 100;
}

export type Signal = {
  action: "COMPRAR" | "AGUARDAR" | "VENDER";
  confidence: number;
  rsi: number;
  vol: number;
  trend: "alta" | "baixa";
  reason: string;
};

export function analyse(coin: Coin): Signal {
  const series = coin.sparkline_in_7d?.price ?? [];
  if (series.length < 30) {
    return {
      action: "AGUARDAR",
      confidence: 20,
      rsi: 50,
      vol: 0,
      trend: "alta",
      reason: "Dados históricos insuficientes para análise fiável.",
    };
  }
  const r = rsi(series);
  const v = volatility(series);
  const fast = sma(series, 12);
  const slow = sma(series, 48);
  const trend: "alta" | "baixa" = fast >= slow ? "alta" : "baixa";
  const last = series[series.length - 1];
  const band = volatility(series) / 100;
  const upperBand = slow * (1 + band * 2);
  const lowerBand = slow * (1 - band * 2);

  let score = 50;
  if (trend === "alta") score += 15;
  else score -= 12;
  if (r < 35) score += 18;
  if (r > 70) score -= 20;
  if (last < lowerBand) score += 10;
  if (last > upperBand) score -= 10;
  score -= Math.min(18, v * 4);

  const confidence = Math.max(8, Math.min(92, Math.round(score)));
  const action: Signal["action"] =
    confidence >= 62 && trend === "alta"
      ? "COMPRAR"
      : r > 72 || (trend === "baixa" && confidence < 40)
        ? "VENDER"
        : "AGUARDAR";

  const reason =
    `Tendência de ${trend} (MM12 ${trend === "alta" ? "acima" : "abaixo"} da MM48), ` +
    `RSI ${r.toFixed(0)}, volatilidade ${v.toFixed(2)}%` +
    (last < lowerBand ? ", preço junto à banda inferior de Bollinger" : "") +
    (last > upperBand ? ", preço acima da banda superior de Bollinger" : "") +
    ".";

  return { action, confidence, rsi: r, vol: v, trend, reason };
}
