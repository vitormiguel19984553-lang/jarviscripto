import { supabase } from "@/integrations/supabase/client";
import { loadPlanLimits } from "@/lib/planStore";

export type ServerBotState = {
  auto_run: boolean;
  run_until: string | null;
  last_tick_at: string | null;
  real_mode: boolean;
};

export async function loadServerBot(userId: string): Promise<ServerBotState> {
  const { data, error } = await supabase
    .from("bot_settings")
    .select("auto_run,run_until,last_tick_at,real_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { auto_run: false, run_until: null, last_tick_at: null, real_mode: false };
}

/** Orçamento e limites aplicados apenas ao dinheiro real (em USDT). */
export type RealBudget = {
  tradeAmount: number;
  maxLossTrade: number;
  maxLossDay: number;
};

export const REAL_BUDGET_DEFAULT: RealBudget = {
  tradeAmount: 10,
  maxLossTrade: 5,
  maxLossDay: 20,
};

export async function loadRealBudget(userId: string): Promise<RealBudget> {
  const { data, error } = await supabase
    .from("bot_settings")
    .select("real_trade_amount,real_max_loss_trade,real_max_loss_day")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return REAL_BUDGET_DEFAULT;
  return {
    tradeAmount: Number(data.real_trade_amount ?? REAL_BUDGET_DEFAULT.tradeAmount),
    maxLossTrade: Number(data.real_max_loss_trade ?? REAL_BUDGET_DEFAULT.maxLossTrade),
    maxLossDay: Number(data.real_max_loss_day ?? REAL_BUDGET_DEFAULT.maxLossDay),
  };
}

/** Guarda os limites do dinheiro real com validação defensiva. */
export async function saveRealBudget(userId: string, budget: RealBudget) {
  const tradeAmount = Math.min(5000, Math.max(5, Number(budget.tradeAmount) || 0));
  const maxLossTrade = Math.min(tradeAmount, Math.max(1, Number(budget.maxLossTrade) || 0));
  const maxLossDay = Math.min(20000, Math.max(maxLossTrade, Number(budget.maxLossDay) || 0));
  const { error } = await supabase.from("bot_settings").upsert(
    {
      user_id: userId,
      real_trade_amount: tradeAmount,
      real_max_loss_trade: maxLossTrade,
      real_max_loss_day: maxLossDay,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return { tradeAmount, maxLossTrade, maxLossDay } satisfies RealBudget;
}

/** Alterna entre dinheiro de simulação e dinheiro real na automação do servidor. */
export async function setServerRealMode(userId: string, realMode: boolean) {
  const { error } = await supabase.from("bot_settings").upsert(
    { user_id: userId, real_mode: realMode, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function startServerBot(userId: string, hours: number) {
  // O plano do utilizador define a duração máxima permitida.
  const { limits } = await loadPlanLimits(userId);
  const allowed = limits.serverHours;
  const capped = Math.min(hours, allowed[allowed.length - 1]);
  const runUntil = new Date(Date.now() + capped * 3600_000).toISOString();
  const { error } = await supabase
    .from("bot_settings")
    .upsert(
      {
        user_id: userId,
        auto_run: true,
        run_until: runUntil,
        updated_at: new Date().toISOString(),
      },
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
