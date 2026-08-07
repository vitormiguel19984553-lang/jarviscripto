import { supabase } from "@/integrations/supabase/client";
import { analyse, type Coin } from "@/lib/market";
import { AGGRESSION_LIST, type Aggression } from "@/lib/aggression";
import { startServerBot, stopServerBot } from "@/lib/serverBot";

/**
 * Ações que o utilizador pode pedir por texto no chat. O modelo devolve uma
 * diretiva `[[ACAO:{...}]]` no fim da resposta; a app extrai-a, mostra uma
 * confirmação e só depois executa (nunca executa sem confirmação).
 */
export type ChatAction =
  | { tipo: "comprar" | "vender"; moeda: string; valor: number }
  | { tipo: "modo"; modo: Aggression }
  | { tipo: "automacao"; horas: number }
  | { tipo: "parar_automacao" };

const DIRECTIVE = /\[\[ACAO:(\{[\s\S]*?\})\]\]/;

export function stripAction(text: string) {
  return text.replace(DIRECTIVE, "").trimEnd();
}

export function parseAction(text: string): ChatAction | null {
  const match = text.match(DIRECTIVE);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    const tipo = String(raw.tipo ?? "");
    if (tipo === "comprar" || tipo === "vender") {
      const valor = Number(raw.valor);
      const moeda = String(raw.moeda ?? "").toLowerCase();
      if (!moeda || !Number.isFinite(valor) || valor <= 0) return null;
      return { tipo, moeda, valor: Math.round(valor * 100) / 100 };
    }
    if (tipo === "modo") {
      const modo = String(raw.modo ?? "").toLowerCase() as Aggression;
      return AGGRESSION_LIST.includes(modo) ? { tipo: "modo", modo } : null;
    }
    if (tipo === "automacao") {
      const horas = Number(raw.horas);
      if (!Number.isFinite(horas) || horas <= 0) return null;
      return { tipo: "automacao", horas: Math.round(horas) };
    }
    if (tipo === "parar_automacao") return { tipo: "parar_automacao" };
    return null;
  } catch {
    return null;
  }
}

export function describeAction(action: ChatAction, coins: Coin[] = []): string {
  switch (action.tipo) {
    case "comprar":
    case "vender": {
      const coin = coins.find((c) => c.id === action.moeda || c.symbol === action.moeda);
      const nome = coin?.name ?? action.moeda;
      return `${action.tipo === "comprar" ? "Comprar" : "Vender"} ${action.valor.toFixed(2)}€ de ${nome} (simulação)`;
    }
    case "modo":
      return `Mudar o modo da IA para ${action.modo}`;
    case "automacao":
      return `Ligar a automação no servidor durante ${action.horas}h`;
    case "parar_automacao":
      return "Desligar a automação no servidor";
  }
}

/** Executa a ação já confirmada pelo utilizador. Devolve o texto do resultado. */
export async function runAction(
  action: ChatAction,
  ctx: { userId: string; coins: Coin[] },
): Promise<string> {
  switch (action.tipo) {
    case "modo": {
      const { error } = await supabase
        .from("bot_settings")
        .upsert(
          { user_id: ctx.userId, aggression: action.modo, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      return `Modo da IA alterado para ${action.modo}.`;
    }
    case "automacao": {
      await startServerBot(ctx.userId, action.horas);
      return `Automação no servidor ligada (até ${action.horas}h, limitado pelo teu plano).`;
    }
    case "parar_automacao": {
      await stopServerBot(ctx.userId);
      return "Automação no servidor desligada.";
    }
    case "comprar":
    case "vender": {
      const coin = ctx.coins.find((c) => c.id === action.moeda || c.symbol === action.moeda);
      if (!coin) throw new Error("Moeda não disponível na lista do Jarvis.");

      const { data: wallet } = await supabase
        .from("wallets")
        .select("available,invested")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const available = Number(wallet?.available ?? 0);
      const invested = Number(wallet?.invested ?? 0);
      if (action.tipo === "comprar" && action.valor > available) {
        throw new Error("Saldo disponível insuficiente na carteira simulada.");
      }
      if (action.tipo === "vender" && action.valor > invested) {
        throw new Error("Não há valor investido suficiente para vender.");
      }

      const signal = analyse(coin);
      const nextAvailable =
        action.tipo === "comprar" ? available - action.valor : available + action.valor;
      const nextInvested =
        action.tipo === "comprar" ? invested + action.valor : invested - action.valor;

      await supabase.from("wallets").upsert(
        {
          user_id: ctx.userId,
          available: Number(nextAvailable.toFixed(2)),
          invested: Number(nextInvested.toFixed(2)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      const { error } = await supabase.from("trades").insert({
        user_id: ctx.userId,
        symbol: coin.symbol.toUpperCase(),
        action: action.tipo === "comprar" ? "COMPRA" : "VENDA",
        amount: action.valor,
        pnl: 0,
        confidence: signal.confidence,
        reason: `Ordem pedida no chat pelo utilizador · ${signal.reason}`,
      });
      if (error) throw error;

      return `${action.tipo === "comprar" ? "Compra" : "Venda"} simulada de ${action.valor.toFixed(2)}€ em ${coin.symbol.toUpperCase()} registada.`;
    }
  }
}
