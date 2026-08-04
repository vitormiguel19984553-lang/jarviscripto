import { supabase } from "@/integrations/supabase/client";

export type WatchRow = {
  id: string;
  symbol: string;
  position: number;
};

export type PriceAlertRow = {
  id: string;
  symbol: string;
  direction: "above" | "below";
  target_price: number;
  active: boolean;
  last_triggered_at: string | null;
  created_at: string;
};

export async function listWatchlist(userId: string): Promise<WatchRow[]> {
  const { data, error } = await supabase
    .from("watchlist")
    .select("id,symbol,position")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addToWatchlist(userId: string, symbol: string, position = 0) {
  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: userId, symbol, position }, { onConflict: "user_id,symbol" });
  if (error) throw error;
}

export async function removeFromWatchlist(userId: string, symbol: string) {
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("symbol", symbol);
  if (error) throw error;
}

export async function listPriceAlerts(userId: string): Promise<PriceAlertRow[]> {
  const { data, error } = await supabase
    .from("price_alerts")
    .select("id,symbol,direction,target_price,active,last_triggered_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    direction: r.direction === "below" ? "below" : "above",
    target_price: Number(r.target_price),
  }));
}

export async function createPriceAlert(args: {
  userId: string;
  symbol: string;
  direction: "above" | "below";
  targetPrice: number;
}) {
  const { error } = await supabase.from("price_alerts").insert({
    user_id: args.userId,
    symbol: args.symbol,
    direction: args.direction,
    target_price: args.targetPrice,
  });
  if (error) throw error;
}

export async function setPriceAlertActive(id: string, active: boolean) {
  const { error } = await supabase.from("price_alerts").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function deletePriceAlert(id: string) {
  const { error } = await supabase.from("price_alerts").delete().eq("id", id);
  if (error) throw error;
}

/** Verdadeiro quando o preço atual satisfaz a condição do alerta. */
export function isPriceAlertHit(
  alert: Pick<PriceAlertRow, "direction" | "target_price">,
  price: number,
) {
  return alert.direction === "above" ? price >= alert.target_price : price <= alert.target_price;
}

export const directionLabels: Record<"above" | "below", string> = {
  above: "subir acima de",
  below: "descer abaixo de",
};
