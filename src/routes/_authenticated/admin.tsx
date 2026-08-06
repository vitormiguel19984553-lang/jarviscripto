import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  checkIsAdmin,
  loadPlatformOverview,
  loadPlatformSettings,
  planLabels,
  savePlatformSettings,
  setEmergencyStop,
  setUserActive,
  setUserPlan,
  type PlanTier,
} from "@/lib/admin";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Área de administração do Cripto Jarvis: utilizadores, volume de operações, desempenho da IA e logs globais da plataforma.",
      },
      { property: "og:title", content: "Administração — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Métricas globais, utilizadores e logs da plataforma Cripto Jarvis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user || !(await checkIsAdmin(data.user.id))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminPage,
});

const eur = (v: number) => `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(2)}€`;

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="hud-panel p-4">
      <p className="font-display text-[10px] tracking-widest text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-lg ${
          tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AdminPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: loadPlatformOverview,
    refetchInterval: 30_000,
  });
  const { data: platform } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: loadPlatformSettings,
  });

  const [maxTrade, setMaxTrade] = useState("");
  const [maxDay, setMaxDay] = useState("");
  useEffect(() => {
    if (platform) {
      setMaxTrade(String(platform.max_loss_trade));
      setMaxDay(String(platform.max_loss_day));
    }
  }, [platform]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
  };

  const limits = useMutation({
    mutationFn: () =>
      savePlatformSettings({
        max_loss_trade: Math.max(1, Number(maxTrade) || 1),
        max_loss_day: Math.max(1, Number(maxDay) || 1),
        emergency_stop: platform?.emergency_stop ?? false,
      }),
    onSuccess: () => {
      toast.success("Limites globais atualizados");
      refresh();
    },
    onError: () => toast.error("Não foi possível guardar os limites"),
  });

  const emergency = useMutation({
    mutationFn: (enabled: boolean) => setEmergencyStop(enabled),
    onSuccess: (_d, enabled) => {
      toast.success(enabled ? "Paragem de emergência ativada" : "Automação global reativada");
      refresh();
    },
    onError: () => toast.error("Não foi possível alterar a paragem de emergência"),
  });

  const plan = useMutation({
    mutationFn: (v: { userId: string; plan: PlanTier }) => setUserPlan(v.userId, v.plan),
    onSuccess: () => {
      toast.success("Plano atualizado");
      refresh();
    },
    onError: () => toast.error("Não foi possível alterar o plano"),
  });

  const active = useMutation({
    mutationFn: (v: { userId: string; isActive: boolean }) => setUserActive(v.userId, v.isActive),
    onSuccess: () => {
      toast.success("Estado da conta atualizado");
      refresh();
    },
    onError: () => toast.error("Não foi possível alterar o estado da conta"),
  });

  const t = data?.totals;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">ADMINISTRAÇÃO</h1>
          <p className="text-xs text-muted-foreground">
            Visão global da plataforma · acesso restrito a administradores
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">A carregar métricas…</p>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="UTILIZADORES" value={String(t?.users ?? 0)} />
        <Metric label="OPERAÇÕES" value={String(t?.trades ?? 0)} />
        <Metric label="VOLUME (500 ÚLTIMAS)" value={eur(t?.volume ?? 0)} />
        <Metric
          label="RESULTADO GLOBAL"
          value={eur(t?.pnl ?? 0)}
          tone={(t?.pnl ?? 0) >= 0 ? "up" : "down"}
        />
        <Metric label="TAXA DE ACERTO" value={`${t?.winRate ?? 0}%`} />
        <Metric label="SALDO TOTAL" value={eur(t?.balance ?? 0)} />
        <Metric label="BOTS ATIVOS NO SERVIDOR" value={String(t?.activeBots ?? 0)} />
        <Metric
          label="ADMINS"
          value={String((data?.users ?? []).filter((u) => u.isAdmin).length)}
        />
      </section>

      <section
        className={`hud-panel mt-6 p-5 ${platform?.emergency_stop ? "border-destructive/60" : ""}`}
      >
        <h2 className="mb-3 font-display text-xs tracking-widest text-destructive">
          PARAGEM DE EMERGÊNCIA GLOBAL
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {platform?.emergency_stop
            ? "Ativa: toda a automação no servidor está travada e nenhum bot pode operar."
            : "Desliga imediatamente a automação de todas as contas no servidor."}
        </p>
        <button
          onClick={() => emergency.mutate(!(platform?.emergency_stop ?? false))}
          disabled={emergency.isPending || !platform}
          className={`rounded-md border px-4 py-1.5 font-display text-[11px] tracking-widest disabled:opacity-50 ${
            platform?.emergency_stop
              ? "border-success/50 bg-success/10 text-success hover:bg-success/20"
              : "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20"
          }`}
        >
          {platform?.emergency_stop ? "REATIVAR AUTOMAÇÃO" : "PARAR TUDO AGORA"}
        </button>
      </section>

      <section className="hud-panel mt-6 p-5">
        <h2 className="mb-3 font-display text-xs tracking-widest text-primary">
          LIMITES GLOBAIS DE RISCO
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Teto aplicado a todas as contas: nenhum utilizador pode operar acima destes valores.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Perda máx. por operação (€)</span>
            <input
              type="number"
              min={1}
              value={maxTrade}
              onChange={(e) => setMaxTrade(e.target.value)}
              className="w-36 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Perda máx. por dia (€)</span>
            <input
              type="number"
              min={1}
              value={maxDay}
              onChange={(e) => setMaxDay(e.target.value)}
              className="w-36 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={() => limits.mutate()}
            disabled={limits.isPending}
            className="rounded-md border border-primary/50 bg-primary/10 px-4 py-1.5 font-display text-[11px] tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            GUARDAR
          </button>
        </div>
      </section>

      <section className="hud-panel mt-6 p-5">
        <h2 className="mb-3 font-display text-xs tracking-widest text-primary">UTILIZADORES</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="font-display text-[10px] tracking-widest text-muted-foreground">
              <tr>
                <th className="pb-2">CONTA</th>
                <th className="pb-2">PLANO</th>
                <th className="pb-2">SALDO</th>
                <th className="pb-2">INVESTIDO</th>
                <th className="pb-2">OPS</th>
                <th className="pb-2">ACERTO</th>
                <th className="pb-2">SHARPE</th>
                <th className="pb-2">CONF. MÍN.</th>
                <th className="pb-2">RESULTADO</th>
                <th className="pb-2">BOT</th>
                <th className="pb-2">CONTA</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className="border-t border-border/60">
                  <td className="py-2">
                    {u.name}
                    {u.isAdmin && (
                      <span className="ml-2 rounded border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-display text-[9px] text-primary">
                        ADMIN
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <select
                      value={u.plan}
                      onChange={(e) =>
                        plan.mutate({ userId: u.id, plan: e.target.value as PlanTier })
                      }
                      className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs"
                    >
                      {(Object.keys(planLabels) as PlanTier[]).map((p) => (
                        <option key={p} value={p}>
                          {planLabels[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">{eur(u.available)}</td>
                  <td className="py-2">{eur(u.invested)}</td>
                  <td className="py-2">{u.trades}</td>
                  <td className="py-2">
                    {u.trades ? `${((u.wins / u.trades) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2">{u.sharpe.toFixed(2)}</td>
                  <td className="py-2">{u.minConfidence.toFixed(1)}%</td>
                  <td className={`py-2 ${u.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                    {eur(u.pnl)}
                  </td>

                  <td className="py-2">
                    <span
                      className={`inline-block size-2 rounded-full ${
                        u.autoRun ? "bg-success" : "bg-muted-foreground"
                      }`}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => active.mutate({ userId: u.id, isActive: !u.isActive })}
                      disabled={active.isPending}
                      className={`rounded-md border px-2 py-1 font-display text-[10px] tracking-widest disabled:opacity-50 ${
                        u.isActive
                          ? "border-success/50 bg-success/10 text-success"
                          : "border-destructive/50 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {u.isActive ? "ATIVA" : "DESATIVADA"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hud-panel mt-6 p-5">
        <h2 className="mb-3 font-display text-xs tracking-widest text-primary">
          LOGS GLOBAIS · ÚLTIMAS OPERAÇÕES
        </h2>
        <ul className="space-y-1 text-xs">
          {(data?.recentTrades ?? []).map((tr) => (
            <li
              key={tr.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1.5"
            >
              <span className="text-muted-foreground">
                {new Date(tr.createdAt).toLocaleString("pt-PT")}
              </span>
              <span className="font-display text-[11px]">
                {tr.action} {tr.symbol} · {eur(tr.amount)} · {tr.confidence}%
              </span>
              <span className={tr.pnl >= 0 ? "text-success" : "text-destructive"}>
                {tr.pnl >= 0 ? "+" : ""}
                {tr.pnl.toFixed(2)}€
              </span>
            </li>
          ))}
          {!isLoading && !(data?.recentTrades ?? []).length && (
            <li className="text-muted-foreground">Sem operações registadas ainda.</li>
          )}
        </ul>
      </section>

      <p className="mt-6 pb-4 text-center text-xs text-muted-foreground">
        Gestão de planos, limites globais e ativação de contas entram na próxima fase.
      </p>
      <BottomNav />
    </main>
  );
}
