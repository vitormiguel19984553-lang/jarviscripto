/**
 * Aprendizagem de trajetórias de preço (puro, partilhado browser/servidor).
 *
 * Depois de cada entrada, amostra-se a variação (%) face ao preço de entrada
 * em marcos fixos (+1, +5, +15, +30, +60 min). No fecho, a trajetória é
 * classificada numa forma reconhecível e as estatísticas por (padrão, forma)
 * alimentam a decisão seguinte: reduzir confiança ou apertar o take-profit.
 */

export type TrajPoint = { t: number; pct: number };

export const SAMPLE_MINUTES = [1, 5, 15, 30, 60] as const;

export type Shape =
  | "subida_sustentada"
  | "pico_reversao"
  | "queda_recuperacao"
  | "lateral_queda"
  | "queda_continua"
  | "lateral";

export const SHAPE_LABELS: Record<Shape, string> = {
  subida_sustentada: "subida imediata e sustentada",
  pico_reversao: "pico e reversão rápida",
  queda_recuperacao: "queda inicial seguida de recuperação",
  lateral_queda: "lateral depois queda",
  queda_continua: "queda contínua",
  lateral: "lateral",
};

export const shapeLabel = (s: string) => SHAPE_LABELS[s as Shape] ?? s;

export function asTrajectory(raw: unknown): TrajPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ t: Number((p as TrajPoint)?.t), pct: Number((p as TrajPoint)?.pct) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.pct));
}

/**
 * Acrescenta amostras em falta: cada marco é gravado uma única vez, na
 * primeira vez que o tempo decorrido o ultrapassa. Devolve null se nada mudou.
 */
export function sampleTrajectory(
  current: TrajPoint[],
  openedAtIso: string | null | undefined,
  entryPrice: number,
  price: number,
  nowMs = Date.now(),
): TrajPoint[] | null {
  if (!openedAtIso || !entryPrice) return null;
  const elapsedMin = (nowMs - new Date(openedAtIso).getTime()) / 60_000;
  if (!Number.isFinite(elapsedMin)) return null;
  const taken = new Set(current.map((p) => p.t));
  const due = SAMPLE_MINUTES.filter((m) => elapsedMin >= m && !taken.has(m));
  if (!due.length) return null;
  const pct = Number(((price / entryPrice - 1) * 100).toFixed(3));
  // Se vários marcos venceram ao mesmo tempo (tick atrasado), só o mais
  // recente recebe o preço atual; os anteriores ficam sem amostra fiável.
  const mark = due[due.length - 1];
  return [...current, { t: mark, pct }].sort((a, b) => a.t - b.t);
}

/** Trajetória completa no fecho: amostras + ponto final. */
export function finalTrajectory(
  samples: TrajPoint[],
  openedAtIso: string | null | undefined,
  finalPct: number,
  nowMs = Date.now(),
): TrajPoint[] {
  const t = openedAtIso
    ? Math.max(0, Number(((nowMs - new Date(openedAtIso).getTime()) / 60_000).toFixed(1)))
    : (samples[samples.length - 1]?.t ?? 0);
  const pts = samples.filter((p) => p.t < t);
  return [...pts, { t, pct: Number(finalPct.toFixed(3)) }];
}

export function peakOf(points: TrajPoint[]): { pct: number; t: number } {
  let best = { pct: 0, t: 0 };
  for (const p of points) if (p.pct > best.pct) best = { pct: p.pct, t: p.t };
  return best;
}

/** Classificador por regras sobre a trajetória normalizada. */
export function classifyShape(points: TrajPoint[]): Shape {
  if (!points.length) return "lateral";
  const final = points[points.length - 1].pct;
  const peak = peakOf(points);
  const trough = Math.min(0, ...points.map((p) => p.pct));
  const early = points.filter((p) => p.t <= 15);
  const firstPct = points[0].pct;
  const earlyFlat = early.length > 0 && early.every((p) => Math.abs(p.pct) < 0.3);

  if (peak.pct >= 0.5 && peak.t <= 20 && final <= peak.pct * 0.4) return "pico_reversao";
  if (trough <= -0.4 && firstPct < 0 && final >= trough + 0.5) return "queda_recuperacao";
  if (earlyFlat && final <= -0.4) return "lateral_queda";
  if (final <= -0.4 && peak.pct < 0.2) return "queda_continua";
  if (final >= 0.3 && final >= peak.pct * 0.7) return "subida_sustentada";
  return "lateral";
}

