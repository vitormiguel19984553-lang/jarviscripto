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
  { id: "binancecoin", symbol: "bnb", name: "BNB", binance: "BNBUSDT", icon: ICON("bnb") },
  { id: "solana", symbol: "sol", name: "Solana", binance: "SOLUSDT", icon: ICON("sol") },
  { id: "ripple", symbol: "xrp", name: "XRP", binance: "XRPUSDT", icon: ICON("xrp") },
  { id: "cardano", symbol: "ada", name: "Cardano", binance: "ADAUSDT", icon: ICON("ada") },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin", binance: "DOGEUSDT", icon: ICON("doge") },
  { id: "tron", symbol: "trx", name: "TRON", binance: "TRXUSDT", icon: ICON("trx") },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche", binance: "AVAXUSDT", icon: ICON("avax") },
  { id: "polkadot", symbol: "dot", name: "Polkadot", binance: "DOTUSDT", icon: ICON("dot") },
  { id: "chainlink", symbol: "link", name: "Chainlink", binance: "LINKUSDT", icon: ICON("link") },
  { id: "litecoin", symbol: "ltc", name: "Litecoin", binance: "LTCUSDT", icon: ICON("ltc") },
  { id: "bitcoin-cash", symbol: "bch", name: "Bitcoin Cash", binance: "BCHUSDT", icon: ICON("bch") },
  { id: "cosmos", symbol: "atom", name: "Cosmos", binance: "ATOMUSDT", icon: ICON("atom") },
  { id: "stellar", symbol: "xlm", name: "Stellar", binance: "XLMUSDT", icon: ICON("xlm") },
  { id: "near", symbol: "near", name: "NEAR Protocol", binance: "NEARUSDT", icon: ICON("near") },
  { id: "aptos", symbol: "apt", name: "Aptos", binance: "APTUSDT", icon: ICON("apt") },
  { id: "sui", symbol: "sui", name: "Sui", binance: "SUIUSDT", icon: ICON("sui") },
  { id: "filecoin", symbol: "fil", name: "Filecoin", binance: "FILUSDT", icon: ICON("fil") },
  {
    id: "ethereum-classic",
    symbol: "etc",
    name: "Ethereum Classic",
    binance: "ETCUSDT",
    icon: ICON("etc"),
  },
  {
    id: "internet-computer",
    symbol: "icp",
    name: "Internet Computer",
    binance: "ICPUSDT",
    icon: ICON("icp"),
  },
  { id: "hedera-hashgraph", symbol: "hbar", name: "Hedera", binance: "HBARUSDT", icon: ICON("hbar") },
  { id: "vechain", symbol: "vet", name: "VeChain", binance: "VETUSDT", icon: ICON("vet") },
  { id: "algorand", symbol: "algo", name: "Algorand", binance: "ALGOUSDT", icon: ICON("algo") },
  { id: "arbitrum", symbol: "arb", name: "Arbitrum", binance: "ARBUSDT", icon: ICON("arb") },
  { id: "optimism", symbol: "op", name: "Optimism", binance: "OPUSDT", icon: ICON("op") },
  { id: "injective-protocol", symbol: "inj", name: "Injective", binance: "INJUSDT", icon: ICON("inj") },
  { id: "uniswap", symbol: "uni", name: "Uniswap", binance: "UNIUSDT", icon: ICON("uni") },
  { id: "aave", symbol: "aave", name: "Aave", binance: "AAVEUSDT", icon: ICON("aave") },
  { id: "lido-dao", symbol: "ldo", name: "Lido DAO", binance: "LDOUSDT", icon: ICON("ldo") },
  { id: "the-graph", symbol: "grt", name: "The Graph", binance: "GRTUSDT", icon: ICON("grt") },
  { id: "the-sandbox", symbol: "sand", name: "The Sandbox", binance: "SANDUSDT", icon: ICON("sand") },
  { id: "decentraland", symbol: "mana", name: "Decentraland", binance: "MANAUSDT", icon: ICON("mana") },
  { id: "axie-infinity", symbol: "axs", name: "Axie Infinity", binance: "AXSUSDT", icon: ICON("axs") },
  { id: "render-token", symbol: "rndr", name: "Render", binance: "RENDERUSDT", icon: ICON("rndr") },
  { id: "fantom", symbol: "ftm", name: "Fantom", binance: "FTMUSDT", icon: ICON("ftm") },
  { id: "elrond-erd-2", symbol: "egld", name: "MultiversX", binance: "EGLDUSDT", icon: ICON("egld") },
  { id: "tezos", symbol: "xtz", name: "Tezos", binance: "XTZUSDT", icon: ICON("xtz") },
  { id: "eos", symbol: "eos", name: "EOS", binance: "EOSUSDT", icon: ICON("eos") },
  { id: "chiliz", symbol: "chz", name: "Chiliz", binance: "CHZUSDT", icon: ICON("chz") },
];


