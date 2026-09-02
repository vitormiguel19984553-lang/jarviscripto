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

export const MARKET_COINS = COINS;

/**
 * Frontend: passa pelo proxy do servidor (`/api/markets`), que tem cache e
 * devolve um erro claro em vez de falhar em silêncio.
 */
export async function fetchMarkets(): Promise<Coin[]> {
  const res = await fetch("/api/markets", { headers: { accept: "application/json" } });
  if (!res.ok) {
    let message = "Sinais indisponíveis. A tentar novamente…";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* resposta sem corpo utilizável */
    }
    throw new Error(message);
  }
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

/** Média móvel exponencial (série completa). */
function emaSeries(series: number[], period: number): number[] {
  if (!series.length) return [];
  const k = 2 / (period + 1);
  const out = [series[0]];
  for (let i = 1; i < series.length; i++) out.push(series[i] * k + out[i - 1] * (1 - k));
  return out;
}

const ema = (series: number[], period: number) => {
  const s = emaSeries(series, period);
  return s.length ? s[s.length - 1] : 0;
};

/** MACD clássico (12/26/9) com linha, sinal e histograma. */
export function macd(series: number[]) {
  if (series.length < 30) return { line: 0, signal: 0, hist: 0 };
  const fast = emaSeries(series, 12);
  const slow = emaSeries(series, 26);
  const line = fast.map((v, i) => v - slow[i]);
  const signalSeries = emaSeries(line.slice(26), 9);
  const l = line[line.length - 1];
  const s = signalSeries.length ? signalSeries[signalSeries.length - 1] : l;
  return { line: l, signal: s, hist: l - s };
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

export type Verdict3 = "alta" | "baixa" | "neutro";

/** Um indicador verificado pela IA antes de decidir. */
export type IndicatorCheck = {
  name: string;
  value: string;
  verdict: Verdict3;
  /** Contribuição (em pontos) para a confiança final. */
  points: number;
};

/** Leitura da mesma moeda em vários horizontes temporais. */
export type TimeframeRead = {
  label: string;
  hours: number;
  trend: Verdict3;
  changePct: number;
  rsi: number;
};

export type Signal = {
  action: "COMPRAR" | "AGUARDAR" | "VENDER";
  confidence: number;
  rsi: number;
  vol: number;
  trend: "alta" | "baixa";
  reason: string;
  /** Indicadores cruzados antes da decisão. */
  checks: IndicatorCheck[];
  /** Horizontes analisados (curto, médio, longo). */
  timeframes: TimeframeRead[];
  /** Nº de indicadores a favor da direção escolhida. */
  agree: number;
  /** Nº de indicadores contra. */
  against: number;
  /** Horizontes alinhados na mesma direção. */
  alignment: number;
};

const trendOf = (series: number[], fastP: number, slowP: number): Verdict3 => {
  if (series.length < slowP) return "neutro";
  const f = sma(series, fastP);
  const s = sma(series, slowP);
  const diff = ((f - s) / s) * 100;
  return diff > 0.15 ? "alta" : diff < -0.15 ? "baixa" : "neutro";
};

function readTimeframe(series: number[], label: string, hours: number): TimeframeRead {
  const slice = series.slice(-hours);
  const change = slice.length > 1 ? (slice[slice.length - 1] / slice[0] - 1) * 100 : 0;
  return {
    label,
    hours,
    trend: trendOf(slice, Math.max(3, Math.round(hours / 8)), Math.max(6, Math.round(hours / 3))),
    changePct: Number(change.toFixed(2)),
    rsi: Math.round(rsi(slice, Math.min(14, Math.max(5, Math.floor(slice.length / 3))))),
  };
}

/**
 * Análise técnica multi-indicador e multi-horizonte.
 * Cada indicador dá um veredicto e pontos; a confiança final é a soma
 * ponderada, e a acção só sai se houver maioria clara de confirmações.
 */
export function analyse(coin: Coin): Signal {
  return analyseSeries(coin.sparkline_in_7d?.price ?? [], {
    total_volume: coin.total_volume,
    market_cap: coin.market_cap,
  });
}

/**
 * Núcleo de pontuação partilhado: usado pelo motor ao vivo (`analyse`) e pelo
 * backtesting histórico, para que as duas nunca divirjam.
 */
export function analyseSeries(
  series: number[],
  meta: { total_volume?: number; market_cap?: number } = {},
): Signal {
  if (series.length < 30) {
    return {
      action: "AGUARDAR",
      confidence: 20,
      rsi: 50,
      vol: 0,
      trend: "alta",
      reason: "Dados históricos insuficientes para análise fiável.",
      checks: [],
      timeframes: [],
      agree: 0,
      against: 0,
      alignment: 0,
    };
  }

  const r = rsi(series);
  const v = volatility(series);
  const fast = sma(series, 12);
  const slow = sma(series, 48);
  const trend: "alta" | "baixa" = fast >= slow ? "alta" : "baixa";
  const last = series[series.length - 1];
  const band = v / 100;
  const upperBand = slow * (1 + band * 2);
  const lowerBand = slow * (1 - band * 2);
  const m = macd(series);
  const ema9 = ema(series, 9);
  const ema21 = ema(series, 21);
  const momentum = series.length > 24 ? (last / series[series.length - 24] - 1) * 100 : 0;
  const liquidity = meta.market_cap ? (meta.total_volume ?? 0) / meta.market_cap : 0;

  const timeframes = [
    readTimeframe(series, "6H", 6),
    readTimeframe(series, "24H", 24),
    readTimeframe(series, "3D", 72),
    readTimeframe(series, "7D", series.length),
  ];

  const checks: IndicatorCheck[] = [];
  const add = (name: string, value: string, verdict: Verdict3, points: number) =>
    checks.push({ name, value, verdict, points });

  // 1. Cruzamento de médias simples
  add(
    "Cruzamento MM12/MM48",
    `${trend === "alta" ? "MM12 acima" : "MM12 abaixo"} (${(((fast - slow) / slow) * 100).toFixed(2)}%)`,
    trend,
    trend === "alta" ? 14 : -12,
  );

  // 2. Cruzamento de médias exponenciais (mais reactivo)
  const emaVerdict: Verdict3 = ema9 > ema21 ? "alta" : "baixa";
  add(
    "Cruzamento EMA9/EMA21",
    `${emaVerdict === "alta" ? "EMA9 acima" : "EMA9 abaixo"} (${(((ema9 - ema21) / ema21) * 100).toFixed(2)}%)`,
    emaVerdict,
    emaVerdict === "alta" ? 7 : -7,
  );

  // 3. MACD
  const macdVerdict: Verdict3 = m.hist > 0 ? "alta" : m.hist < 0 ? "baixa" : "neutro";
  add(
    "MACD (12/26/9)",
    `histograma ${m.hist >= 0 ? "+" : ""}${m.hist.toFixed(4)}`,
    macdVerdict,
    macdVerdict === "alta" ? 8 : macdVerdict === "baixa" ? -8 : 0,
  );

  // 4. RSI
  const rsiVerdict: Verdict3 = r < 35 ? "alta" : r > 70 ? "baixa" : "neutro";
  add(
    "RSI 14",
    `${r.toFixed(0)} (${r < 35 ? "sobrevenda" : r > 70 ? "sobrecompra" : "neutro"})`,
    rsiVerdict,
    r < 35 ? 18 : r > 70 ? (trend === "alta" ? (r > 82 ? -6 : -2) : -20) : 0,
  );

  // 5. Bandas de Bollinger
  const bbVerdict: Verdict3 = last < lowerBand ? "alta" : last > upperBand ? "baixa" : "neutro";
  add(
    "Bandas de Bollinger",
    last < lowerBand
      ? "preço junto à banda inferior"
      : last > upperBand
        ? "preço acima da banda superior"
        : "preço dentro das bandas",
    bbVerdict,
    last < lowerBand ? 10 : last > upperBand ? (trend === "alta" ? -3 : -10) : 0,
  );

  // 6. Momento das últimas 24 leituras
  const momVerdict: Verdict3 = momentum > 0.5 ? "alta" : momentum < -0.5 ? "baixa" : "neutro";
  add(
    "Momento 24H",
    `${momentum >= 0 ? "+" : ""}${momentum.toFixed(2)}%`,
    momVerdict,
    Math.max(-8, Math.min(8, momentum * 1.5)),
  );

  // 7. Volatilidade (risco)
  add(
    "Volatilidade",
    `${v.toFixed(2)}%`,
    v > 1.2 ? "baixa" : v < 0.5 ? "alta" : "neutro",
    -Math.min(18, v * 4),
  );

  // 8. Liquidez (volume / capitalização)
  const liqVerdict: Verdict3 = liquidity > 0.05 ? "alta" : liquidity < 0.01 ? "baixa" : "neutro";
  add(
    "Liquidez (vol/cap)",
    `${(liquidity * 100).toFixed(2)}%`,
    liqVerdict,
    liqVerdict === "alta" ? 4 : liqVerdict === "baixa" ? -4 : 0,
  );

  // 9. Alinhamento entre horizontes
  const upTf = timeframes.filter((t) => t.trend === "alta").length;
  const downTf = timeframes.filter((t) => t.trend === "baixa").length;
  const alignment = Math.max(upTf, downTf);
  const tfVerdict: Verdict3 = upTf > downTf ? "alta" : downTf > upTf ? "baixa" : "neutro";
  add(
    "Alinhamento multi-horizonte",
    `${alignment}/${timeframes.length} horizontes em ${tfVerdict === "neutro" ? "conflito" : tfVerdict}`,
    tfVerdict,
    tfVerdict === "alta" ? alignment * 3 : tfVerdict === "baixa" ? -alignment * 3 : -2,
  );

  const score = 50 + checks.reduce((a, c) => a + c.points, 0);
  const confidence = Math.max(8, Math.min(92, Math.round(score)));

  const direction: Verdict3 = confidence >= 55 ? "alta" : confidence <= 40 ? "baixa" : "neutro";
  const agree = checks.filter((c) => c.verdict === direction && direction !== "neutro").length;
  const against = checks.filter(
    (c) => c.verdict !== "neutro" && c.verdict !== direction && direction !== "neutro",
  ).length;

  // Exigência de confirmações: pelo menos 4 indicadores a favor e maioria clara.
  const confirmed = agree >= 4 && agree > against;

  const action: Signal["action"] =
    confirmed && direction === "alta" && confidence >= 62 && alignment >= 2
      ? "COMPRAR"
      : confirmed && direction === "baixa" && (r > 72 || confidence < 40)
        ? "VENDER"
        : "AGUARDAR";

  const top = [...checks]
    .filter((c) => c.verdict !== "neutro")
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 4)
    .map((c) => `${c.name}: ${c.value}`)
    .join("; ");

  const reason =
    `${checks.length} indicadores cruzados em ${timeframes.length} horizontes ` +
    `(${agree} a favor, ${against} contra, ${alignment}/${timeframes.length} alinhados). ${top}.`;

  return {
    action,
    confidence,
    rsi: r,
    vol: v,
    trend,
    reason,
    checks,
    timeframes,
    agree,
    against,
    alignment,
  };
}
