import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  adviceFor,
  applyShape,
  asTrajectory,
  classifyShape,
  finalTrajectory,
  sampleTrajectory,
  type Shape,
  type ShapeStat,
  type TrajectoryAdvice,
  type TrajPoint,
} from "@/lib/trajectory";

/**
 * Persistência da memória de trajetórias. Recebe o cliente como argumento
 * para servir o motor do browser (RLS) e o do servidor (admin) sem importar
 * nenhum cliente diretamente.
 */
type Db = SupabaseClient<Database>;

const COLS = "pattern_key,shape,trades,wins,total_pnl,avg_peak_pct,avg_peak_min,avg_final_pct";

const norm = (r: Record<string, unknown>): ShapeStat => ({
  pattern_key: String(r.pattern_key),
  shape: String(r.shape),
  trades: Number(r.trades),
  wins: Number(r.wins),
  total_pnl: Number(r.total_pnl),
  avg_peak_pct: Number(r.avg_peak_pct),
  avg_peak_min: Number(r.avg_peak_min),
  avg_final_pct: Number(r.avg_final_pct),
});

export async function loadShapeStats(db: Db, userId: string, patternKey: string) {
  const { data } = await db
    .from("ia_trajetorias")
    .select(COLS)
    .eq("user_id", userId)
    .eq("pattern_key", patternKey);
  return (data ?? []).map((r) => norm(r as Record<string, unknown>));
}

export async function trajectoryAdvice(
  db: Db,
  userId: string,
  patternKey: string,
): Promise<TrajectoryAdvice> {
  try {
    return adviceFor(await loadShapeStats(db, userId, patternKey));
  } catch {
    return adviceFor([]);
  }
}

/** Amostra a trajetória de uma posição aberta (grava só quando há marco novo). */
export async function samplePosition(
  db: Db,
  userId: string,
  pos: { symbol: string; avg_entry_price: number; opened_at?: string | null; trajectory?: unknown },
  price: number,
): Promise<TrajPoint[] | null> {
  const next = sampleTrajectory(
    asTrajectory(pos.trajectory),
    pos.opened_at,
    pos.avg_entry_price,
    price,
  );
  if (!next) return null;
  await db
    .from("sim_positions")
    .update({ trajectory: next, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("symbol", pos.symbol);
  return next;
}

/**
 * No fecho: classifica a trajetória, atualiza a estatística (padrão, forma)
 * e anota a operação. Devolve a forma para uso no texto.
 */
export async function recordTrajectory(
  db: Db,
  args: {
    userId: string;
    patternKey: string | null;
    tradeId?: string | null;
    trajectory: unknown;
    openedAt: string | null | undefined;
    finalPct: number;
    pnl: number;
  },
): Promise<{ shape: Shape; points: TrajPoint[] } | null> {
  const points = finalTrajectory(asTrajectory(args.trajectory), args.openedAt, args.finalPct);
  const shape = classifyShape(points);
  try {
    if (args.tradeId) {
      await db
        .from("trades")
        .update({ trajectory: points, trajectory_shape: shape })
        .eq("id", args.tradeId);
    }
    if (!args.patternKey) return { shape, points };
    const { data: cur } = await db
      .from("ia_trajetorias")
      .select(COLS)
      .eq("user_id", args.userId)
      .eq("pattern_key", args.patternKey)
      .eq("shape", shape)
      .maybeSingle();
    const next = applyShape(cur ? norm(cur as Record<string, unknown>) : null, {
      patternKey: args.patternKey,
      shape,
      pnl: args.pnl,
      points,
    });
    await db
      .from("ia_trajetorias")
      .upsert(
        { user_id: args.userId, ...next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,pattern_key,shape" },
      );
  } catch {
    /* a memória de trajetórias nunca bloqueia a operação */
  }
  return { shape, points };
}

/** Formas mais frequentes do utilizador (painel do cérebro). */
export async function topShapes(db: Db, userId: string, limit = 6) {
  const { data } = await db
    .from("ia_trajetorias")
    .select(COLS)
    .eq("user_id", userId)
    .order("trades", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => norm(r as Record<string, unknown>));
}
