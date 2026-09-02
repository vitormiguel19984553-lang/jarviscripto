import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { eur } from "@/lib/market";
import { loadRealWallet, refreshRealBalance, type RealBalance } from "@/lib/wallet";
import { setRealTrading } from "@/lib/exchange.functions";
import { loadAccount } from "@/lib/account";
import { SIM_CAPITAL_CAP } from "@/lib/useJarvis";
import { loadServerBot, startServerBot, stopServerBot } from "@/lib/serverBot";

type SimEngine = {
  available: number;
  invested: number;
  transfer: (amount: number, toInvest: boolean) => void;
  deposit: (amount: number) => { ok: boolean; reason?: string };
};

const usdt = (v: number) =>
  `${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

/**
 * Carteiras separadas: o dinheiro de simulação nunca se mistura com o saldo
 * real, que vive sempre na conta Binance do próprio utilizador.
 */
export function WalletPanel({ userId, engine }: { userId: string; engine: SimEngine }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(500);
  const [balance, setBalance] = useState<RealBalance | null>(null);
  const setReal = useServerFn(setRealTrading);

  const account = useQuery({
    queryKey: ["account-profile", userId],
    queryFn: () => loadAccount(userId),
    enabled: Boolean(userId),
  });

  const real = useQuery({
    queryKey: ["real-wallet", userId],
    queryFn: () => loadRealWallet(userId),
    enabled: Boolean(userId),
  });

  const automation = useQuery({
    queryKey: ["server-bot", userId],
    queryFn: () => loadServerBot(userId),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });

  const refresh = useMutation({
    mutationFn: refreshRealBalance,
    onSuccess: (res) => {
      if (res.ok) {
        setBalance(res.balance);
        toast.success(`Saldo real lido: ${usdt(res.balance.totalUsdt)}`);
      } else {
        toast.error(res.error);
      }
      void qc.invalidateQueries({ queryKey: ["real-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMode = useMutation({
    mutationFn: (enabled: boolean) => setReal({ data: { enabled } }),
    onSuccess: (res) => {
      toast.success(res.enabled ? "Modo real ativo." : "De volta ao modo simulação.");
      void qc.invalidateQueries({ queryKey: ["real-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRealAutomation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) await startServerBot(userId, 12);
      else await stopServerBot(userId);
      return enabled;
    },
    onSuccess: (enabled) => {
      toast.success(
        enabled
          ? "Operações reais ligadas por 12 horas."
          : "Automação real desligada.",
      );
      void qc.invalidateQueries({ queryKey: ["server-bot", userId] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar a automação real."),
  });

  const w = real.data;
  const realMode = Boolean(w?.realTradingEnabled);
  const realAutomationActive =
    Boolean(automation.data?.auto_run) &&
    Boolean(automation.data?.run_until) &&
    new Date(automation.data?.run_until ?? 0) > new Date();
  const p = account.data;

  const requirements = [
    {
      label: "Identidade verificada (KYC-lite)",
      done: p?.kycStatus === "verificado",
      to: "/conta" as const,
    },
    { label: "Telefone confirmado", done: Boolean(p?.phoneVerified), to: "/conta" as const },
    { label: "Aviso de risco aceite", done: Boolean(p?.riskAcceptedAt), to: "/conta" as const },
    { label: "Binance ligada", done: Boolean(w?.connected), to: "/binance" as const },
    {
      label: "Verificação só de leitura do saldo",
      done: Boolean(w?.verifiedAt),
      to: "/binance" as const,
    },
  ];
  const missing = requirements.filter((r) => !r.done);
  const canGoReal = missing.length === 0;

  const handleDeposit = () => {
    const res = engine.deposit(amount);
    if (!res.ok) toast.error(res.reason ?? "Depósito virtual não permitido.");
    else if (res.reason) toast.warning(res.reason);
    else toast.success(`${amount.toLocaleString("pt-PT")} € virtuais adicionados.`);
  };

  return (
    <div className="space-y-4">
      <div
        className={`hud-panel flex flex-wrap items-center justify-between gap-3 p-4 ${
          realMode ? "border-destructive/50" : ""
        }`}
      >
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Dinheiro que a IA está a usar
          </p>
          <p
            className={`font-display text-lg ${realMode ? "text-destructive" : "text-primary text-glow"}`}
          >
            {realMode ? "DINHEIRO REAL (BINANCE)" : "DINHEIRO DE SIMULAÇÃO"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleMode.mutate(false)}
            disabled={!realMode || toggleMode.isPending}
            className={`hud-btn px-3 py-2 text-[11px] ${realMode ? "hud-btn-ghost" : "hud-btn-primary"}`}
          >
            SIMULAÇÃO
          </button>
          {w?.connected ? (
            <button
              onClick={() => toggleMode.mutate(true)}
              disabled={realMode || toggleMode.isPending || !canGoReal}
              title={canGoReal ? undefined : "Falta concluir os requisitos abaixo"}
              className={`hud-btn px-3 py-2 text-[11px] ${realMode ? "hud-btn-danger" : "hud-btn-ghost"}`}
            >
              DINHEIRO REAL
            </button>
          ) : (
            <Link to="/binance" className="hud-btn hud-btn-ghost px-3 py-2 text-[11px]">
              LIGAR BINANCE
            </Link>
          )}
        </div>
      </div>

      {!realMode && (
        <div className="hud-panel p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Requisitos para operar com dinheiro real
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {requirements.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2">
                <span className={r.done ? "text-primary" : "text-muted-foreground"}>
                  {r.done ? "✓" : "○"} {r.label}
                </span>
                {!r.done && (
                  <Link to={r.to} className="text-[11px] underline text-accent">
                    resolver
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {canGoReal && (
            <p className="mt-2 text-xs text-primary">
              Tudo pronto — podes ativar o modo dinheiro real acima.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="hud-panel p-5">
          <h2 className="flex items-center gap-2 text-sm tracking-widest text-primary">
            <Wallet className="size-4" aria-hidden /> CARTEIRA DE SIMULAÇÃO
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Dinheiro virtual. Nada aqui sai ou entra na tua conta real. Limite de capital
            fictício: {SIM_CAPITAL_CAP.toLocaleString("pt-PT")} €.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Disponível
              </p>
              <p className="font-display text-lg">{eur(engine.available)}</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Investido
              </p>
              <p className="font-display text-lg text-glow">{eur(engine.invested)}</p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Montante (€)
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-secondary/60 px-3 py-2 font-display text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => engine.transfer(amount, true)}
              className="hud-btn hud-btn-ghost px-3 py-2 text-xs text-primary"
            >
              PARA INVESTIMENTO
            </button>
            <button
              onClick={() => engine.transfer(amount, false)}
              className="hud-btn hud-btn-ghost px-3 py-2 text-xs"
            >
              PARA DISPONÍVEL
            </button>
            <button
              onClick={handleDeposit}
              className="hud-btn hud-btn-accent col-span-2 px-3 py-2 text-xs"
            >
              DEPOSITAR (VIRTUAL)
            </button>
          </div>
        </section>

        <section className="hud-panel p-5">
          <h2 className="flex items-center gap-2 text-sm tracking-widest text-primary">
            <ShieldCheck className="size-4" aria-hidden /> CARTEIRA REAL · BINANCE
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Saldo lido diretamente da tua conta Binance. O Cripto Jarvis nunca guarda fundos nem
            processa retiradas — os lucros ficam e são retirados na tua própria Binance.
          </p>

          {!w?.connected ? (
            <div className="mt-4 rounded-md border border-border bg-secondary/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">Ainda não há conta ligada.</p>
              <Link
                to="/binance"
                className="hud-btn hud-btn-primary mt-3 inline-block px-3 py-2 text-[11px]"
              >
                LIGAR A MINHA BINANCE
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Saldo total estimado
                </p>
                <p className="font-display text-2xl text-glow">
                  {usdt(balance?.totalUsdt ?? w.lastBalance ?? 0)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Chave {w.keyMasked ?? "•••"} ·{" "}
                  {w.verifiedAt
                    ? `verificada em ${new Date(w.verifiedAt).toLocaleString("pt-PT")}`
                    : "ainda sem verificação de leitura"}
                </p>
              </div>

              {(balance?.assets?.length ?? 0) > 0 && (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {balance!.assets.slice(0, 12).map((a) => (
                    <li
                      key={a.asset}
                      className="flex items-center justify-between rounded border border-border/60 bg-secondary/30 px-2 py-1"
                    >
                      <span className="font-display tracking-widest">{a.asset}</span>
                      <span className="text-muted-foreground">
                        {(a.free + a.locked).toLocaleString("pt-PT", { maximumFractionDigits: 6 })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {w.lastError && <p className="mt-3 text-xs text-destructive">{w.lastError}</p>}

              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="hud-btn hud-btn-primary mt-4 flex w-full items-center justify-center gap-2 px-3 py-2 text-[11px]"
              >
                <RefreshCw className={`size-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
                {refresh.isPending ? "A LER SALDO…" : "ATUALIZAR SALDO REAL"}
              </button>

              {realMode && (
                <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-xs tracking-widest text-foreground">
                        OPERAÇÕES REAIS 24/7
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {realAutomationActive
                          ? `Ativas até ${new Date(automation.data?.run_until ?? 0).toLocaleString("pt-PT")}`
                          : "Modo real autorizado, mas a automação está parada."}
                      </p>
                    </div>
                    <span
                      className={`size-2 shrink-0 rounded-full ${realAutomationActive ? "bg-success" : "bg-muted-foreground"}`}
                      aria-hidden
                    />
                  </div>
                  {(balance?.canTrade === false || (w.lastBalance ?? 0) < 5) && (
                    <p className="mt-2 text-[11px] text-destructive">
                      {balance?.canTrade === false
                        ? "A chave Binance não tem permissão Spot & Margin Trading."
                        : "O saldo disponível é inferior ao mínimo habitual de ordem Spot (5 USDT). Adiciona saldo na tua Binance antes de operar."}
                    </p>
                  )}
                  <button
                    onClick={() => toggleRealAutomation.mutate(!realAutomationActive)}
                    disabled={
                      toggleRealAutomation.isPending ||
                      (!realAutomationActive &&
                        (balance?.canTrade === false || (w.lastBalance ?? 0) < 5))
                    }
                    className={
                      realAutomationActive
                        ? "hud-btn hud-btn-danger mt-3 w-full px-3 py-2 text-[11px]"
                        : "hud-btn hud-btn-accent mt-3 w-full px-3 py-2 text-[11px]"
                    }
                  >
                    {toggleRealAutomation.isPending
                      ? "A PROCESSAR…"
                      : realAutomationActive
                        ? "PARAR OPERAÇÕES REAIS"
                        : "INICIAR OPERAÇÕES REAIS · 12H"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
