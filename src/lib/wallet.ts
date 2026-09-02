import { supabase } from "@/integrations/supabase/client";

export type RealWallet = {
  connected: boolean;
  keyMasked: string | null;
  verifiedAt: string | null;
  lastBalance: number | null;
  lastError: string | null;
  realTradingEnabled: boolean;
};

/** Estado da carteira real (conta Binance do próprio utilizador). */
export async function loadRealWallet(userId: string): Promise<RealWallet> {
  const { data } = await supabase
    .from("exchange_connections")
    .select("key_masked,verified_at,last_balance,last_verify_error,real_trading_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    connected: Boolean(data),
    keyMasked: data?.key_masked ?? null,
    verifiedAt: data?.verified_at ?? null,
    lastBalance: data?.last_balance == null ? null : Number(data.last_balance),
    lastError: data?.last_verify_error ?? null,
    realTradingEnabled: Boolean(data?.real_trading_enabled),
  };
}

export type RealBalance = {
  totalUsdt: number;
  canTrade: boolean;
  canWithdraw: boolean;
  assets: { asset: string; free: number; locked: number }[];
};

/** Relê o saldo real (só leitura) através do endpoint autenticado. */
export async function refreshRealBalance(): Promise<
  { ok: true; balance: RealBalance } | { ok: false; error: string }
> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Sessão expirada. Entra novamente na conta." };

  const res = await fetch("/api/public/binance/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    return { ok: false, error: "O servidor devolveu uma resposta inesperada. Tenta novamente." };
  }
  return (await res.json()) as { ok: true; balance: RealBalance } | { ok: false; error: string };
}
