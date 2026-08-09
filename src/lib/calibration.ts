import type { TradeLog } from "@/lib/useJarvis";

export type CalibrationBucket = {
  label: string;
  min: number;
  max: number;
  trades: number;
  wins: number;
  /** Acerto observado (%). */
  observed: number;
  /** Confiança média prometida pela IA nesse intervalo (%). */
  promised: number;
  /** Diferença observado − prometido (negativo = IA demasiado otimista). */
  gap: number;
};

const RANGES: Array<{ label: string; min: number; max: number }> = [
  { label: "< 50%", min: 0, max: 50 },
  { label: "50–59%", min: 50, max: 60 },
  { label: "60–69%", min: 60, max: 70 },
  { label: "70–79%", min: 70, max: 80 },
  { label: "80%+", min: 80, max: 101 },
];

/**
 * Calibração de confiança: compara o que a IA prometeu com o que aconteceu.
 * Só conta operações reais (montante > 0).
 */
export function calibration(logs: TradeLog[]): {
  buckets: CalibrationBucket[];
  trades: number;
  /** Erro médio absoluto de calibração (pontos percentuais). */
  error: number;
} {
  const real = logs.filter((l) => l.amount > 0);
  const buckets = RANGES.map((r) => {
    const inRange = real.filter((l) => l.confidence >= r.min && l.confidence < r.max);
    const wins = inRange.filter((l) => l.pnl > 0).length;
    const observed = inRange.length ? (wins / inRange.length) * 100 : 0;
    const promised = inRange.length
      ? inRange.reduce((a, l) => a + l.confidence, 0) / inRange.length
      : 0;
    return {
      ...r,
      trades: inRange.length,
      wins,
      observed: Number(observed.toFixed(1)),
      promised: Number(promised.toFixed(1)),
      gap: Number((observed - promised).toFixed(1)),
    };
  });

  const withData = buckets.filter((b) => b.trades >= 2);
  const error = withData.length
    ? Number((withData.reduce((a, b) => a + Math.abs(b.gap), 0) / withData.length).toFixed(1))
    : 0;

  return { buckets, trades: real.length, error };
}

/** Frase curta sobre a fiabilidade atual da IA. */
export function calibrationVerdict(error: number, trades: number): string {
  if (trades < 8) return "Amostra ainda pequena — a calibração afina com mais operações.";
  if (error <= 6) return "A IA está bem calibrada: a confiança anunciada aproxima-se do resultado.";
  if (error <= 14) return "Calibração razoável — há desvios em alguns intervalos de confiança.";
  return "A IA está descalibrada: a confiança anunciada afasta-se do acerto real.";
}
