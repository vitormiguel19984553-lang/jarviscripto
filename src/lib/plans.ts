import type { Database } from "@/integrations/supabase/types";

export type PlanTier = Database["public"]["Enums"]["plan_tier"];

export type PlanLimits = {
  label: string;
  /** Durações de automação permitidas (horas). */
  clientHours: number[];
  serverHours: number[];
  maxCoins: number;
  backtest: boolean;
  secondOpinion: boolean;
  models: string[];
};

export const planLimits: Record<PlanTier, PlanLimits> = {
  normal: {
    label: "Normal",
    clientHours: [1],
    serverHours: [6],
    maxCoins: 3,
    backtest: false,
    secondOpinion: false,
    models: ["openai/gpt-5.6-luna"],
  },
  plus: {
    label: "Plus",
    clientHours: [1, 5],
    serverHours: [6, 12],
    maxCoins: 5,
    backtest: true,
    secondOpinion: false,
    models: ["openai/gpt-5.6-luna", "google/gemini-3.6-flash"],
  },
  pro_max: {
    label: "Pro Max",
    clientHours: [1, 5, 12],
    serverHours: [6, 12, 24],
    maxCoins: 8,
    backtest: true,
    secondOpinion: true,
    models: ["openai/gpt-5.6-sol", "openai/gpt-5.6-luna", "google/gemini-3.6-flash"],
  },
  enterprise: {
    label: "Enterprise",
    clientHours: [1, 5, 12, 24],
    serverHours: [6, 12, 24, 72],
    maxCoins: 99,
    backtest: true,
    secondOpinion: true,
    models: ["openai/gpt-5.6-sol", "openai/gpt-5.6-luna", "google/gemini-3.6-flash"],
  },
};

export const limitsFor = (plan: PlanTier | null | undefined) =>
  planLimits[plan ?? "normal"] ?? planLimits.normal;
