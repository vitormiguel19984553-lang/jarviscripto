import { createFileRoute } from "@tanstack/react-router";
import { analyse, fetchMarkets, type Coin } from "@/lib/market";
import {
  nextMinConfidence,
  nextWeight,
  sharpeRatio,
  sizeForWeight,
  thresholdForSymbol,
} from "@/lib/learning";

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

        // Contas desativadas pelo admin não operam.
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id,is_active")
          .in(
            "id",
            rows.map((r) => r.user_id),
          );
        const inactive = new Set(
          (profiles ?? []).filter((p) => p.is_active === false).map((p) => p.id),
        );

        // Limites globais de risco definidos pelo admin.
        const { data: platform } = await supabaseAdmin
          .from("platform_settings")
          .select("max_loss_trade,max_loss_day")
          .maybeSingle();
        const globalMaxLossTrade = Number(platform?.max_loss_trade ?? Number.MAX_SAFE_INTEGER);
        const globalMaxLossDay = Number(platform?.max_loss_day ?? Number.MAX_SAFE_INTEGER);

        let coins: Coin[] = [];
        try {
          coins = await fetchMarkets();
        } catch {
          return Response.json({ error: "market_unavailable" }, { status: 502 });
        }

        let processed = 0;

        for (const s of rows) {
          if (inactive.has(s.user_id)) continue;
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

          const symbol = coin.symbol.toUpperCase();

          // Estado de auto-aprendizagem deste utilizador
          const [{ data: strat }, { data: stat }] = await Promise.all([
            supabaseAdmin
              .from("strategy_state")
              .select("min_confidence,trades,wins,losses,total_pnl,sharpe,last_adjust_at")
              .eq("user_id", s.user_id)
              .maybeSingle(),
            supabaseAdmin
              .from("strategy_symbol_stats")
              .select("trades,wins,total_pnl,weight")
              .eq("user_id", s.user_id)
              .eq("symbol", symbol)
              .maybeSingle(),
          ]);
          const learn = {
            min_confidence: Number(strat?.min_confidence ?? 55),
            trades: strat?.trades ?? 0,
            wins: strat?.wins ?? 0,
            losses: strat?.losses ?? 0,
            total_pnl: Number(strat?.total_pnl ?? 0),
          };
          const sym = {
            trades: stat?.trades ?? 0,
            wins: stat?.wins ?? 0,
            total_pnl: Number(stat?.total_pnl ?? 0),
            weight: Number(stat?.weight ?? 1),
          };

          if (signal.confidence < thresholdForSymbol(learn.min_confidence, sym.weight)) {
            await supabaseAdmin
              .from("bot_settings")
              .update({ last_tick_at: nowIso })
              .eq("user_id", s.user_id);
            continue;
          }

          const minTrade = Number(s.min_trade);
          const maxLossTrade = Math.min(Number(s.max_loss_trade), globalMaxLossTrade);
          const maxLossDay = Math.min(Number(s.max_loss_day), globalMaxLossDay);
          const dayLoss = s.day_loss_date === today ? Number(s.day_loss) : 0;

          const baseAmount = Math.max(minTrade, Math.round(minTrade * (1 + Math.random() * 3)));
          const amount = sizeForWeight(baseAmount, sym.weight);
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
            symbol,
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

          // Auto-aprendizagem: registar resultado e reajustar a estratégia
          const { data: recent } = await supabaseAdmin
            .from("trades")
            .select("pnl")
            .eq("user_id", s.user_id)
            .order("created_at", { ascending: false })
            .limit(60);
          const sharpe = sharpeRatio((recent ?? []).map((t) => Number(t.pnl)));
          const lTrades = learn.trades + 1;
          const lWins = learn.wins + (pnl > 0 ? 1 : 0);
          const minConfidence = nextMinConfidence(learn.min_confidence, {
            trades: lTrades,
            wins: lWins,
            sharpe,
          });
          await Promise.all([
            supabaseAdmin.from("strategy_state").upsert(
              {
                user_id: s.user_id,
                min_confidence: minConfidence,
                trades: lTrades,
                wins: lWins,
                losses: learn.losses + (pnl <= 0 ? 1 : 0),
                total_pnl: Number((learn.total_pnl + pnl).toFixed(2)),
                sharpe,
                last_adjust_at:
                  minConfidence !== learn.min_confidence ? nowIso : (strat?.last_adjust_at ?? null),
                updated_at: nowIso,
              },
              { onConflict: "user_id" },
            ),
            supabaseAdmin.from("strategy_symbol_stats").upsert(
              {
                user_id: s.user_id,
                symbol,
                trades: sym.trades + 1,
                wins: sym.wins + (pnl > 0 ? 1 : 0),
                total_pnl: Number((sym.total_pnl + pnl).toFixed(2)),
                weight: nextWeight(sym.weight, pnl),
                updated_at: nowIso,
              },
              { onConflict: "user_id,symbol" },
            ),
          ]);

          if (prefs?.on_trade !== false && Math.abs(pnl) >= Number(prefs?.min_pnl ?? 5)) {
            await supabaseAdmin.from("alerts").insert({
              user_id: s.user_id,
              kind: "trade",
              title: `${action} ${symbol} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}€ (servidor)`,
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
