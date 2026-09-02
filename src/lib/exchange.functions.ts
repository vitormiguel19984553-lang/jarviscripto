import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Ligação não-custodial à Binance. As chaves do utilizador entram uma única
 * vez, são cifradas no servidor e nunca voltam ao frontend (só a máscara).
 */

const keysSchema = z.object({
  apiKey: z.string().trim().min(16).max(200),
  apiSecret: z.string().trim().min(16).max(200),
});

export const saveExchangeKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => keysSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { encryptSecret, maskKey } = await import("@/lib/exchange.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [api_key_cipher, api_secret_cipher] = await Promise.all([
      encryptSecret(data.apiKey),
      encryptSecret(data.apiSecret),
    ]);

    const now = new Date().toISOString();
    const secret = await supabaseAdmin
      .from("exchange_secrets")
      .upsert({ user_id: userId, api_key_cipher, api_secret_cipher, updated_at: now });
    if (secret.error) throw new Error(secret.error.message);

    // Guardar chaves novas invalida sempre a verificação e o modo real.
    const conn = await supabaseAdmin.from("exchange_connections").upsert({
      user_id: userId,
      exchange: "binance",
      key_masked: maskKey(data.apiKey),
      verified_at: null,
      last_balance: null,
      last_verify_error: null,
      real_trading_enabled: false,
      updated_at: now,
    });
    if (conn.error) throw new Error(conn.error.message);
    await supabaseAdmin.from("bot_settings").update({ real_mode: false }).eq("user_id", userId);

    return { masked: maskKey(data.apiKey) };
  });

/** Passo só de leitura: busca o saldo real para o utilizador o ver primeiro. */
export const verifyExchangeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { fetchBalance, loadCredentials } = await import("@/lib/exchange.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const creds = await loadCredentials(userId);
    if (!creds) throw new Error("Ainda não há chaves guardadas.");

    try {
      const balance = await fetchBalance(creds);
      await supabaseAdmin
        .from("exchange_connections")
        .update({
          verified_at: new Date().toISOString(),
          last_balance: balance.totalUsdt,
          last_verify_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      return { ok: true as const, balance };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha na verificação";
      await supabaseAdmin
        .from("exchange_connections")
        .update({
          verified_at: null,
          last_verify_error: message.slice(0, 300),
          real_trading_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      throw new Error(message);
    }
  });

/** Liga/desliga o modo real — só depois de KYC, aviso de risco e verificação. */
export const setRealTrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.enabled) {
      const [{ data: profile }, { data: conn }] = await Promise.all([
        supabase
          .from("profiles")
          .select("kyc_status,phone_verified,risk_accepted_at")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("exchange_connections")
          .select("verified_at,last_balance")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (profile?.kyc_status !== "verificado" || !profile?.phone_verified) {
        throw new Error("Conclui primeiro a verificação de identidade (KYC-lite).");
      }
      if (!profile?.risk_accepted_at) throw new Error("Tens de aceitar o aviso de risco.");
      if (!conn?.verified_at) {
        throw new Error("Faz primeiro a verificação de leitura e confirma o teu saldo real.");
      }

      const { data: restrictions } = await supabase
        .from("user_restrictions")
        .select("kind")
        .eq("user_id", userId)
        .eq("active", true);
      if ((restrictions ?? []).length) {
        throw new Error("A tua conta tem restrições ativas. Contacta o suporte.");
      }
    }

    const now = new Date().toISOString();
    const conn = await supabaseAdmin
      .from("exchange_connections")
      .update({ real_trading_enabled: data.enabled, updated_at: now })
      .eq("user_id", userId);
    if (conn.error) throw new Error(conn.error.message);
    await supabaseAdmin
      .from("bot_settings")
      .update({ real_mode: data.enabled })
      .eq("user_id", userId);

    return { enabled: data.enabled };
  });

export const disconnectExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("exchange_secrets").delete().eq("user_id", userId);
    await supabaseAdmin.from("exchange_connections").delete().eq("user_id", userId);
    await supabaseAdmin.from("bot_settings").update({ real_mode: false }).eq("user_id", userId);
    return { ok: true };
  });
