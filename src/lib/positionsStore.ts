import { supabase } from "@/integrations/supabase/client";
import type { SimPosition } from "@/lib/positions";

/** Posições simuladas persistidas (o que o utilizador realmente "detém"). */
export async function loadPositions(userId: string): Promise<SimPosition[]> {
  const { data, error } = await supabase
    .from("sim_positions")
    .select(
      "id,symbol,coin_id,quantity,avg_entry_price,invested,peak_price,entry_pattern_key,entry_pattern_desc,entry_confidence,opened_at,trajectory,tp_cap_pct,trajectory_note",
    )
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    coin_id: r.coin_id,
    quantity: Number(r.quantity),
    avg_entry_price: Number(r.avg_entry_price),
    invested: Number(r.invested),
    peak_price: Number(r.peak_price),
    entry_pattern_key: r.entry_pattern_key,
    entry_pattern_desc: r.entry_pattern_desc,
    entry_confidence: Number(r.entry_confidence),
    opened_at: r.opened_at,
    trajectory: r.trajectory,
    tp_cap_pct: r.tp_cap_pct == null ? null : Number(r.tp_cap_pct),
    trajectory_note: r.trajectory_note,
  }));
}

export async function savePosition(userId: string, pos: SimPosition): Promise<SimPosition> {
  const { data, error } = await supabase
    .from("sim_positions")
    .upsert(
      {
        user_id: userId,
        symbol: pos.symbol,
        coin_id: pos.coin_id,
        quantity: pos.quantity,
        avg_entry_price: pos.avg_entry_price,
        invested: pos.invested,
        peak_price: pos.peak_price,
        entry_pattern_key: pos.entry_pattern_key,
        entry_pattern_desc: pos.entry_pattern_desc,
        entry_confidence: pos.entry_confidence,
        ...(pos.tp_cap_pct !== undefined ? { tp_cap_pct: pos.tp_cap_pct } : {}),
        ...(pos.trajectory_note !== undefined ? { trajectory_note: pos.trajectory_note } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,symbol" },
    )
    .select("id,opened_at,trajectory")
    .maybeSingle();
  if (error) throw error;
  return {
    ...pos,
    id: data?.id ?? pos.id,
    opened_at: data?.opened_at ?? pos.opened_at ?? null,
    trajectory: data?.trajectory ?? pos.trajectory ?? [],
  };
}

export async function closePosition(userId: string, symbol: string) {
  const { error } = await supabase
    .from("sim_positions")
    .delete()
    .eq("user_id", userId)
    .eq("symbol", symbol);
  if (error) throw error;
}

/** Atualiza apenas o pico de preço (usado pelo trailing stop). */
export async function savePeak(userId: string, symbol: string, peak: number) {
  await supabase
    .from("sim_positions")
    .update({ peak_price: peak, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("symbol", symbol);
}
