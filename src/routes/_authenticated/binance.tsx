import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadAccount } from "@/lib/account";
import {
  disconnectExchange,
  saveExchangeKeys,
  setRealTrading,
  verifyExchangeConnection,
} from "@/lib/exchange.functions";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/binance")({
  head: () => ({
    meta: [
      { title: "Ligar Binance (não-custodial) — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Liga a tua própria conta Binance com uma chave API só de trading. O Cripto Jarvis nunca guarda fundos nem processa retiradas.",
      },
      { property: "og:title", content: "Ligar Binance (não-custodial) — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Chaves cifradas, verificação de leitura e modo real com todos os limites de risco.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BinancePage,
});

const inputClass =
  "w-full rounded-md border border-border bg-secondary/50 px-3 py-2 font-mono text-xs outline-none focus:border-primary/60";
const btnClass =
  "rounded-md border border-primary/50 bg-primary/10 px-4 py-1.5 font-display text-[11px] tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:opacity-50";

type Balance = {
  totalUsdt: number;
  canTrade: boolean;
  canWithdraw: boolean;
  assets: { asset: string; free: number; locked: number }[];
};

function BinancePage() {
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

  const conn = useQuery({
    queryKey: ["exchange-connection", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("exchange_connections")
        .select("exchange,key_masked,verified_at,last_balance,last_verify_error,real_trading_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(userId),
  });

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["exchange-connection", userId] });
    qc.invalidateQueries({ queryKey: ["account", userId] });
  };

  const save = useServerFn(saveExchangeKeys);
  const saveKeys = useMutation({
    mutationFn: () => save({ data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() } }),
    onSuccess: () => {
      setApiKey("");
      setApiSecret("");
      setBalance(null);
      toast.success("Chaves guardadas e cifradas. Faz agora a verificação de leitura.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível guardar as chaves"),
  });

  const verify = useServerFn(verifyExchangeConnection);
  const check = useMutation({
    mutationFn: () => verify({ data: undefined }),
    onSuccess: (res) => {
      if (!res.ok) {
        setBalance(null);
        toast.error(res.error || "Falha na verificação");
        refresh();
        return;
      }
      setBalance(res.balance as Balance);
      toast.success("Ligação verificada em modo leitura");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Falha na verificação"),
  });


  const real = useServerFn(setRealTrading);
  const toggleReal = useMutation({
    mutationFn: (enabled: boolean) => real({ data: { enabled } }),
    onSuccess: (res) => {
      toast.success(res.enabled ? "Modo real ativado" : "Modo real desligado");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar o modo real"),
  });

  const remove = useServerFn(disconnectExchange);
  const disconnect = useMutation({
    mutationFn: () => remove({ data: undefined }),
    onSuccess: () => {
      setBalance(null);
      toast.success("Ligação removida e chaves apagadas");
      refresh();
    },
    onError: () => toast.error("Não foi possível remover a ligação"),
  });

  const c = conn.data;
  const a = account.data;
  const kycOk = a?.kycStatus === "verificado" && a?.phoneVerified;
  const riskOk = Boolean(a?.riskAcceptedAt);
  const verified = Boolean(c?.verified_at);
  const canEnableReal = kycOk && riskOk && verified;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">LIGAÇÃO BINANCE</h1>
          <p className="text-xs text-muted-foreground">
            Não-custodial · as ordens vão para a tua própria conta
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      <section className="hud-panel mt-6 border-warning/40 p-5">
        <h2 className="font-display text-xs tracking-widest text-warning">
          COMO CRIAR A CHAVE (LÊ ANTES)
        </h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            • Cria a chave API na Binance com <strong>permissão de trading apenas</strong> (Enable
            Spot Trading). Isto permite ao Jarvis enviar ordens sem nunca poder mover o teu
            dinheiro para fora da tua conta.
          </li>
          <li>
            • <strong>Desativa retiradas</strong> (Enable Withdrawals desligado). Assim, mesmo que a
            chave fosse comprometida, ninguém consegue retirar fundos.
          </li>
          <li>
            • Se puderes, <strong>restringe por IP</strong>. Reduz o risco a zero fora dos
            servidores autorizados.
          </li>
          <li>
            • O Cripto Jarvis <strong>nunca custodia fundos</strong> e{" "}
            <strong>nunca processa retiradas</strong>: os lucros retiras tu, diretamente na tua conta
            Binance.
          </li>
        </ul>
      </section>

      <section className="hud-panel anim-rise mt-6 p-5">
        <h2 className="font-display text-xs tracking-widest text-primary">CHAVES API</h2>
        {c?.key_masked ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Chave guardada: <span className="font-mono text-foreground">{c.key_masked}</span> · a
            chave e o segredo estão cifrados no servidor e nunca são devolvidos ao navegador.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Ainda não há nenhuma chave ligada.</p>
        )}

        <div className="mt-4 grid gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">API Key</span>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">API Secret</span>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => saveKeys.mutate()}
            disabled={saveKeys.isPending || apiKey.length < 16 || apiSecret.length < 16}
            className={btnClass}
          >
            GUARDAR E CIFRAR
          </button>
          {c?.key_masked && (
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="rounded-md border border-destructive/60 bg-destructive/10 px-4 py-1.5 font-display text-[11px] tracking-widest text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              REMOVER LIGAÇÃO
            </button>
          )}
        </div>
      </section>

      <section className="hud-panel anim-rise mt-6 p-5">
        <h2 className="font-display text-xs tracking-widest text-primary">
          VERIFICAÇÃO SÓ DE LEITURA
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Primeiro lemos o teu saldo real (sem enviar qualquer ordem). Só depois de o vires podes
          ativar o modo real.
        </p>
        <button
          onClick={() => check.mutate()}
          disabled={check.isPending || !c?.key_masked}
          className={`${btnClass} mt-3`}
        >
          {check.isPending ? "A LER SALDO…" : "VERIFICAR E LER SALDO"}
        </button>

        {c?.last_verify_error && (
          <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {c.last_verify_error}
          </p>
        )}

        {balance && (
          <div className="mt-4 rounded-md border border-success/40 bg-success/5 p-3 text-xs">
            <p className="font-display text-[11px] tracking-widest text-success">
              SALDO EM STABLECOINS: {balance.totalUsdt.toFixed(2)} USDT
            </p>
            <p className="mt-1 text-muted-foreground">
              Permissões da chave: trading {balance.canTrade ? "sim" : "não"} · retiradas{" "}
              {balance.canWithdraw ? "SIM (desativa!)" : "não (correto)"}
            </p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {balance.assets.map((asset) => (
                <li key={asset.asset} className="flex justify-between border-b border-border/40 py-0.5">
                  <span className="font-mono">{asset.asset}</span>
                  <span>{asset.free.toFixed(6)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!balance && verified && c?.last_balance != null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Última verificação: {new Date(c.verified_at as string).toLocaleString("pt-PT")} ·{" "}
            {Number(c.last_balance).toFixed(2)} USDT em stablecoins.
          </p>
        )}
      </section>

      <section
        className={`hud-panel anim-rise mt-6 p-5 ${c?.real_trading_enabled ? "border-success/50" : ""}`}
      >
        <h2 className="font-display text-xs tracking-widest text-primary">MODO REAL</h2>
        <ul className="mt-2 space-y-1 text-xs">
          <li className={kycOk ? "text-success" : "text-muted-foreground"}>
            {kycOk ? "✓" : "○"} Verificação de identidade (KYC-lite) concluída
          </li>
          <li className={riskOk ? "text-success" : "text-muted-foreground"}>
            {riskOk ? "✓" : "○"} Aviso de risco aceite
          </li>
          <li className={verified ? "text-success" : "text-muted-foreground"}>
            {verified ? "✓" : "○"} Saldo real lido e confirmado
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Em modo real aplicam-se <strong>exatamente os mesmos limites</strong> do modo simulado:
          limite de perda diária, perda máxima por operação, paragem de emergência global, teto de
          diversificação, modos de agressividade e limite de operações por hora. As retiradas de
          lucro fazem-se sempre na tua conta Binance — o Cripto Jarvis nunca toca nos teus fundos.
        </p>
        <button
          onClick={() => toggleReal.mutate(!c?.real_trading_enabled)}
          disabled={toggleReal.isPending || (!c?.real_trading_enabled && !canEnableReal)}
          className={
            c?.real_trading_enabled
              ? "mt-3 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-1.5 font-display text-[11px] tracking-widest text-destructive hover:bg-destructive/20 disabled:opacity-50"
              : `${btnClass} mt-3`
          }
        >
          {c?.real_trading_enabled ? "DESLIGAR MODO REAL" : "ATIVAR OPERAÇÕES REAIS"}
        </button>
      </section>

      <BottomNav />
    </main>
  );
}
