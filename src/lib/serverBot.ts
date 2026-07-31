import { supabase } from "@/integrations/supabase/client";

export type ServerBotState = {
  auto_run: boolean;
  run_until: string | null;
  last_tick_at: string | null;
};

export async function loadServerBot(userId: string): Promise<ServerBotState> {
  const { data, error } = await supabase
    .from("bot_settings")
    .select("auto_run,run_until,last_tick_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { auto_run: false, run_until: null, last_tick_at: null };
}

export async function startServerBot(userId: string, hours: number) {
  const runUntil = new Date(Date.now() + hours * 3600_000).toISOString();
  const { error } = await supabase
    .from("bot_settings")
    .upsert(
      { user_id: userId, auto_run: true, run_until: runUntil, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export async function stopServerBot(userId: string) {
  const { error } = await supabase
    .from("bot_settings")
    .update({ auto_run: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}
