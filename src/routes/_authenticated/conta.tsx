import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  avatarSignedUrl,
  kycLabels,
  loadAccount,
  saveDisplayName,
  uploadAvatar,
} from "@/lib/account";
import {
  acceptRiskDisclaimer,
  saveKycData,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/kyc.functions";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "A minha conta — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Perfil, foto, dados de identidade e verificação por SMS da tua conta Cripto Jarvis. Só necessários antes de operar com dinheiro real.",
      },
      { property: "og:title", content: "A minha conta — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Gere o teu perfil e a verificação de identidade do Cripto Jarvis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContaPage,
});

const inputClass =
  "w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/60";
const btnClass =
  "rounded-md border border-primary/50 bg-primary/10 px-4 py-1.5 font-display text-[11px] tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:opacity-50";

function ContaPage() {
  const qc = useQueryClient();
  const user = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60_000,
  });
  const userId = user.data?.id ?? "";

  const account = useQuery({
    queryKey: ["account", userId],
    queryFn: () => loadAccount(userId),
    enabled: Boolean(userId),
  });

  const avatar = useQuery({
    queryKey: ["avatar", account.data?.avatarUrl],
    queryFn: () => avatarSignedUrl(account.data?.avatarUrl ?? null),
    enabled: Boolean(account.data?.avatarUrl),
  });

  const [name, setName] = useState("");
  const [legal, setLegal] = useState("");
  const [dob, setDob] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);

  useEffect(() => {
    const a = account.data;
    if (!a) return;
    setName(a.displayName);
    setLegal(a.fullLegalName);
    setDob(a.dateOfBirth);
    setCountry(a.country);
    setPhone(a.phone);
  }, [account.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["account", userId] });

  const saveName = useMutation({
    mutationFn: () => saveDisplayName(userId, name),
    onSuccess: () => {
      toast.success("Nome visível atualizado");
      refresh();
    },
    onError: () => toast.error("Não foi possível guardar o nome"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadAvatar(userId, file),
    onSuccess: () => {
      toast.success("Foto de perfil atualizada");
      refresh();
    },
    onError: () => toast.error("Não foi possível enviar a foto"),
  });

  const saveKyc = useServerFn(saveKycData);
  const kyc = useMutation({
    mutationFn: () =>
      saveKyc({
        data: { fullLegalName: legal, dateOfBirth: dob, country, phone },
      }),
    onSuccess: (res) => {
      toast.success(
        res.requiresReverification
          ? "Dados guardados — é necessário verificar o telefone outra vez"
          : "Dados de identidade guardados",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Verifica os dados introduzidos"),
  });

  const sendCode = useServerFn(sendPhoneCode);
  const send = useMutation({
    mutationFn: () => sendCode({ data: undefined }),
    onSuccess: (res) => {
      setDemoCode(res.simulated ? res.code : null);
      toast.success(
        res.simulated
          ? "Código gerado (modo de demonstração, sem SMS real)"
          : "Código enviado por SMS",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível gerar o código"),
  });

  const verify = useServerFn(verifyPhoneCode);
  const confirm = useMutation({
    mutationFn: () => verify({ data: { code } }),
    onSuccess: (res) => {
      setDemoCode(null);
      setCode("");
      toast.success(
        res.status === "verificado"
          ? "Identidade verificada"
          : "Telefone verificado — faltam dados de identidade",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Código inválido"),
  });

  const acceptRisk = useServerFn(acceptRiskDisclaimer);
  const risk = useMutation({
    mutationFn: () => acceptRisk({ data: undefined }),
    onSuccess: () => {
      toast.success("Aviso de risco aceite");
      refresh();
    },
    onError: () => toast.error("Não foi possível registar a aceitação"),
  });

  const a = account.data;
  const status = a?.kycStatus ?? "nao_iniciado";

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">A MINHA CONTA</h1>
          <p className="text-xs text-muted-foreground">
            Perfil, identidade e verificações · o modo simulado funciona sem nada disto
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      <section className="hud-panel mt-6 border-warning/40 p-5">
        <h2 className="font-display text-xs tracking-widest text-warning">
          QUANDO É QUE ISTO É OBRIGATÓRIO?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          A verificação de identidade (KYC-lite) só é exigida <strong>antes</strong> de ativar
          operações com dinheiro real ou de fazer retiradas. Todo o modo simulado — painel,
          automação, backtest, IA — funciona sem qualquer destes dados. Recolhemos apenas o mínimo
          (nome legal, data de nascimento, país e telefone verificado); isto não é um sistema
          completo de prevenção de branqueamento de capitais. Podes editar os dados mais tarde, mas
          alterar nome legal, data de nascimento ou telefone obriga a repetir a verificação.
        </p>
      </section>

      <section className="hud-panel anim-rise mt-6 p-5">
        <h2 className="font-display text-xs tracking-widest text-primary">PERFIL</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-primary/40 bg-secondary/50">
            {avatar.data ? (
              <img src={avatar.data} alt="Foto de perfil" className="size-full object-cover" />
            ) : (
              <span className="font-display text-[10px] tracking-widest text-muted-foreground">
                SEM FOTO
              </span>
            )}
          </div>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Foto de perfil (privada)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
              }}
              className="text-xs"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1 text-xs">
            <span className="mb-1 block text-muted-foreground">Nome visível</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <button onClick={() => saveName.mutate()} disabled={saveName.isPending} className={btnClass}>
            GUARDAR
          </button>
        </div>
      </section>

      <section className="hud-panel anim-rise mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xs tracking-widest text-primary">
            IDENTIDADE (KYC-LITE)
          </h2>
          <span
            className={`rounded-full border px-2 py-0.5 font-display text-[9px] tracking-widest ${
              status === "verificado"
                ? "border-success/50 bg-success/10 text-success"
                : status === "pendente"
                  ? "border-warning/50 bg-warning/10 text-warning"
                  : "border-border bg-secondary/40 text-muted-foreground"
            }`}
          >
            {kycLabels[status] ?? status.toUpperCase()}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Nome legal completo</span>
            <input value={legal} onChange={(e) => setLegal(e.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Data de nascimento</span>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">País de residência</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Telefone {a?.phoneVerified ? "· verificado ✓" : "· não verificado"}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 900 000 000"
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => kyc.mutate()} disabled={kyc.isPending} className={btnClass}>
            GUARDAR DADOS
          </button>
          <button
            onClick={() => send.mutate()}
            disabled={send.isPending || !a?.phone}
            className="rounded-md border border-border bg-secondary/50 px-4 py-1.5 font-display text-[11px] tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            ENVIAR CÓDIGO SMS
          </button>
        </div>

        {demoCode && (
          <p className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
            Modo de demonstração (sem provedor de SMS ligado): o teu código é{" "}
            <strong className="font-mono">{demoCode}</strong>.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Código de 6 dígitos</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              className={`${inputClass} w-40 font-mono tracking-[0.4em]`}
            />
          </label>
          <button
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending || code.length !== 6}
            className={btnClass}
          >
            CONFIRMAR
          </button>
        </div>
      </section>

      <section className="hud-panel anim-rise mt-6 p-5">
        <h2 className="font-display text-xs tracking-widest text-primary">AVISO DE RISCO</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Investir em criptomoedas envolve risco elevado de perda total do capital. O Cripto Jarvis
          é uma ferramenta de apoio e não presta consultoria financeira. Em modo real, as ordens são
          enviadas para a <strong>tua própria conta</strong> na exchange: o Cripto Jarvis nunca
          guarda, movimenta ou processa retiradas dos teus fundos.
        </p>
        {a?.riskAcceptedAt ? (
          <p className="mt-3 text-xs text-success">
            Aceite em {new Date(a.riskAcceptedAt).toLocaleString("pt-PT")}.
          </p>
        ) : (
          <button onClick={() => risk.mutate()} disabled={risk.isPending} className={`${btnClass} mt-3`}>
            ACEITO O AVISO DE RISCO
          </button>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
