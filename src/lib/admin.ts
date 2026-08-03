import { supabase } from "@/integrations/supabase/client";

export const SUPER_ADMIN_EMAIL = "vitormiguel19984553@gmail.com";

/** Confirma no servidor (via RLS) se o utilizador atual tem papel de admin. */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export type PlanTier = "normal" | "plus" | "pro_max" | "enterprise";

export const planLabels: Record<PlanTier, string> = {
  normal: "Normal",
  plus: "Plus",
  pro_max: "Pro Max",
  enterprise: "Enterprise",
};

export type PlatformUser = {
  id: string;
  name: string;
  plan: PlanTier;
  isActive: boolean;
  available: number;
  invested: number;
  trades: number;
  wins: number;
  pnl: number;
  sharpe: number;
  minConfidence: number;
  autoRun: boolean;
  isAdmin: boolean;
  createdAt: string;
};

export type PlatformSettings = {
  max_loss_trade: number;
  max_loss_day: number;
};

export async function loadPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("max_loss_trade,max_loss_day")
    .maybeSingle();
  if (error) throw error;
  return {
    max_loss_trade: Number(data?.max_loss_trade ?? 50),
    max_loss_day: Number(data?.max_loss_day ?? 200),
  };
}

export async function savePlatformSettings(next: PlatformSettings): Promise<void> {
  const { error } = await supabase
    .from("platform_settings")
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw error;
}

export async function setUserPlan(userId: string, plan: PlanTier): Promise<void> {
  const { error } = await supabase.from("profiles").update({ plan }).eq("id", userId);
  if (error) throw error;
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) throw error;
}

export type PlatformOverview = {
  users: PlatformUser[];
  totals: {
    users: number;
    trades: number;
    volume: number;
    pnl: number;
    winRate: number;
    balance: number;
    activeBots: number;
  };
  recentTrades: {
    id: string;
    userId: string;
    symbol: string;
    action: string;
    amount: number;
    pnl: number;
    confidence: number;
    createdAt: string;
  }[];
};

/** Agrega as métricas globais da plataforma (só devolve dados a admins, por RLS). */
export async function loadPlatformOverview(): Promise<PlatformOverview> {
  const [profiles, wallets, settings, strategies, trades, roles] = await Promise.all([
    supabase.from("profiles").select("id,display_name,created_at,plan,is_active"),
    supabase.from("wallets").select("user_id,available,invested"),
    supabase.from("bot_settings").select("user_id,auto_run"),
    supabase.from("strategy_state").select("user_id,trades,wins,total_pnl,sharpe,min_confidence"),
    supabase
      .from("trades")
      .select("id,user_id,symbol,action,amount,pnl,confidence,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("user_roles").select("user_id,role"),
  ]);

  const walletMap = new Map((wallets.data ?? []).map((w) => [w.user_id, w]));
  const settingMap = new Map((settings.data ?? []).map((s) => [s.user_id, s]));
  const strategyMap = new Map((strategies.data ?? []).map((s) => [s.user_id, s]));
  const adminSet = new Set(
    (roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
  );
  const allTrades = trades.data ?? [];

  const users: PlatformUser[] = (profiles.data ?? []).map((p) => {
    const w = walletMap.get(p.id);
    const st = strategyMap.get(p.id);
    return {
      id: p.id,
      name: p.display_name ?? "sem nome",
      plan: (p.plan ?? "normal") as PlanTier,
      isActive: p.is_active !== false,
      available: Number(w?.available ?? 0),
      invested: Number(w?.invested ?? 0),
      trades: st?.trades ?? 0,
      wins: st?.wins ?? 0,
      pnl: Number(st?.total_pnl ?? 0),
      sharpe: Number(st?.sharpe ?? 0),
      minConfidence: Number(st?.min_confidence ?? 0),
      autoRun: Boolean(settingMap.get(p.id)?.auto_run),
      isAdmin: adminSet.has(p.id),
      createdAt: p.created_at,
    };
  });

  const totalTrades = users.reduce((a, u) => a + u.trades, 0);
  const totalWins = users.reduce((a, u) => a + u.wins, 0);

  return {
    users: users.sort((a, b) => b.pnl - a.pnl),
    totals: {
      users: users.length,
      trades: totalTrades,
      volume: Number(allTrades.reduce((a, t) => a + Number(t.amount), 0).toFixed(2)),
      pnl: Number(users.reduce((a, u) => a + u.pnl, 0).toFixed(2)),
      winRate: totalTrades ? Number(((totalWins / totalTrades) * 100).toFixed(1)) : 0,
      balance: Number(users.reduce((a, u) => a + u.available + u.invested, 0).toFixed(2)),
      activeBots: users.filter((u) => u.autoRun).length,
    },
    recentTrades: allTrades.slice(0, 40).map((t) => ({
      id: t.id,
      userId: t.user_id,
      symbol: t.symbol,
      action: t.action,
      amount: Number(t.amount),
      pnl: Number(t.pnl),
      confidence: t.confidence,
      createdAt: t.created_at,
    })),
  };
}