export const MARKET_IDS = COIN_META.map((c) => c.id);

/** Últimos motivos de falha por fonte — expostos pelo /api/markets para diagnóstico. */
export const lastSourceErrors: Record<string, string> = {};

function note(source: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  lastSourceErrors[source] = `${msg} @ ${new Date().toISOString()}`;
  console.error(`[markets] ${source} falhou:`, msg);
}

async function fromCoinGecko(apiKey?: string): Promise<Coin[]> {
  // 40 ids cabem num único pedido; sem chave usa-se o tier público (rate limit
  // mais baixo, mas a cache do endpoint mantém a frequência baixa).
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=" +
    MARKET_IDS.join(",") +
    "&sparkline=true&price_change_percentage=24h";
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`coingecko ${res.status}${body ? ` ${body}` : ""}`);
  }
  const data = (await res.json()) as Coin[];
  if (!Array.isArray(data) || !data.length) throw new Error("coingecko empty");
  return data;
}

/**
 * Hosts da Binance por ordem de preferência. O host principal devolve 403/451 a
 * partir de vários datacenters, por isso qualquer pedido tenta a cadeia toda e
 * fixa o primeiro host que responder (evita 40x tentativas repetidas).
 */
const BINANCE_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api-gcp.binance.com",
];

let binanceHost: string | null = null;

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  return res.json() as Promise<T>;
}

/** Pedido à Binance com failover de host; memoriza o host que funciona. */
async function binanceJson<T>(path: string): Promise<T> {
  const hosts = binanceHost ? [binanceHost, ...BINANCE_HOSTS.filter((h) => h !== binanceHost)] : BINANCE_HOSTS;
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const out = await json<T>(`${host}${path}`);
      binanceHost = host;
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  binanceHost = null;
  throw lastErr instanceof Error ? lastErr : new Error("binance indisponível");
}

/** Klines 1h das últimas 168 horas → série de fechos (equivalente ao sparkline 7d). */
async function binanceSeries(symbol: string) {
  const rows = await binanceJson<unknown[][]>(
    `/api/v3/klines?symbol=${symbol}&interval=1h&limit=168`,
  );
  return rows.map((r) => Number(r[4]));
}

/**
 * Quantos EUR vale 1 USDT.
 *
 * Todos os preços da app estão em EUR; as ordens reais na Binance são cotadas
 * em USDT/USDC. Sem esta conversão, uma posição real aberta parece logo ~18%
 * negativa e aciona o stop loss no tick seguinte.
 *
 * A Binance bloqueia pedidos de alguns servidores (HTTP 451), por isso há uma
 * cadeia de fontes alternativas. Só falha se nenhuma responder — nunca se
 * inventa uma taxa.
 */
const FX_HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api-gcp.binance.com",
  "https://data-api.binance.vision",
];

let fxCache: { at: number; rate: number } | null = null;
const FX_CACHE_MS = 5 * 60_000;

