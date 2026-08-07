import type { Coin } from "@/lib/market";

/**
 * Fonte de dados de mercado para chamadas feitas no servidor.
 *
 * A CoinGecko pública recusa pedidos de servidores (429/403). Por isso:
 * 1) se existir uma chave demo da CoinGecko (`COINGECKO_API_KEY`), usamos a API
 *    autenticada com o header `x-cg-demo-api-key`;
 * 2) caso contrário (ou se falhar), usamos os endpoints públicos da Binance,
 *    que aceitam pedidos de servidor sem chave.
 */

type CoinMeta = { id: string; symbol: string; name: string; binance: string; icon: string };

const ICON = (s: string) =>
  `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${s}.png`;

export const COIN_META: CoinMeta[] = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", binance: "BTCUSDT", icon: ICON("btc") },
  { id: "ethereum", symbol: "eth", name: "Ethereum", binance: "ETHUSDT", icon: ICON("eth") },
  { id: "solana", symbol: "sol", name: "Solana", binance: "SOLUSDT", icon: ICON("sol") },
  { id: "cardano", symbol: "ada", name: "Cardano", binance: "ADAUSDT", icon: ICON("ada") },
  { id: "ripple", symbol: "xrp", name: "XRP", binance: "XRPUSDT", icon: ICON("xrp") },
  { id: "chainlink", symbol: "link", name: "Chainlink", binance: "LINKUSDT", icon: ICON("link") },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche", binance: "AVAXUSDT", icon: ICON("avax") },
  { id: "polkadot", symbol: "dot", name: "Polkadot", binance: "DOTUSDT", icon: ICON("dot") },
];

export const MARKET_IDS = COIN_META.map((c) => c.id);

async function fromCoinGecko(apiKey: string): Promise<Coin[]> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=" +
    MARKET_IDS.join(",") +
    "&sparkline=true&price_change_percentage=24h";
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-cg-demo-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = (await res.json()) as Coin[];
  if (!Array.isArray(data) || !data.length) throw new Error("coingecko empty");
  return data;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  return res.json() as Promise<T>;
}

/** Klines 1h das últimas 168 horas → série de fechos (equivalente ao sparkline 7d). */
async function binanceSeries(symbol: string) {
  const rows = await json<unknown[][]>(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=168`,
  );
  return rows.map((r) => Number(r[4]));
}

async function fromBinance(): Promise<Coin[]> {
  // Preços da Binance são em USDT; convertemos para EUR com o par EURUSDT.
  const eurUsdt = await json<{ price: string }>(
    "https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT",
  ).then((r) => Number(r.price));
  const usdtToEur = eurUsdt > 0 ? 1 / eurUsdt : 1;

  const symbols = JSON.stringify(COIN_META.map((c) => c.binance));
  const tickers = await json<
    { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]
  >(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));

  const series = await Promise.all(
    COIN_META.map((m) => binanceSeries(m.binance).catch(() => [] as number[])),
  );

  return COIN_META.map((m, i) => {
    const t = bySymbol.get(m.binance);
    const price = Number(t?.lastPrice ?? 0) * usdtToEur;
    return {
      id: m.id,
      symbol: m.symbol,
      name: m.name,
      image: m.icon,
      current_price: price,
      price_change_percentage_24h: t ? Number(t.priceChangePercent) : null,
      total_volume: Number(t?.quoteVolume ?? 0) * usdtToEur,
      market_cap: 0,
      sparkline_in_7d: { price: series[i].map((p) => p * usdtToEur) },
    } satisfies Coin;
  }).filter((c) => c.current_price > 0);
}

/** Chamada directa à fonte (só para uso no servidor). */
export async function fetchMarketsFromSource(): Promise<Coin[]> {
  const key = process.env.COINGECKO_API_KEY;
  if (key) {
    try {
      return await fromCoinGecko(key);
    } catch {
      /* cai para a Binance */
    }
  }
  return fromBinance();
}
