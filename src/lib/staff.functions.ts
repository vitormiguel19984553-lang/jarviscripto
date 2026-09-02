import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Ações de staff (Colaborador / Gerente / Admin) com validação no servidor.
 * A UI esconde o que não é permitido, mas a autorização real acontece aqui:
 * qualquer pedido de um papel sem permissão é rejeitado.
 */

export type StaffLevel = "none" | "colaborador" | "gerente" | "admin";

/** Papel efetivo de quem chama, lido do lado do servidor. */
async function levelOf(
  supabase: { from: (t: "user_roles") => any },
  userId: string,
): Promise<StaffLevel> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set(((data ?? []) as { role: string }[]).map((r) => r.role));
  if (roles.has("admin")) return "admin";
  if (roles.has("gerente")) return "gerente";
  if (roles.has("colaborador")) return "colaborador";
  return "none";
}

const rank: Record<StaffLevel, number> = { none: 0, colaborador: 1, gerente: 2, admin: 3 };

export const myStaffLevel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    level: await levelOf(context.supabase as never, context.userId),
  }));

async function requireLevel(
  context: { supabase: unknown; userId: string },
  min: Exclude<StaffLevel, "none">,
) {
  const level = await levelOf(context.supabase as never, context.userId);
  if (rank[level] < rank[min]) throw new Error("Sem permissão para esta ação.");
  return level;
}

async function audit(entry: {
  actorId: string;
  actorName: string;
  targetUserId: string | null;
  action: string;
  reason: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: entry.actorId,
    actor_name: entry.actorName,
    target_user_id: entry.targetUserId,
    action: entry.action,
    reason: entry.reason,
    metadata: (entry.metadata ?? {}) as never,
  });
}

async function actorName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return (data?.display_name as string | null) ?? "staff";
}

/** Gerente+: credita saldo à carteira de simulação de um utilizador (motivo obrigatório). */
export const grantCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().finite().min(-100000).max(100000),
        reason: z.string().trim().min(4).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireLevel(context, "gerente");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("available")
      .eq("user_id", data.userId)
      .maybeSingle();
    const next = Number((Number(wallet?.available ?? 0) + data.amount).toFixed(2));
    const up = await supabaseAdmin
      .from("wallets")
      .upsert({ user_id: data.userId, available: Math.max(0, next), updated_at: new Date().toISOString() });
    if (up.error) throw new Error(up.error.message);

    await supabaseAdmin.from("credit_grants").insert({
      user_id: data.userId,
      amount: data.amount,
      reason: data.reason,
      granted_by: context.userId,
    });
    await audit({
      actorId: context.userId,
      actorName: await actorName(context.supabase, context.userId),
      targetUserId: data.userId,
      action: "credit_grant",
      reason: data.reason,
      metadata: { amount: data.amount, balance_after: Math.max(0, next) },
    });
    return { balance: Math.max(0, next) };
  });

/** Gerente+: restringe (pausa automação/depósitos) ou bane totalmente uma conta. */
export const setRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        kind: z.enum(["automacao_pausada", "depositos_bloqueados", "ban_total"]),
        reason: z.string().trim().min(4).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireLevel(context, "gerente");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ins = await supabaseAdmin.from("user_restrictions").insert({
      user_id: data.userId,
      kind: data.kind,
      reason: data.reason,
      active: true,
      created_by: context.userId,
    });
    if (ins.error) throw new Error(ins.error.message);

    if (data.kind !== "depositos_bloqueados") {
      await supabaseAdmin.from("bot_settings").update({ auto_run: false }).eq("user_id", data.userId);
    }
    if (data.kind === "ban_total") {
      await supabaseAdmin.from("profiles").update({ is_active: false }).eq("id", data.userId);
    }

    await audit({
      actorId: context.userId,
      actorName: await actorName(context.supabase, context.userId),
      targetUserId: data.userId,
      action: `restriction_add:${data.kind}`,
      reason: data.reason,
    });
    return { ok: true };
  });

/** Gerente+: levanta uma restrição (reversível, registado). */
export const liftRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(4).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireLevel(context, "gerente");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("user_restrictions")
      .select("user_id,kind")
      .eq("id", data.id)
      .maybeSingle();
    const up = await supabaseAdmin
      .from("user_restrictions")
      .update({ active: false, lifted_by: context.userId, lifted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (up.error) throw new Error(up.error.message);

    if (row?.kind === "ban_total" && row.user_id) {
      await supabaseAdmin.from("profiles").update({ is_active: true }).eq("id", row.user_id);
    }
    await audit({
      actorId: context.userId,
      actorName: await actorName(context.supabase, context.userId),
      targetUserId: row?.user_id ?? null,
      action: `restriction_lift:${row?.kind ?? "?"}`,
      reason: data.reason,
    });
    return { ok: true };
  });

/** Gerente+: altera plano e data de expiração de um utilizador (registado). */
export const setUserPlanStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        plan: z.enum(["normal", "plus", "pro_max", "enterprise"]),
        expiresAt: z.string().nullable(),
        reason: z.string().trim().min(4).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireLevel(context, "gerente");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin
      .from("profiles")
      .update({
        plan: data.plan,
        plan_expires_at: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
      })
      .eq("id", data.userId);
    if (up.error) throw new Error(up.error.message);
    await audit({
      actorId: context.userId,
      actorName: await actorName(context.supabase, context.userId),
      targetUserId: data.userId,
      action: "plan_change",
      reason: data.reason,
      metadata: { plan: data.plan, expires_at: data.expiresAt },
    });
    return { ok: true };
  });

/** Admin: limites globais de risco e paragem de emergência (nunca gerentes). */
export const saveGlobalRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        maxLossTrade: z.number().min(1).max(100000),
        maxLossDay: z.number().min(1).max(1000000),
        emergencyStop: z.boolean(),
        reason: z.string().trim().max(300).default("ajuste de risco global"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireLevel(context, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin
      .from("platform_settings")
      .update({
        max_loss_trade: data.maxLossTrade,
        max_loss_day: data.maxLossDay,
        emergency_stop: data.emergencyStop,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (up.error) throw new Error(up.error.message);
    await audit({
      actorId: context.userId,
      actorName: await actorName(context.supabase, context.userId),
      targetUserId: null,
      action: "global_risk_update",
      reason: data.reason || "ajuste de risco global",
      metadata: {
        max_loss_trade: data.maxLossTrade,
        max_loss_day: data.maxLossDay,
        emergency_stop: data.emergencyStop,
      },
    });
    return { ok: true };
  });
