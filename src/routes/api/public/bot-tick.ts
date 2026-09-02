import { createFileRoute } from "@tanstack/react-router";
import { analyse, type Coin } from "@/lib/market";
import { fetchMarketsFromSource } from "@/lib/market-source";
import {
  applyOutcome,
  emptyRow,
  patternFor,
  reviseConfidence,
  type MemoryRow,
  type Pattern,
} from "@/lib/brain";
import { limitsFor } from "@/lib/plans";
import { exitLabels } from "@/lib/protection";
import { afterBuy, closeResult, forcedExit, type SimPosition } from "@/lib/positions";
import { recentVolatility, scaleProtection } from "@/lib/risk";
import {
  nextMinConfidence,
  nextWeight,
  sharpeRatio,
  sizeForWeight,
  thresholdForSymbol,
  withUserFloor,
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

          const aggression = (s as { aggression?: string }).aggression ?? "moderado";

          // ── Modo real: saldo e credenciais lidos uma vez por tick ──────────
          // Só assim sabemos que entradas são realmente executáveis (comprar
          // exige saldo em USDT/USDC, vender exige ter a moeda em carteira).
          type RealCtx = {
            creds: Awaited<ReturnType<typeof import("@/lib/exchange.server").loadCredentials>>;
            bal: Awaited<ReturnType<typeof import("@/lib/exchange.server").fetchBalance>>;
          };
          let realCtx: RealCtx | null = null;
          let realBlock: string | null = null;
          const realAmount = Math.max(
            5,
            Number((s as { real_trade_amount?: number }).real_trade_amount ?? 10),
          );
          if (s.real_mode) {
            const { data: conn } = await supabaseAdmin
              .from("exchange_connections")
              .select("real_trading_enabled")
              .eq("user_id", s.user_id)
              .maybeSingle();
            if (!conn?.real_trading_enabled) {
              realBlock = "as operações reais não estão ativadas na página Binance";
            } else {
              try {
                const { loadCredentials, fetchBalance } = await import("@/lib/exchange.server");
                const creds = await loadCredentials(s.user_id);
                if (!creds) throw new Error("sem chaves API guardadas");
                const bal = await fetchBalance(creds);
                if (!bal.canTrade) {
                  throw new Error(
                    "a chave API não tem permissão de Spot Trading — cria uma chave com trading ativo",
                  );
                }
                realCtx = { creds, bal };
              } catch (e) {
                realBlock = e instanceof Error ? e.message : "erro ao ler a tua Binance";
              }
            }
          }
          const freeOf = (a: string) =>
            realCtx?.bal.assets.find((x) => x.asset === a.toUpperCase())?.free ?? 0;
          // Escolhe a cotação com mais saldo livre (USDT ou USDC).
          const quote = freeOf("USDC") > freeOf("USDT") ? "USDC" : "USDT";
          const freeQuote = freeOf(quote);
          // A Binance exige ~5 USDT por ordem: se o saldo livre for menor que o
          // valor configurado, usa-se o saldo disponível em vez de não operar.
          const realOrderAmount = Math.min(realAmount, Math.floor(freeQuote * 100) / 100);
          const canBuyReal = realOrderAmount >= 5;

          // ── Livro de posições (idêntico em simulação e em dinheiro real) ───
          const { data: posRows } = await supabaseAdmin
            .from("sim_positions")
            .select(
              "id,symbol,coin_id,quantity,avg_entry_price,invested,peak_price,entry_pattern_key,entry_pattern_desc,entry_confidence",
            )
            .eq("user_id", s.user_id);
          const positions: SimPosition[] = (posRows ?? []).map((p) => ({
            id: p.id,
            symbol: p.symbol,
            coin_id: p.coin_id,
            quantity: Number(p.quantity),
            avg_entry_price: Number(p.avg_entry_price),
            invested: Number(p.invested),
            peak_price: Number(p.peak_price),
            entry_pattern_key: p.entry_pattern_key,
            entry_pattern_desc: p.entry_pattern_desc,
            entry_confidence: Number(p.entry_confidence),
          }));
          const heldByCoin = new Map(positions.map((p) => [p.coin_id, p]));

          const { data: prefs } = await supabaseAdmin
            .from("alert_settings")
            .select("on_trade,on_risk_halt,min_pnl")
            .eq("user_id", s.user_id)
            .maybeSingle();

          const realBudget = {
            tradeAmount: Number((s as { real_trade_amount?: number }).real_trade_amount ?? 10),
            maxLossTrade: Number((s as { real_max_loss_trade?: number }).real_max_loss_trade ?? 5),
            maxLossDay: Number((s as { real_max_loss_day?: number }).real_max_loss_day ?? 20),
          };
          const minTrade = s.real_mode ? realBudget.tradeAmount : Number(s.min_trade);
          const maxLossDay = Math.min(
            s.real_mode ? realBudget.maxLossDay : Number(s.max_loss_day),
            globalMaxLossDay,
          );
          void globalMaxLossTrade;
          const dayLoss = s.day_loss_date === today ? Number(s.day_loss) : 0;

          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("available,invested")
            .eq("user_id", s.user_id)
            .maybeSingle();
          const simAvailable = Number(wallet?.available ?? 0);
          const simInvested = Number(wallet?.invested ?? 0);

          const baseProtection = {
            takeProfitPct: Number(s.take_profit_pct ?? 2.5),
            stopLossPct: Number(s.stop_loss_pct ?? 1.5),
            trailingStopPct: Number(s.trailing_stop_pct ?? 1),
          };

          /** Memória do cérebro (pessoal + agregada) para um padrão. */
          const asRow = (r: unknown): MemoryRow | null => {
            const x = r as MemoryRow | null;
            return x
              ? {
                  pattern_key: x.pattern_key,
                  description: x.description,
                  trades: x.trades,
                  wins: x.wins,
                  losses: x.losses,
                  total_pnl: Number(x.total_pnl),
                  confidence_penalty: Number(x.confidence_penalty),
                }
              : null;
          };
          const memoryFor = async (pattern: Pattern) => {
            const [{ data: own }, { data: glob }] = await Promise.all([
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
            return { own: asRow(own), global: asRow(glob) };
          };

          /** Aprendizagem simétrica: compras e vendas gravam no mesmo cérebro. */
          const recordMemory = async (patterns: Pattern[], pnl: number) => {
            for (const p of patterns) {
              const mem = await memoryFor(p);
              const nextOwn = applyOutcome(mem.own ?? emptyRow(p), pnl);
              const nextGlobal = applyOutcome(mem.global ?? emptyRow(p), pnl);
              await Promise.all([
                supabaseAdmin.from("ia_memoria").upsert(
                  {
                    user_id: s.user_id,
                    pattern_key: nextOwn.pattern_key,
                    description: nextOwn.description || p.description,
                    trades: nextOwn.trades,
                    wins: nextOwn.wins,
                    losses: nextOwn.losses,
                    total_pnl: nextOwn.total_pnl,
                    confidence_penalty: nextOwn.confidence_penalty,
                    last_seen_at: nowIso,
                    updated_at: nowIso,
                  },
                  { onConflict: "user_id,pattern_key" },
                ),
                supabaseAdmin.from("ia_memoria_global").upsert(
                  {
                    pattern_key: nextGlobal.pattern_key,
                    description: nextGlobal.description || p.description,
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
            }
          };

          /** Auto-aprendizagem da estratégia (só com resultados realizados). */
          const recordLearning = async (symbol: string, pnl: number) => {
            const [{ data: st }, { data: sy }, { data: recent }] = await Promise.all([
              supabaseAdmin
                .from("strategy_state")
                .select("min_confidence,trades,wins,losses,total_pnl,last_adjust_at")
                .eq("user_id", s.user_id)
                .maybeSingle(),
              supabaseAdmin
                .from("strategy_symbol_stats")
                .select("trades,wins,total_pnl,weight")
                .eq("user_id", s.user_id)
                .eq("symbol", symbol)
                .maybeSingle(),
              supabaseAdmin
                .from("trades")
                .select("pnl")
                .eq("user_id", s.user_id)
                .order("created_at", { ascending: false })
                .limit(60),
            ]);
            const sharpe = sharpeRatio((recent ?? []).map((t) => Number(t.pnl)));
            const lTrades = (st?.trades ?? 0) + 1;
            const lWins = (st?.wins ?? 0) + (pnl > 0 ? 1 : 0);
            const current = Number(st?.min_confidence ?? 55);
            const minConfidence = Math.min(
              90,
              nextMinConfidence(current, { trades: lTrades, wins: lWins, sharpe }) +
                instantLearningPenalty(aggression, pnl),
            );
            await Promise.all([
              supabaseAdmin.from("strategy_state").upsert(
                {
                  user_id: s.user_id,
                  min_confidence: minConfidence,
                  trades: lTrades,
                  wins: lWins,
                  losses: (st?.losses ?? 0) + (pnl <= 0 ? 1 : 0),
                  total_pnl: Number((Number(st?.total_pnl ?? 0) + pnl).toFixed(2)),
                  sharpe,
                  last_adjust_at:
                    minConfidence !== current ? nowIso : (st?.last_adjust_at ?? null),
                  updated_at: nowIso,
                },
                { onConflict: "user_id" },
              ),
              supabaseAdmin.from("strategy_symbol_stats").upsert(
                {
                  user_id: s.user_id,
                  symbol,
                  trades: (sy?.trades ?? 0) + 1,
                  wins: (sy?.wins ?? 0) + (pnl > 0 ? 1 : 0),
                  total_pnl: Number((Number(sy?.total_pnl ?? 0) + pnl).toFixed(2)),
                  weight: nextWeight(Number(sy?.weight ?? 1), pnl),
                  updated_at: nowIso,
                },
                { onConflict: "user_id,symbol" },
              ),
            ]);
          };

          /** Fecha a posição (ordem real ou livro simulado) e realiza o PnL. */
          const closePosition = async (args: {
            pos: SimPosition;
            coin: Coin;
            note: string;
            confidence: number;
            sellPattern: Pattern | null;
          }): Promise<boolean> => {
            const { pos, coin, note, confidence, sellPattern } = args;
            const res = closeResult(pos, coin.current_price);
            let realNote = "";
            let proceeds = res.proceeds;

            if (s.real_mode) {
              if (!realCtx?.creds) return false;
              if (freeOf(pos.symbol) <= 0) return false;
              try {
                const { placeMarketOrder } = await import("@/lib/exchange.server");
                const order = await placeMarketOrder(realCtx.creds, {
                  symbol: `${pos.symbol}${quote}`,
                  side: "SELL",
                  quoteOrderQty: Math.max(5, Math.min(res.proceeds, pos.quantity * coin.current_price)),
                });
                realNote = ` · ordem real de venda na tua Binance (#${order.orderId})`;
                proceeds = Number(
                  Math.max(5, Math.min(res.proceeds, pos.quantity * coin.current_price)).toFixed(2),
                );
              } catch (e) {
                await supabaseAdmin.from("alerts").insert({
                  user_id: s.user_id,
                  kind: "real_order_failed",
                  title: "Venda real não executada",
                  body: `${pos.symbol}: ${e instanceof Error ? e.message : "erro desconhecido"}.`,
                });
                return false;
              }
            }

            const pnl = Number((proceeds - res.investedPart).toFixed(2));
            const reason =
              `Saída de ${pos.symbol} a ${coin.current_price.toFixed(4)} (entrada média ${pos.avg_entry_price.toFixed(4)}, ${res.movePct}%) · ${note}` +
              realNote;

            await supabaseAdmin
              .from("sim_positions")
              .delete()
              .eq("user_id", s.user_id)
              .eq("symbol", pos.symbol);

            const { data: tradeRow } = await supabaseAdmin
              .from("trades")
              .insert({
                user_id: s.user_id,
                symbol: pos.symbol,
                action: "VENDA",
                amount: res.investedPart,
                pnl,
                confidence,
                reason,
              })
              .select("id")
              .maybeSingle();
            void tradeRow;

            if (!s.real_mode) {
              await supabaseAdmin
                .from("wallets")
                .update({
                  available: Number((simAvailable + proceeds).toFixed(2)),
                  invested: Number(Math.max(0, simInvested - res.investedPart).toFixed(2)),
                  updated_at: nowIso,
                })
                .eq("user_id", s.user_id);
            }

            const patterns: Pattern[] = [];
            if (pos.entry_pattern_key) {
              patterns.push({
                key: pos.entry_pattern_key,
                description: pos.entry_pattern_desc ?? pos.entry_pattern_key,
              });
            }
            if (sellPattern) patterns.push(sellPattern);
            await recordMemory(patterns, pnl);
            await recordLearning(pos.symbol, pnl);

            const nextDayLoss = pnl < 0 ? Number((dayLoss + Math.abs(pnl)).toFixed(2)) : dayLoss;
            const halt = pnl < 0 && nextDayLoss > maxLossDay;
            await supabaseAdmin
              .from("bot_settings")
              .update({
                last_tick_at: nowIso,
                day_loss: nextDayLoss,
                day_loss_date: today,
                ...(halt ? { auto_run: false } : {}),
                ...(s.real_mode ? { real_wait_reason: null, real_wait_at: nowIso } : {}),
              })
              .eq("user_id", s.user_id);

            if (halt && prefs?.on_risk_halt !== false) {
              await supabaseAdmin.from("alerts").insert({
                user_id: s.user_id,
                kind: "risk_halt",
                title: "Automação no servidor parada — limite diário",
                body: `A perda do dia atingiu o limite de ${maxLossDay}. O Jarvis desligou a automação por segurança.`,
              });
            }
            if (prefs?.on_trade !== false && Math.abs(pnl) >= Number(prefs?.min_pnl ?? 5)) {
              await supabaseAdmin.from("alerts").insert({
                user_id: s.user_id,
                kind: "trade",
                title: `VENDA ${pos.symbol} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
                body: `${s.real_mode ? "Ordem real" : "Ordem simulada"} de saída com confiança ${confidence}%. ${reason}`,
              });
            }
            return true;
          };

          // ── 1. Rede de segurança: TP / SL / trailing sobre o preço real ────
          let forcedClosed = false;
          for (const pos of positions) {
            const coin = priceById.get(pos.coin_id);
            if (!coin) continue;
            const dyn = scaleProtection(baseProtection, recentVolatility(coin));
            const forced = forcedExit(pos, coin.current_price, dyn);
            if (!forced.exit) {
              if (coin.current_price > pos.peak_price) {
                await supabaseAdmin
                  .from("sim_positions")
                  .update({ peak_price: coin.current_price, updated_at: nowIso })
                  .eq("user_id", s.user_id)
                  .eq("symbol", pos.symbol);
              }
              continue;
            }
            const done = await closePosition({
              pos,
              coin,
              note: `rede de segurança acionada: ${exitLabels[forced.exit]} (SL ${dyn.stopLossPct}% / TP ${dyn.takeProfitPct}%)`,
              confidence: pos.entry_confidence || 50,
              sellPattern: null,
            });
            if (done) {
              forcedClosed = true;
              break;
            }
          }
          if (forcedClosed) {
            processed++;
            continue;
          }

          // ── 2. Candidatos: compras e vendas no mesmo pipeline da IA ────────
          const actionable = pool
            .map((c) => ({ c, signal: analyse(c), position: heldByCoin.get(c.id) ?? null }))
            .filter(({ signal, position }) =>
              position ? signal.action === "VENDER" : signal.action === "COMPRAR",
            )
            .filter(({ signal }) => passesAggression(signal, aggression));

          const candidates = actionable.filter(({ c, position }) => {
            if (position) return s.real_mode ? freeOf(c.symbol) > 0 : true;
            return s.real_mode ? canBuyReal : simAvailable >= minTrade;
          });

          if (realBlock || !candidates.length) {
            const onlySells = actionable.length > 0 && actionable.every((a) => a.position);
            const waitReason = s.real_mode
              ? (realBlock ??
                (!canBuyReal
                  ? `Saldo real insuficiente: tens ${freeQuote.toFixed(2)} ${quote} livre e a Binance exige pelo menos 5 ${quote} por ordem.`
                  : onlySells
                    ? "O mercado só dá sinais de venda das moedas que ainda não tens compradas — a IA espera por um sinal de compra."
                    : "Nenhum sinal com confiança suficiente neste momento — a IA está a vigiar o mercado."))
              : null;

            await supabaseAdmin
              .from("bot_settings")
              .update({
                last_tick_at: nowIso,
                ...(s.real_mode ? { real_wait_reason: waitReason, real_wait_at: nowIso } : {}),
              })
              .eq("user_id", s.user_id);
            if (s.real_mode && new Date(nowIso).getUTCMinutes() % 10 === 0) {
              await supabaseAdmin.from("ia_pareceres").insert({
                user_id: s.user_id,
                symbol: "REAL",
                model: "modo-real",
                verdict: "aguardar",
                rationale: waitReason ?? "Sem entradas reais executáveis.",
              });
            }
            continue;
          }

          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          const coin = picked.c;
          const signal = picked.signal;
          const position = picked.position;
          const symbol = coin.symbol.toUpperCase();

          // ── 3. Confiança: limite aprendido + piso escolhido pelo utilizador ─
          const [{ data: strat }, { data: stat }] = await Promise.all([
            supabaseAdmin
              .from("strategy_state")
              .select("min_confidence")
              .eq("user_id", s.user_id)
              .maybeSingle(),
            supabaseAdmin
              .from("strategy_symbol_stats")
              .select("weight")
              .eq("user_id", s.user_id)
              .eq("symbol", symbol)
              .maybeSingle(),
          ]);
          const learnedConfidence = Number(strat?.min_confidence ?? 55);
          const userFloor = Number((s as { user_min_confidence?: number }).user_min_confidence ?? 55);
          const weight = Number(stat?.weight ?? 1);
          const threshold = thresholdWithAggression(
            thresholdForSymbol(withUserFloor(learnedConfidence, userFloor), weight),
            aggression,
          );
          if (signal.confidence < threshold) {
            await supabaseAdmin
              .from("bot_settings")
              .update({ last_tick_at: nowIso })
              .eq("user_id", s.user_id);
            continue;
          }

          // ── 4. Cérebro da IA: memória de padrões ──────────────────────────
          const pattern = patternFor(signal, coin);
          const mem = await memoryFor(pattern);
          const revised = reviseConfidence(signal.confidence, mem.own, mem.global);
          let confidence = revised.confidence;
          const memoryNote = revised.note;
          if (confidence < threshold) {
            await supabaseAdmin.from("ia_pareceres").insert({
              user_id: s.user_id,
              symbol,
              model: "memoria-ia",
              verdict: "evitado",
              rationale: `${position ? "Saída" : "Entrada"} evitada — ${memoryNote}.`,
              confidence_before: signal.confidence,
              confidence_after: confidence,
            });
            await supabaseAdmin
              .from("bot_settings")
              .update({ last_tick_at: nowIso })
              .eq("user_id", s.user_id);
            continue;
          }

          let amount = s.real_mode
            ? realOrderAmount
            : amountWithAggression(
                sizeForWeight(
                  Math.max(minTrade, Math.round(minTrade * (1 + Math.random() * 3))),
                  weight,
                ),
                aggression,
              );

          // ── 5. Segunda opinião entre IAs (Pro Max e Enterprise) ───────────
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
                rationale: `${opinion.rationale} (decisão travada pela revisão cruzada)`,
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
            amount = s.real_mode
              ? Math.min(realOrderAmount, Math.max(5, effect.amount))
              : effect.amount;
            confidence = Math.max(confidence, effect.requiredConfidence || confidence);
          }

          const decisionNote =
            `${signal.reason}` +
            (memoryNote ? ` · ${memoryNote}` : "") +
            (opinion.verdict !== "sem_revisao" ? ` · 2ª IA: ${opinion.verdict}` : "");

          // ── 6a. VENDA decidida pela própria IA (caminho principal) ────────
          if (position) {
            const done = await closePosition({
              pos: position,
              coin,
              note: `decisão da IA: ${decisionNote}`,
              confidence,
              sellPattern: pattern,
            });
            if (done) processed++;
            continue;
          }

          // ── 6b. COMPRA: abre posição (Binance em real, livro em simulação) ─
          let realNote = "";
          let boughtQty = 0;
          if (s.real_mode) {
            if (!realCtx?.creds) continue;
            if (freeOf(quote) < amount) continue;
            try {
              const { placeMarketOrder } = await import("@/lib/exchange.server");
              const order = await placeMarketOrder(realCtx.creds, {
                symbol: `${symbol}${quote}`,
                side: "BUY",
                quoteOrderQty: amount,
              });
              boughtQty = Number(order.executedQty) || amount / coin.current_price;
              realNote = ` · ordem real na tua Binance (#${order.orderId})`;
            } catch (e) {
              await supabaseAdmin.from("alerts").insert({
                user_id: s.user_id,
                kind: "real_order_failed",
                title: "Ordem real não executada",
                body: `${symbol}: ${e instanceof Error ? e.message : "erro desconhecido"}. Nenhuma operação foi registada.`,
              });
              continue;
            }
          } else {
            if (amount > simAvailable) continue;
          }

          const nextPos = afterBuy(position, {
            symbol,
            coinId: coin.id,
            price: boughtQty > 0 ? amount / boughtQty : coin.current_price,
            amount,
            pattern,
            confidence,
          });
          await supabaseAdmin.from("sim_positions").upsert(
            {
              user_id: s.user_id,
              symbol: nextPos.symbol,
              coin_id: nextPos.coin_id,
              quantity: nextPos.quantity,
              avg_entry_price: nextPos.avg_entry_price,
              invested: nextPos.invested,
              peak_price: nextPos.peak_price,
              entry_pattern_key: nextPos.entry_pattern_key,
              entry_pattern_desc: nextPos.entry_pattern_desc,
              entry_confidence: nextPos.entry_confidence,
              updated_at: nowIso,
            },
            { onConflict: "user_id,symbol" },
          );

          const buyReason = `Compra a ${coin.current_price.toFixed(4)} · ${decisionNote} (posição aberta até a IA decidir vender ou a rede de segurança atuar)${realNote}`;
          const { data: buyRow } = await supabaseAdmin
            .from("trades")
            .insert({
              user_id: s.user_id,
              symbol,
              action: "COMPRA",
              amount,
              pnl: 0,
              confidence,
              reason: buyReason,
            })
            .select("id")
            .maybeSingle();

          await supabaseAdmin.from("ia_pareceres").insert({
            user_id: s.user_id,
            trade_id: buyRow?.id ?? null,
            symbol,
            model: opinion.model,
            verdict: opinion.verdict,
            rationale: opinion.rationale,
            opinions: opinion.opinions ?? [],
            confidence_before: signal.confidence,
            confidence_after: confidence,
          });

          if (!s.real_mode) {
            await supabaseAdmin
              .from("wallets")
              .update({
                available: Number((simAvailable - amount).toFixed(2)),
                invested: Number((simInvested + amount).toFixed(2)),
                updated_at: nowIso,
              })
              .eq("user_id", s.user_id);
          }

          await supabaseAdmin
            .from("bot_settings")
            .update({
              last_tick_at: nowIso,
              ...(s.real_mode ? { real_wait_reason: null, real_wait_at: nowIso } : {}),
            })
            .eq("user_id", s.user_id);

          if (prefs?.on_trade !== false) {
            await supabaseAdmin.from("alerts").insert({
              user_id: s.user_id,
              kind: "trade",
              title: `COMPRA ${symbol} · ${amount}`,
              body: `${s.real_mode ? "Ordem real" : "Ordem simulada"} de entrada com confiança ${confidence}%. ${buyReason}`,
            });
          }

          processed++;
        }

        return Response.json({ processed });
      },
    },
  },
});

