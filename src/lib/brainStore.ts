import { supabase } from "@/integrations/supabase/client";
import { applyOutcome, emptyRow, type MemoryRow, type Pattern } from "@/lib/brain";

/** Leitura da memória do utilizador + camada agregada anónima. */
export async function loadPatternMemory(
  userId: string,
  pattern: Pattern,
): Promise<{ own: MemoryRow | null; global: MemoryRow | null }> {
  const [own, global] = await Promise.all([
    supabase
      .from("ia_memoria")
      .select("pattern_key,description,trades,wins,losses,total_pnl,confidence_penalty")
      .eq("user_id", userId)
      .eq("pattern_key", pattern.key)
      .maybeSingle(),
    supabase
      .from("ia_memoria_global")
      .select("pattern_key,description,trades,wins,losses,total_pnl,confidence_penalty")
      .eq("pattern_key", pattern.key)
      .maybeSingle(),
  ]);

  const norm = (r: typeof own.data): MemoryRow | null =>
    r
      ? {
          pattern_key: r.pattern_key,
          description: r.description,
          trades: r.trades,
          wins: r.wins,
          losses: r.losses,
          total_pnl: Number(r.total_pnl),
          confidence_penalty: Number(r.confidence_penalty),
        }
      : null;

  return { own: norm(own.data), global: norm(global.data as typeof own.data) };
}

/** Grava o resultado no padrão (memória pessoal). */
export async function recordPattern(
  userId: string,
  pattern: Pattern,
  current: MemoryRow | null,
  pnl: number,
): Promise<MemoryRow> {
  const next = applyOutcome(current ?? emptyRow(pattern), pnl);
  await supabase.from("ia_memoria").upsert(
    {
      user_id: userId,
      pattern_key: next.pattern_key,
      description: next.description || pattern.description,
      trades: next.trades,
      wins: next.wins,
      losses: next.losses,
      total_pnl: next.total_pnl,
      confidence_penalty: next.confidence_penalty,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,pattern_key" },
  );
  return next;
}

/** Padrões com pior histórico — usados no chat e no painel de aprendizagem. */
export async function topRiskPatterns(userId: string, limit = 5) {
  const { data } = await supabase
    .from("ia_memoria")
    .select("pattern_key,description,trades,wins,losses,total_pnl,confidence_penalty")
    .eq("user_id", userId)
    .gte("trades", 3)
    .order("total_pnl", { ascending: true })
    .limit(limit);
  return (data ?? []).map((r) => ({
    ...r,
    total_pnl: Number(r.total_pnl),
    confidence_penalty: Number(r.confidence_penalty),
  }));
}