export type ShapeStat = {
  pattern_key: string;
  shape: string;
  trades: number;
  wins: number;
  total_pnl: number;
  avg_peak_pct: number;
  avg_peak_min: number;
  avg_final_pct: number;
};

/** Estatística seguinte depois de mais uma trajetória fechada. */
export function applyShape(
  row: ShapeStat | null,
  args: { patternKey: string; shape: Shape; pnl: number; points: TrajPoint[] },
): ShapeStat {
  const n = row?.trades ?? 0;
  const peak = peakOf(args.points);
  const final = args.points[args.points.length - 1]?.pct ?? 0;
  const avg = (prev: number, v: number) => Number(((prev * n + v) / (n + 1)).toFixed(3));
  return {
    pattern_key: args.patternKey,
    shape: args.shape,
    trades: n + 1,
    wins: (row?.wins ?? 0) + (args.pnl > 0 ? 1 : 0),
    total_pnl: Number(((row?.total_pnl ?? 0) + args.pnl).toFixed(2)),
    avg_peak_pct: avg(row?.avg_peak_pct ?? 0, peak.pct),
    avg_peak_min: avg(row?.avg_peak_min ?? 0, peak.t),
    avg_final_pct: avg(row?.avg_final_pct ?? 0, final),
  };
}

export type TrajectoryAdvice = {
  penalty: number;
  tpCapPct: number | null;
  dominant: string | null;
  note: string;
};

export const NO_ADVICE: TrajectoryAdvice = { penalty: 0, tpCapPct: null, dominant: null, note: "" };

/**
 * Conselho para um padrão a partir das formas que costuma produzir.
 * Só atua com amostra mínima (3 trajetórias) e forma dominante (≥40%).
 */
export function adviceFor(rows: ShapeStat[]): TrajectoryAdvice {
  const total = rows.reduce((a, r) => a + r.trades, 0);
  if (total < 3) return NO_ADVICE;
  const top = [...rows].sort((a, b) => b.trades - a.trades)[0];
  const share = top.trades / total;
  if (share < 0.4 || top.trades < 2) return NO_ADVICE;
  const pctShare = Math.round(share * 100);
  const mins = Math.max(1, Math.round(top.avg_peak_min));

  if (top.shape === "pico_reversao" && top.avg_peak_pct > 0.3) {
    const cap = Number(Math.max(0.3, top.avg_peak_pct * 0.8).toFixed(2));
    return {
      penalty: 3,
      tpCapPct: cap,
      dominant: top.shape,
      note: `trajetória típica: este padrão normalmente sobe por ~${mins}min (pico médio +${top.avg_peak_pct.toFixed(2)}%) e depois reverte (${pctShare}% de ${total} casos) — ajustei o take-profit para ${cap}% para capturar isso`,
    };
  }
  if (
    (top.shape === "queda_continua" || top.shape === "lateral_queda") &&
    top.avg_final_pct < 0
  ) {
    const penalty = top.shape === "queda_continua" ? 8 : 6;
    return {
      penalty,
      tpCapPct: null,
      dominant: top.shape,
      note: `trajetória típica: este padrão costuma acabar em ${shapeLabel(top.shape)} (${pctShare}% de ${total} casos, média ${top.avg_final_pct.toFixed(2)}%) — confiança reduzida em ${penalty} pontos`,
    };
  }
  if (top.shape === "subida_sustentada") {
    return {
      penalty: 0,
      tpCapPct: null,
      dominant: top.shape,
      note: `trajetória típica: subida sustentada (${pctShare}% de ${total} casos) — take-profit mantido`,
    };
  }
  if (top.shape === "queda_recuperacao") {
    return {
      penalty: 0,
      tpCapPct: null,
      dominant: top.shape,
      note: `trajetória típica: queda inicial seguida de recuperação (${pctShare}% de ${total} casos) — a IA tolera o recuo inicial`,
    };
  }
  return NO_ADVICE;
}

/** Take-profit efetivo: o teto da trajetória só aperta, nunca alarga. */
export function capTakeProfit<T extends { takeProfitPct: number; trailingStopPct: number }>(
  p: T,
  cap: number | null | undefined,
): T {
  if (!cap || cap <= 0 || cap >= p.takeProfitPct) return p;
  const tp = Number(Math.max(0.3, cap).toFixed(2));
  return { ...p, takeProfitPct: tp, trailingStopPct: Math.min(p.trailingStopPct, tp * 0.4) };
}
