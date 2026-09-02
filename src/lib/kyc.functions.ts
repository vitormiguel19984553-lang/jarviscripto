import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Verificação de identidade "KYC-lite": recolha simples de dados (nome legal,
 * data de nascimento, país, telefone verificado por código). Só é exigida antes
 * de ativar operações com dinheiro real ou retiradas — o modo simulado nunca
 * precisa destes dados.
 */

const sensitiveSchema = z.object({
  fullLegalName: z.string().trim().min(3).max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country: z.string().trim().min(2).max(60),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{6,20}$/, "Telefone inválido"),
});

export type KycStatus = "nao_iniciado" | "pendente" | "verificado";

/** Guarda os campos sensíveis; qualquer alteração obriga a nova verificação. */
export const saveKycData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sensitiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: current } = await supabase
      .from("profiles")
      .select("full_legal_name,date_of_birth,phone,phone_verified")
      .eq("id", userId)
      .maybeSingle();

    const phoneChanged = (current?.phone ?? "") !== data.phone;
    const sensitiveChanged =
      phoneChanged ||
      (current?.full_legal_name ?? "") !== data.fullLegalName ||
      (current?.date_of_birth ?? "") !== data.dateOfBirth;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_legal_name: data.fullLegalName,
        date_of_birth: data.dateOfBirth,
        country: data.country,
        phone: data.phone,
        // Alterar dados sensíveis obriga a repetir a verificação do telefone.
        phone_verified: phoneChanged ? false : (current?.phone_verified ?? false),
        kyc_status: sensitiveChanged ? "pendente" : undefined,
        kyc_submitted_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    // Desliga o modo real enquanto a identidade não estiver reconfirmada.
    if (sensitiveChanged) {
      await supabase
        .from("exchange_connections")
        .update({ real_trading_enabled: false })
        .eq("user_id", userId);
      await supabase.from("bot_settings").update({ real_mode: false }).eq("user_id", userId);
    }

    return { requiresReverification: sensitiveChanged };
  });

/** Aceita o aviso de risco (obrigatório antes de qualquer modo real). */
export const acceptRiskDisclaimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ risk_accepted_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia (ou simula) o código SMS de verificação do telefone. */
export const sendPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    const phone = profile?.phone;
    if (!phone) throw new Error("Guarda primeiro o número de telefone.");

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await supabaseAdmin.from("phone_verifications").insert({
      user_id: userId,
      phone,
      code,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw new Error(error.message);

    const sid = process.env["TWILIO_ACCOUNT_SID"];
    const token = process.env["TWILIO_AUTH_TOKEN"];
    const from = process.env["TWILIO_PHONE_NUMBER"];
    if (sid && token && from) {
      const body = new URLSearchParams({
        To: phone,
        From: from,
        Body: `Cripto Jarvis: o teu código de verificação é ${code}. Válido 10 minutos.`,
      });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) throw new Error("Não foi possível enviar o SMS. Tenta novamente.");
      return { simulated: false as const, code: null };
    }

    // Sem provedor de SMS configurado: modo de demonstração, o código é
    // mostrado no ecrã (assinalado como simulado).
    return { simulated: true as const, code };
  });

/** Confirma o código recebido e conclui a verificação de identidade. */
export const verifyPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().length(6) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("phone_verifications")
      .select("id,code,attempts,expires_at,consumed_at")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) throw new Error("Pede primeiro um código novo.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("O código expirou.");
    if (row.attempts >= 5) throw new Error("Demasiadas tentativas. Pede um código novo.");

    if (row.code !== data.code) {
      await supabaseAdmin
        .from("phone_verifications")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("Código incorreto.");
    }

    await supabaseAdmin
      .from("phone_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_legal_name,date_of_birth,country,risk_accepted_at")
      .eq("id", userId)
      .maybeSingle();

    const complete = Boolean(profile?.full_legal_name && profile?.date_of_birth && profile?.country);

    const { error } = await supabase
      .from("profiles")
      .update({
        phone_verified: true,
        kyc_status: complete ? "verificado" : "pendente",
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    return { status: complete ? ("verificado" as const) : ("pendente" as const) };
  });
