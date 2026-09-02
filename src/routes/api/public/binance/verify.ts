import { createFileRoute } from "@tanstack/react-router";

type VerifyResult =
  | { ok: true; balance: { totalUsdt: number; canTrade: boolean; canWithdraw: boolean; assets: { asset: string; free: number; locked: number }[] } }
  | { ok: false; error: string };

const json = (body: VerifyResult, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/binance/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authorization = request.headers.get("authorization") ?? "";
          const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
          if (!token) return json({ ok: false, error: "Sessão expirada. Entra novamente na conta." }, 401);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
          const userId = auth.user?.id;
          if (authError || !userId) {
            return json({ ok: false, error: "Sessão expirada. Entra novamente na conta." }, 401);
          }

          const { fetchBalance, loadCredentials } = await import("@/lib/exchange.server");
          const credentials = await loadCredentials(userId);
          if (!credentials) return json({ ok: false, error: "Ainda não há chaves guardadas." });

          const now = new Date().toISOString();
          try {
            const balance = await fetchBalance(credentials);
            const { error } = await supabaseAdmin
              .from("exchange_connections")
              .update({
                verified_at: now,
                last_balance: balance.totalUsdt,
                last_verify_error: null,
                updated_at: now,
              })
              .eq("user_id", userId);
            if (error) throw new Error("Não foi possível guardar o resultado da verificação.");
            return json({ ok: true, balance });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Falha na verificação da Binance.";
            await supabaseAdmin
              .from("exchange_connections")
              .update({
                verified_at: null,
                last_verify_error: message.slice(0, 300),
                real_trading_enabled: false,
                updated_at: now,
              })
              .eq("user_id", userId);
            return json({ ok: false, error: message });
          }
        } catch (error) {
          console.error("[binance-verify]", error);
          return json({ ok: false, error: "O servidor não conseguiu concluir a verificação. Tenta novamente." }, 500);
        }
      },
    },
  },
});