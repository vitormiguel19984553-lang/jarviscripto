import { createFileRoute } from "@tanstack/react-router";
import { analyse, type Coin } from "@/lib/market";
import { fetchMarketsFromSource } from "@/lib/market-source";
import { applyOutcome, emptyRow, patternFor, reviseConfidence, type MemoryRow } from "@/lib/brain";
import { limitsFor } from "@/lib/plans";
import { simulateProtectedTrade, exitLabels } from "@/lib/protection";
import {
  nextMinConfidence,
  nextWeight,
  sharpeRatio,
  sizeForWeight,
  thresholdForSymbol,
} from "@/lib/learning";
import type { Opinion } from "@/lib/second-opinion.server";
import {
  amountWithAggression,
  instantLearningPenalty,
  passesAggression,
  thresholdWithAggression,
} from "@/lib/aggression";

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

        let coins: Coin[] = [];
        try {
          coins = await fetchMarketsFromSource();
        } catch {
          return Response.json({ error: "market_unavailable" }, { status: 502 });
        }
        const priceById = new Map(coins.map((c) => [c.id, c]));

        // ── Alertas de preço da watchlist ───────────────────────────────────
        let priceAlertsFired = 0;
        const { data: pAlerts } = await supabaseAdmin
          .from("price_alerts")
          .select("id,user_id,symbol,direction,target_price")
          .eq("active", true);
        for (const a of pAlerts ?? []) {
          const coin = priceById.get(a.symbol);
          if (!coin) continue;
          const target = Number(a.target_price);
          const hit =
            a.direction === "below" ? coin.current_price <= target : coin.current_price >= target;
          if (!hit) continue;
          await Promise.all([
            supabaseAdmin
              .from("price_alerts")
              .update({ active: false, last_triggered_at: nowIso })
              .eq("id", a.id),
            supabaseAdmin.from("alerts").insert({
              user_id: a.user_id,
              kind: "price_alert",
              title: `${coin.symbol.toUpperCase()} ${a.direction === "below" ? "abaixo" : "acima"} de ${target}€`,
              body: `O preço de ${coin.name} está em ${coin.current_price.toFixed(4)}€ e cumpriu o teu alerta (${
                a.direction === "below" ? "descer abaixo" : "subir acima"
              } de ${target}€).`,
            }),
          ]);
          priceAlertsFired++;
        }

        const { data: rows, error } = await supabaseAdmin
          .from("bot_settings")
          .select("*")
          .eq("auto_run", true)
          .gt("run_until", nowIso);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!rows?.length) return Response.json({ processed: 0, priceAlertsFired });

        // Contas desativadas pelo admin não operam.
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id,is_active,plan")
          .in(
            "id",
            rows.map((r) => r.user_id),
          );
        const inactive = new Set(
          (profiles ?? []).filter((p) => p.is_active === false).map((p) => p.id),
        );
        const planById = new Map((profiles ?? []).map((p) => [p.id, p.plan]));

        // Limites globais de risco definidos pelo admin.
        const { data: platform } = await supabaseAdmin
          .from("platform_settings")
          .select("max_loss_trade,max_loss_day,emergency_stop")
          .maybeSingle();

        // Paragem de emergência global: desliga toda a automação e sai.
        if (platform?.emergency_stop) {
          await supabaseAdmin
            .from("bot_settings")
            .update({ auto_run: false, last_tick_at: nowIso })
            .eq("auto_run", true);
          return Response.json({ processed: 0, emergency_stop: true });
        }
        const globalMaxLossTrade = Number(platform?.max_loss_trade ?? Number.MAX_SAFE_INTEGER);
        const globalMaxLossDay = Number(platform?.max_loss_day ?? Number.MAX_SAFE_INTEGER);

        let processed = 0;

        for (const s of rows) {
          if (inactive.has(s.user_id)) continue;
          const limits = limitsFor(planById.get(s.user_id));
          // O plano do utilizador limita quantas moedas a automação vigia.
          const selected: string[] = (s.selected_coins ?? []).slice(0, limits.maxCoins);
          const pool = coins.filter((c) => selected.includes(c.id));
          if (!pool.length) continue;

          const coin = pool[Math.floor(Math.random() * pool.length)];
          const signal = analyse(coin);
          const aggression = (s as { aggression?: string }).aggression ?? "moderado";
          if (signal.action === "AGUARDAR" || !passesAggression(signal, aggression)) {
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

          const threshold = thresholdWithAggression(
            thresholdForSymbol(learn.min_confidence, sym.weight),
            aggression,
          );
          if (signal.confidence < threshold) {
            await supabaseAdmin
              .from("bot_settings")
              .update({ last_tick_at: nowIso })
              .eq("user_id", s.user_id);
            continue;
          }

          // ── Cérebro da IA: memória de padrões ─────────────────────────────
          const pattern = patternFor(signal, coin);
          const [{ data: memOwn }, { data: memGlobal }] = await Promise.all([
            supabaseAdmin
              .from("ia_memoria")
              .select("pattern_key,description,trades,wins,losses,total_pnl,confidence_penalty")
              .eq("user_id", s.user_id)
              .eq("pattern_key", pattern.key)
              .maybeSingle(),
            supabaseAdmin
              .from("ia_memoria_global")
              .select("pattern_key,description,trades,wins,losses,total_pnl,confidence_penalty")
              .eq("pattern_key", pattern.key)
              .maybeSingle(),
          ]);
          const asRow = (r: typeof memOwn): MemoryRow | null =>
            r
              ? {
                  pattern_key: r.pattern_key,
                  description: r.description,
                  trades: r.trades,
                  wins: r.wins,
                  losses: r.losses,
                  total_pnl: Number(r.total_pnl),
                  confidence_penalty: Number(r.confidence_penalty),
                }
              : null;
          const ownRow = asRow(memOwn);
          const revised = reviseConfidence(
            signal.confidence,
            ownRow,
            asRow(memGlobal as typeof memOwn),
          );
          let confidence = revised.confidence;
          const memoryNote = revised.note;
          if (confidence < threshold) {
            await supabaseAdmin.from("ia_pareceres").insert({
              user_id: s.user_id,
              symbol,
              model: "memoria-ia",
              verdict: "evitado",
              rationale: `Entrada evitada — ${memoryNote}.`,
              confidence_before: signal.confidence,
              confidence_after: confidence,
            });
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
          let amount = amountWithAggression(sizeForWeight(baseAmount, sym.weight), aggression);

          // ── Segunda opinião entre IAs (planos Pro Max e Enterprise) ───────
          let opinion: Opinion = {
            model: "sem-revisao",
            verdict: "sem_revisao",
            rationale: "Segunda opinião disponível nos planos Pro Max e Enterprise.",
          };
          const aiKey = process.env.LOVABLE_API_KEY;
          if (limits.secondOpinion && aiKey) {
            const { secondOpinion, applyVerdict } = await import("@/lib/second-opinion.server");
            opinion = await secondOpinion({
              apiKey: aiKey,
              symbol,
              action: signal.action,
              confidence,
              reason: signal.reason,
              memoryNote,
            });
            const effect = applyVerdict(opinion.verdict, amount, confidence);
            if (effect.requiredConfidence > 0 && confidence < effect.requiredConfidence) {
              await supabaseAdmin.from("ia_pareceres").insert({
                user_id: s.user_id,
                symbol,
                model: opinion.model,
                verdict: opinion.verdict,
                rationale: `${opinion.rationale} (entrada travada pela revisão cruzada)`,
                opinions: opinion.opinions ?? [],
                confidence_before: signal.confidence,
                confidence_after: confidence,
              });
              await supabaseAdmin
                .from("bot_settings")
                .update({ last_tick_at: nowIso })
                .eq("user_id", s.user_id);
              continue;
            }
            amount = effect.amount;
          }
          const sim = simulateProtectedTrade(
            amount,
            confidence / 100,
            {
              takeProfitPct: Number(s.take_profit_pct ?? 2.5),
              stopLossPct: Number(s.stop_loss_pct ?? 1.5),
              trailingStopPct: Number(s.trailing_stop_pct ?? 1),
            },
            Math.max(
              0.2,
              Math.min(1.5, Math.abs(coin.price_change_percentage_24h ?? 0) / 6 || 0.6),
            ),
          );
          const pnl = Number(Math.max(-maxLossTrade, sim.pnl).toFixed(2));
          const exitReason =
            `${signal.reason} · saída por ${exitLabels[sim.exit]} (${sim.movePct}%)` +
            (memoryNote ? ` · ${memoryNote}` : "") +
            (opinion.verdict !== "sem_revisao" ? ` · 2ª IA: ${opinion.verdict}` : "");

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

          const { data: tradeRow } = await supabaseAdmin
            .from("trades")
            .insert({
              user_id: s.user_id,
              symbol,
              action,
              amount,
              pnl,
              confidence,
              reason: exitReason,
            })
            .select("id")
            .maybeSingle();

          // Registar o parecer da segunda IA (ou a ausência dele) neste trade.
          await supabaseAdmin.from("ia_pareceres").insert({
            user_id: s.user_id,
            trade_id: tradeRow?.id ?? null,
            symbol,
            model: opinion.model,
            verdict: opinion.verdict,
            rationale: opinion.rationale,
            opinions: opinion.opinions ?? [],
            confidence_before: signal.confidence,
            confidence_after: confidence,
          });

          // Memória da IA: guardar o resultado deste padrão (pessoal + agregado).
          const nextMem = applyOutcome(ownRow ?? emptyRow(pattern), pnl);
          const globalRow = asRow(memGlobal as typeof memOwn);
          const nextGlobal = applyOutcome(globalRow ?? emptyRow(pattern), pnl);
          await Promise.all([
            supabaseAdmin.from("ia_memoria").upsert(
              {
                user_id: s.user_id,
                pattern_key: nextMem.pattern_key,
                description: nextMem.description || pattern.description,
                trades: nextMem.trades,
                wins: nextMem.wins,
                losses: nextMem.losses,
                total_pnl: nextMem.total_pnl,
                confidence_penalty: nextMem.confidence_penalty,
                last_seen_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "user_id,pattern_key" },
            ),
            supabaseAdmin.from("ia_memoria_global").upsert(
              {
                pattern_key: nextGlobal.pattern_key,
                description: nextGlobal.description || pattern.description,
                trades: nextGlobal.trades,
                wins: nextGlobal.wins,
                losses: nextGlobal.losses,
                total_pnl: nextGlobal.total_pnl,
                confidence_penalty: nextGlobal.confidence_penalty,
                last_seen_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "pattern_key" },
            ),
          ]);

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
          const minConfidence = Math.min(
            90,
            nextMinConfidence(learn.min_confidence, {
              trades: lTrades,
              wins: lWins,
              sharpe,
            }) + instantLearningPenalty(aggression, pnl),
          );
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
              body: `Ordem simulada de ${amount}€ com confiança ${confidence}%. ${exitReason}`,
            });
          }

          processed++;
        }

        return Response.json({ processed });
      },
    },
  },
});
