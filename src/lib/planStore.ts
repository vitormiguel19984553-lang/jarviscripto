import { supabase } from "@/integrations/supabase/client";
import { limitsFor, type PlanTier } from "@/lib/plans";

export async function loadPlan(userId: string): Promise<PlanTier> {
  const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  return (data?.plan as PlanTier | undefined) ?? "normal";
}

export async function loadPlanLimits(userId: string) {
  const plan = await loadPlan(userId);
  return { plan, limits: limitsFor(plan) };
}
