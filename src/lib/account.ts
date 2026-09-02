import { supabase } from "@/integrations/supabase/client";

export type AccountProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  fullLegalName: string;
  dateOfBirth: string;
  country: string;
  phone: string;
  phoneVerified: boolean;
  kycStatus: string;
  kycSubmittedAt: string | null;
  riskAcceptedAt: string | null;
  plan: string;
  planExpiresAt: string | null;
};

/** Lê o perfil da conta autenticada (RLS: só o próprio dono). */
export async function loadAccount(userId: string): Promise<AccountProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,display_name,avatar_url,full_legal_name,date_of_birth,country,phone,phone_verified,kyc_status,kyc_submitted_at,risk_accepted_at,plan,plan_expires_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    id: userId,
    displayName: data?.display_name ?? "",
    avatarUrl: data?.avatar_url ?? null,
    fullLegalName: data?.full_legal_name ?? "",
    dateOfBirth: data?.date_of_birth ?? "",
    country: data?.country ?? "",
    phone: data?.phone ?? "",
    phoneVerified: Boolean(data?.phone_verified),
    kycStatus: data?.kyc_status ?? "nao_iniciado",
    kycSubmittedAt: data?.kyc_submitted_at ?? null,
    riskAcceptedAt: data?.risk_accepted_at ?? null,
    plan: data?.plan ?? "normal",
    planExpiresAt: data?.plan_expires_at ?? null,
  };
}

/** Nome visível — campo não sensível, não obriga a nova verificação. */
export async function saveDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName.trim().slice(0, 60) })
    .eq("id", userId);
  if (error) throw error;
}

/** Envia a foto de perfil para o armazenamento privado do utilizador. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/avatar-${Date.now()}.${ext || "jpg"}`;
  const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (up.error) throw up.error;
  const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
  if (error) throw error;
  return path;
}

/** URL temporário assinado (o bucket é privado). */
export async function avatarSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export const kycLabels: Record<string, string> = {
  nao_iniciado: "NÃO INICIADO",
  pendente: "PENDENTE",
  verificado: "VERIFICADO",
};
