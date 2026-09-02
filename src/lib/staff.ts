import { supabase } from "@/integrations/supabase/client";
import type { StaffLevel } from "@/lib/staff.functions";

export type { StaffLevel };

export const staffLabels: Record<StaffLevel, string> = {
  none: "Utilizador",
  colaborador: "Colaborador",
  gerente: "Gerente",
  admin: "Admin",
};

/** Papel do utilizador atual (leitura permitida pelas políticas de RLS). */
export async function loadMyStaffLevel(userId: string): Promise<StaffLevel> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r) => r.role as string));
  if (roles.has("admin")) return "admin";
  if (roles.has("gerente")) return "gerente";
  if (roles.has("colaborador")) return "colaborador";
  return "none";
}

export const canManageUsers = (level: StaffLevel) => level === "gerente" || level === "admin";
export const canChangeGlobalRisk = (level: StaffLevel) => level === "admin";

export type AuditEntry = {
  id: string;
  actorName: string | null;
  actorId: string;
  targetUserId: string | null;
  action: string;
  reason: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export async function loadAuditLog(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id,actor_id,actor_name,target_user_id,action,reason,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    targetUserId: r.target_user_id,
    action: r.action,
    reason: r.reason,
    createdAt: r.created_at,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }));
}

export type Restriction = {
  id: string;
  userId: string;
  kind: string;
  reason: string;
  active: boolean;
  createdAt: string;
};

export const restrictionLabels: Record<string, string> = {
  automacao_pausada: "Automação pausada",
  depositos_bloqueados: "Depósitos bloqueados",
  ban_total: "Acesso bloqueado (ban)",
};

export async function loadRestrictions(): Promise<Restriction[]> {
  const { data, error } = await supabase
    .from("user_restrictions")
    .select("id,user_id,kind,reason,active,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    reason: r.reason,
    active: r.active,
    createdAt: r.created_at,
  }));
}

/** Restrições ativas da própria conta — usadas para avisar o utilizador. */
export async function loadMyRestrictions(userId: string): Promise<Restriction[]> {
  const { data } = await supabase
    .from("user_restrictions")
    .select("id,user_id,kind,reason,active,created_at")
    .eq("user_id", userId)
    .eq("active", true);
  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    reason: r.reason,
    active: r.active,
    createdAt: r.created_at,
  }));
}
