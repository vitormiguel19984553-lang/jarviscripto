import type { Coin } from "@/lib/market";
import { limitsFor, type PlanTier } from "@/lib/plans";

/**
 * Seleção inicial de moedas para contas novas: as primeiras moedas do catálogo
 * (ordenado por capitalização) até ao limite do plano. Evita listas demasiado
 * curtas, que só geram sinais de venda quando o utilizador já as tem compradas.
 */
export function defaultSelection(coins: Coin[], plan: PlanTier | null | undefined): string[] {
  const max = Math.min(limitsFor(plan).maxCoins, 12);
  const ids = coins.length ? coins.map((c) => c.id) : FALLBACK_IDS;
  return ids.slice(0, max);
}

/** Usada quando o mercado ainda não carregou. */
export const FALLBACK_IDS = [
  "bitcoin",
  "ethereum",
  "binancecoin",
  "solana",
  "ripple",
  "cardano",
  "chainlink",
  "avalanche-2",
  "polkadot",
  "litecoin",
  "tron",
  "dogecoin",
];

/**
 * Moedas do catálogo que o utilizador ainda não vigia e que ainda cabem no
 * limite do plano — base do aviso "novas moedas disponíveis".
 */
export function suggestNewCoins(
  coins: Coin[],
  selected: string[],
  plan: PlanTier | null | undefined,
): string[] {
  const room = limitsFor(plan).maxCoins - selected.length;
  if (room <= 0) return [];
  return coins
    .filter((c) => !selected.includes(c.id))
    .slice(0, room)
    .map((c) => c.id);
}
