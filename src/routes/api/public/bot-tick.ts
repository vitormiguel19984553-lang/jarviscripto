import { createFileRoute } from "@tanstack/react-router";
import { analyse, fetchMarkets, type Coin } from "@/lib/market";

/**
 * Executa um "tick" da automação no servidor para todos os utilizadores com o
 * bot ligado. Deve ser chamado por um agendador (pg_cron) com o header
 * `x-bot-secret`.
 */
export const Route = createFileRoute("/api/public/bot-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-bot-secret");
        if (!provided) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let allowed = provided === process.env.BOT_TICK_SECRET;
        if (!allowed) {
          const { data: cfg } = await supabaseAdmin
            .from("bot_cron_config")
            .select("token")
            .maybeSingle();
          allowed = !!cfg?.token && provided === cfg.token;
        }
        if (!allowed) return new Response("Unauthorized", { status: 401 });

        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);


        const { data: rows, error } = await supabaseAdmin
          .from("bot_settings")
          .select("*")
          .eq("auto_run", true)
          .gt("run_until", nowIso);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!rows?.length) return Response.json({ processed: 0 });

        let coins: Coin[] = [];
        try {
          coins = await fetchMarkets();
        } catch {
          return Response.json({ error: "market_unavailable" }, { status: 502 });
        }

        let processed = 0;

        for (const s of rows) {
          const selected: string[] = s.selected_coins ?? [];
          const pool = coins.filter((c) => selected.includes(c.id));
          if (!pool.length) continue;

          const coin = pool[Math.floor(Math.random() * pool.length)];
          const signal = analyse(coin);
          if (signal.action === "AGUARDAR") {
            await supabaseAdmin
              .from("bot_settings")
              .update({ last_tick_at: nowIso })
              .eq("user_id", s.user_id);
            continue;
          }

          const minTrade = Number(s.min_trade);
          const maxLossTrade = Number(s.max_loss_trade);
          const maxLossDay = Number(s.max_loss_day);
          const dayLoss = s.day_loss_date === today ? Number(s.day_loss) : 0;

          const amount = Math.max(minTrade, Math.round(minTrade * (1 + Math.random() * 3)));
          const win = Math.random() * 100 < signal.confidence;
          const raw = win
            ? amount * (0.004 + Math.random() * 0.03)
            : -amount * (0.004 + Math.random() * 0.03);
          const pnl = Number(Math.max(-maxLossTrade, raw).toFixed(2));

          const { data: prefs } = await supabaseAdmin
            .from("alert_settings")
            .select("on_trade,on_risk_halt,min_pnl")
            .eq("user_id", s.user_id)
            .maybeSingle();

          if (pnl < 0 && dayLoss + Math.abs(pnl) > maxLossDay) {
            await supabaseAdmin
              .from("bot_settings")
              .update({ auto_run: false, last_tick_at: nowIso })
              .eq("user_id", s.user_id);
            if (prefs?.on_risk_halt !== false) {
              await supabaseAdmin.from("alerts").insert({
                user_id: s.user_id,
                kind: "risk_halt",
                title: "Automação no servidor parada — limite diário",
                body: `A perda do dia aproximou-se do limite de ${maxLossDay}€. O Jarvis desligou a automação por segurança.`,
              });
            }
            processed++;
            continue;
          }

          const action = signal.action === "COMPRAR" ? "COMPRA" : "VENDA";

          await supabaseAdmin.from("trades").insert({
            user_id: s.user_id,
            symbol: coin.symbol.toUpperCase(),
            action,
            amount,
            pnl,
            confidence: signal.confidence,
            reason: signal.reason,
          });

          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("available,invested")
            .eq("user_id", s.user_id)
            .maybeSingle();
          if (wallet) {
            await supabaseAdmin
              .from("wallets")
              .update({
                invested: Number((Number(wallet.invested) + pnl).toFixed(2)),
                updated_at: nowIso,
              })
              .eq("user_id", s.user_id);
          }

          await supabaseAdmin
            .from("bot_settings")
            .update({
              last_tick_at: nowIso,
              day_loss: pnl < 0 ? Number((dayLoss + Math.abs(pnl)).toFixed(2)) : dayLoss,
              day_loss_date: today,
            })
            .eq("user_id", s.user_id);

          if (prefs?.on_trade !== false && Math.abs(pnl) >= Number(prefs?.min_pnl ?? 5)) {
            await supabaseAdmin.from("alerts").insert({
              user_id: s.user_id,
              kind: "trade",
              title: `${action} ${coin.symbol.toUpperCase()} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}€ (servidor)`,
              body: `Ordem simulada de ${amount}€ com confiança ${signal.confidence}%. ${signal.reason}`,
            });
          }

          processed++;
        }

        return Response.json({ processed });
      },
    },
  },
});