async function fxFromBinance(): Promise<number> {
  let lastErr: unknown = null;
  for (const host of FX_HOSTS) {
    try {
      const r = await json<{ price: string }>(
        `${host}/api/v3/ticker/price?symbol=EURUSDT`,
      );
      const eurUsdt = Number(r.price);
      if (eurUsdt > 0) return 1 / eurUsdt;
      throw new Error("eurusdt inválido");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("binance fx indisponível");
}

async function fxFromCoinGecko(): Promise<number> {
  const key = process.env.COINGECKO_API_KEY;
  const res = await fetch("https://api.coingecko.com/api/v3/exchange_rates", {
    headers: {
      accept: "application/json",
      ...(key ? { "x-cg-demo-api-key": key } : {}),
    },
  });
  if (!res.ok) throw new Error(`coingecko rates ${res.status}`);
  const data = (await res.json()) as {
    rates?: Record<string, { value?: number }>;
  };
  // rates são em relação a 1 BTC: EUR por BTC ÷ USD por BTC ≈ EUR por USD(T).
  const eur = Number(data.rates?.eur?.value);
  const usd = Number(data.rates?.usd?.value);
  if (!(eur > 0 && usd > 0)) throw new Error("coingecko rates incompletas");
  return eur / usd;
}

async function fxFromFrankfurter(): Promise<number> {
  const r = await json<{ rates?: Record<string, number> }>(
    "https://api.frankfurter.app/latest?from=USD&to=EUR",
  );
  const v = Number(r.rates?.EUR);
  if (!(v > 0)) throw new Error("frankfurter sem EUR");
  return v;
}

async function fxFromExchangerateHost(): Promise<number> {
  const r = await json<{ rates?: Record<string, number> }>(
    "https://open.er-api.com/v6/latest/USD",
  );
  const v = Number(r.rates?.EUR);
  if (!(v > 0)) throw new Error("er-api sem EUR");
  return v;
}

export async function usdtToEurRate(): Promise<number> {
  const now = Date.now();
  if (fxCache && now - fxCache.at < FX_CACHE_MS) return fxCache.rate;

  const sources: [string, () => Promise<number>][] = [
    ["binance", fxFromBinance],
    ["coingecko", fxFromCoinGecko],
    ["frankfurter", fxFromFrankfurter],
    ["er-api", fxFromExchangerateHost],
  ];

  for (const [name, fn] of sources) {
    try {
      const rate = await fn();
      // Sanidade: EUR/USD real anda entre 0.7 e 1.3.
      if (!(rate > 0.7 && rate < 1.3)) throw new Error(`taxa fora do esperado (${rate})`);
      fxCache = { at: now, rate };
      return rate;
    } catch (err) {
      console.error(`[fx] ${name} falhou:`, err instanceof Error ? err.message : err);
    }
  }

  // Última rede: taxa em cache mesmo expirada é melhor que bloquear tudo.
  if (fxCache) {
    console.warn("[fx] a usar taxa em cache expirada");
    return fxCache.rate;
  }
  throw new Error("eurusdt indisponível");
}


async function fromBinance(): Promise<Coin[]> {
  const usdtToEur = await usdtToEurRate();

  const symbols = JSON.stringify(COIN_META.map((c) => c.binance));
  const tickers = await binanceJson<
    { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]
  >(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
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

/**
 * Chamada directa à fonte (só para uso no servidor).
 *
 * Ordem: CoinGecko com chave → CoinGecko sem chave (distingue chave
 * inválida/limitada de indisponibilidade real) → Binance com failover de host.
 */
export async function fetchMarketsFromSource(): Promise<Coin[]> {
  const key = process.env.COINGECKO_API_KEY;
  const attempts: [string, () => Promise<Coin[]>][] = [];
  if (key) attempts.push(["coingecko-key", () => fromCoinGecko(key)]);
  attempts.push(["coingecko-public", () => fromCoinGecko()]);
  attempts.push(["binance", () => fromBinance()]);

  let lastErr: unknown = null;
  for (const [name, fn] of attempts) {
    try {
      const out = await fn();
      delete lastSourceErrors[name];
      return out;
    } catch (err) {
      note(name, err);
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fonte de mercado indisponível");
}
