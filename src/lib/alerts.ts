import { supabase } from "@/integrations/supabase/client";

export type AlertSettings = {
  email_enabled: boolean;
  on_trade: boolean;
  on_risk_halt: boolean;
  min_pnl: number;
};

export type AlertRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export const defaultAlertSettings: AlertSettings = {
  email_enabled: false,
  on_trade: true,
  on_risk_halt: true,
  min_pnl: 5,
};

export async function loadAlertSettings(userId: string): Promise<AlertSettings> {
  const { data, error } = await supabase
    .from("alert_settings")
    .select("email_enabled,on_trade,on_risk_halt,min_pnl")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultAlertSettings;
  return { ...data, min_pnl: Number(data.min_pnl) };
}

export async function saveAlertSettings(userId: string, patch: Partial<AlertSettings>) {
  const { error } = await supabase
    .from("alert_settings")
    .upsert(
      { user_id: userId, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export async function listAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("id,kind,title,body,read,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function createAlert(args: {
  userId: string;
  kind: string;
  title: string;
  body: string;
}) {
  const { error } = await supabase.from("alerts").insert({
    user_id: args.userId,
    kind: args.kind,
    title: args.title,
    body: args.body,
  });
  if (error) throw error;
}

export async function markAllRead() {
  const { error } = await supabase.from("alerts").update({ read: true }).eq("read", false);
  if (error) throw error;
}

export async function clearAlerts() {
  const { data, error: selErr } = await supabase.from("alerts").select("id");
  if (selErr) throw selErr;
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return;
  const { error } = await supabase.from("alerts").delete().in("id", ids);
  if (error) throw error;
}
