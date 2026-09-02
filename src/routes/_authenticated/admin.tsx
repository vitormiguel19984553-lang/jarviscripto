import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadCronHealth, loadPlatformOverview, loadPlatformSettings, planLabels, type PlanTier } from "@/lib/admin";
import {
  canChangeGlobalRisk,
  canManageUsers,
  loadAuditLog,
  loadMyStaffLevel,
  loadRestrictions,
  restrictionLabels,
  staffLabels,
  type StaffLevel,
} from "@/lib/staff";
import {
  grantCredit,
  liftRestriction,
  saveGlobalRisk,
  setRestriction,
  setUserPlanStaff,
} from "@/lib/staff.functions";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Área de administração do Cripto Jarvis: utilizadores, planos, restrições, créditos e registo de auditoria.",
      },
      { property: "og:title", content: "Administração — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Métricas globais, gestão de utilizadores e auditoria da plataforma Cripto Jarvis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/dashboard" });
    const level = await loadMyStaffLevel(data.user.id);
    if (level === "none") throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

const eur = (v: number) => `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(2)}€`;
const inputSm = "rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs";
const btnSm =
  "rounded-md border border-primary/50 bg-primary/10 px-3 py-1 font-display text-[10px] tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50";

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

type Tab = "visao" | "utilizadores" | "restricoes" | "auditoria";

function AdminPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("visao");

  const me = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60_000,
  });
  const { data: level = "none" as StaffLevel } = useQuery({
    queryKey: ["staff-level", me.data?.id],
    queryFn: () => loadMyStaffLevel(me.data?.id ?? ""),
    enabled: Boolean(me.data?.id),
  });
  const manages = canManageUsers(level);
  const isAdmin = canChangeGlobalRisk(level);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: loadPlatformOverview,
    refetchInterval: 30_000,
  });
  const { data: platform } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: loadPlatformSettings,
  });
  const { data: cron } = useQuery({
    queryKey: ["cron-health"],
    queryFn: loadCronHealth,
    refetchInterval: 30_000,
  });
  const { data: audit } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => loadAuditLog(150),
  });
  const { data: restrictions } = useQuery({
    queryKey: ["admin-restrictions"],
    queryFn: loadRestrictions,
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
    void queryClient.invalidateQueries({ queryKey: ["cron-health"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-restrictions"] });
  };

  const risk = useServerFn(saveGlobalRisk);
  const limits = useMutation({
    mutationFn: (emergencyStop: boolean) =>
      risk({
        data: {
          maxLossTrade: Math.max(1, Number(maxTrade) || 1),
          maxLossDay: Math.max(1, Number(maxDay) || 1),
          emergencyStop,
          reason: "ajuste de risco global",
        },
      }),
    onSuccess: () => {
      toast.success("Configuração global atualizada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Ação não permitida"),
  });

  const credit = useServerFn(grantCredit);
  const grant = useMutation({
    mutationFn: (v: { userId: string; amount: number; reason: string }) => credit({ data: v }),
    onSuccess: () => {
      toast.success("Crédito atribuído e registado");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível atribuir crédito"),
  });

  const planFn = useServerFn(setUserPlanStaff);
  const planMut = useMutation({
    mutationFn: (v: { userId: string; plan: PlanTier; expiresAt: string | null; reason: string }) =>
      planFn({ data: v }),
    onSuccess: () => {
      toast.success("Plano atualizado e registado");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar o plano"),
  });

  const restrictFn = useServerFn(setRestriction);
  const restrict = useMutation({
    mutationFn: (v: {
      userId: string;
      kind: "automacao_pausada" | "depositos_bloqueados" | "ban_total";
      reason: string;
    }) => restrictFn({ data: v }),
    onSuccess: () => {
      toast.success("Restrição aplicada e registada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível aplicar a restrição"),
  });

  const liftFn = useServerFn(liftRestriction);
  const lift = useMutation({
    mutationFn: (v: { id: string; reason: string }) => liftFn({ data: v }),
    onSuccess: () => {
      toast.success("Restrição levantada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível levantar a restrição"),
  });

  const t = data?.totals;
  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: "visao", label: "VISÃO GERAL", visible: true },
    { id: "utilizadores", label: "UTILIZADORES", visible: manages },
    { id: "restricoes", label: "RESTRIÇÕES", visible: true },
    { id: "auditoria", label: "AUDITORIA", visible: true },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">ADMINISTRAÇÃO</h1>
          <p className="text-xs text-muted-foreground">
            Sessão com papel: <span className="text-primary">{staffLabels[level]}</span>
            {!manages && " · acesso interno limitado (sem gestão de utilizadores)"}
            {manages && !isAdmin && " · sem acesso ao risco global do sistema"}
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      <nav className="mt-4 flex flex-wrap gap-2">
        {tabs
          .filter((x) => x.visible)
          .map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`rounded-md border px-3 py-1.5 font-display text-[10px] tracking-widest ${
                tab === x.id
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {x.label}
            </button>
          ))}
      </nav>

      {tab === "visao" && (
        <>
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

          {isAdmin && (
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
                onClick={() => limits.mutate(!(platform?.emergency_stop ?? false))}
                disabled={limits.isPending || !platform}
                className={`rounded-md border px-4 py-1.5 font-display text-[11px] tracking-widest disabled:opacity-50 ${
                  platform?.emergency_stop
                    ? "border-success/50 bg-success/10 text-success hover:bg-success/20"
                    : "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20"
                }`}
              >
                {platform?.emergency_stop ? "REATIVAR AUTOMAÇÃO" : "PARAR TUDO AGORA"}
              </button>
            </section>
          )}

          <section
            className={`hud-panel mt-6 p-5 ${cron?.stale ? "border-destructive/60" : "border-success/40"}`}
          >
            <h2
              className={`mb-3 font-display text-xs tracking-widest ${cron?.stale ? "text-destructive" : "text-success"}`}
            >
              AUTOMAÇÃO 24/7 · SAÚDE DO AGENDADOR
            </h2>
            {cron?.stale ? (
              <p className="mb-3 text-xs text-destructive">
                ⚠ O bot-tick não corre com sucesso há mais de 5 minutos. A automação em segundo
                plano pode estar parada.
              </p>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">
                O agendador está a chamar o bot-tick com sucesso.
              </p>
            )}
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Endpoint</dt>
                <dd className="break-all font-mono text-[11px]">{cron?.endpoint ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Última chamada</dt>
                <dd>
                  {cron?.lastRunAt ? new Date(cron.lastRunAt).toLocaleString("pt-PT") : "—"}
                  {cron?.lastStatus != null && ` · HTTP ${cron.lastStatus}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Último sucesso</dt>
                <dd>
                  {cron?.lastOkAt ? new Date(cron.lastOkAt).toLocaleString("pt-PT") : "nunca"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Último erro</dt>
                <dd className="break-all">{cron?.lastError ?? "—"}</dd>
              </div>
            </dl>
            <ul className="mt-3 space-y-1 text-[11px]">
              {(cron?.recent ?? []).map((r) => (
                <li key={r.id} className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">
                    {new Date(r.triggeredAt).toLocaleTimeString("pt-PT")}
                  </span>
                  <span
                    className={
                      r.statusCode && r.statusCode >= 200 && r.statusCode < 300
                        ? "text-success"
                        : "text-destructive"
                    }
                  >
                    {r.statusCode != null ? `HTTP ${r.statusCode}` : (r.errorText ?? "pendente")}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {isAdmin && (
            <section className="hud-panel mt-6 p-5">
              <h2 className="mb-3 font-display text-xs tracking-widest text-primary">
                LIMITES GLOBAIS DE RISCO
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Teto aplicado a todas as contas: nenhum utilizador pode operar acima destes valores.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">
                    Perda máx. por operação (€)
                  </span>
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
                  onClick={() => limits.mutate(platform?.emergency_stop ?? false)}
                  disabled={limits.isPending}
                  className="rounded-md border border-primary/50 bg-primary/10 px-4 py-1.5 font-display text-[11px] tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  GUARDAR
                </button>
              </div>
            </section>
          )}

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
        </>
      )}

      {tab === "utilizadores" && manages && (
        <section className="hud-panel mt-6 p-5">
          <h2 className="mb-3 font-display text-xs tracking-widest text-primary">
            GESTÃO DE UTILIZADORES
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Créditos, planos e restrições exigem sempre um motivo — todas as ações ficam no registo
            de auditoria.
          </p>
          <div className="space-y-3">
            {(data?.users ?? []).map((u) => (
              <UserCard
                key={u.id}
                user={u}
                onGrant={(amount, reason) => grant.mutate({ userId: u.id, amount, reason })}
                onPlan={(plan, expiresAt, reason) =>
                  planMut.mutate({ userId: u.id, plan, expiresAt, reason })
                }
                onRestrict={(kind, reason) => restrict.mutate({ userId: u.id, kind, reason })}
              />
            ))}
          </div>
        </section>
      )}

      {tab === "restricoes" && (
        <section className="hud-panel mt-6 p-5">
          <h2 className="mb-3 font-display text-xs tracking-widest text-primary">RESTRIÇÕES</h2>
          <ul className="space-y-2 text-xs">
            {(restrictions ?? []).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2"
              >
                <span>
                  <span className={r.active ? "text-destructive" : "text-muted-foreground"}>
                    {restrictionLabels[r.kind] ?? r.kind}
                  </span>{" "}
                  · {r.reason}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {r.userId.slice(0, 8)} · {new Date(r.createdAt).toLocaleString("pt-PT")}
                </span>
                {r.active && manages && (
                  <button
                    onClick={() => {
                      const reason = window.prompt("Motivo para levantar a restrição?");
                      if (reason && reason.trim().length >= 4) lift.mutate({ id: r.id, reason });
                    }}
                    className={btnSm}
                  >
                    LEVANTAR
                  </button>
                )}
              </li>
            ))}
            {!(restrictions ?? []).length && (
              <li className="text-muted-foreground">Sem restrições registadas.</li>
            )}
          </ul>
        </section>
      )}

      {tab === "auditoria" && (
        <section className="hud-panel mt-6 p-5">
          <h2 className="mb-3 font-display text-xs tracking-widest text-primary">
            REGISTO DE AUDITORIA
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="font-display text-[10px] tracking-widest text-muted-foreground">
                <tr>
                  <th className="pb-2">QUANDO</th>
                  <th className="pb-2">AUTOR</th>
                  <th className="pb-2">AÇÃO</th>
                  <th className="pb-2">ALVO</th>
                  <th className="pb-2">MOTIVO</th>
                </tr>
              </thead>
              <tbody>
                {(audit ?? []).map((a) => (
                  <tr key={a.id} className="border-t border-border/60">
                    <td className="py-2">{new Date(a.createdAt).toLocaleString("pt-PT")}</td>
                    <td className="py-2">{a.actorName ?? a.actorId.slice(0, 8)}</td>
                    <td className="py-2 font-mono text-[11px]">{a.action}</td>
                    <td className="py-2 font-mono text-[11px]">
                      {a.targetUserId ? a.targetUserId.slice(0, 8) : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">{a.reason}</td>
                  </tr>
                ))}
                {!(audit ?? []).length && (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={5}>
                      Sem ações registadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <BottomNav />
    </main>
  );
}

function UserCard({
  user,
  onGrant,
  onPlan,
  onRestrict,
}: {
  user: {
    id: string;
    name: string;
    plan: PlanTier;
    available: number;
    pnl: number;
    isActive: boolean;
  };
  onGrant: (amount: number, reason: string) => void;
  onPlan: (plan: PlanTier, expiresAt: string | null, reason: string) => void;
  onRestrict: (
    kind: "automacao_pausada" | "depositos_bloqueados" | "ban_total",
    reason: string,
  ) => void;
}) {
  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState<PlanTier>(user.plan);
  const [expires, setExpires] = useState("");
  const [kind, setKind] = useState<"automacao_pausada" | "depositos_bloqueados" | "ban_total">(
    "automacao_pausada",
  );
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= 4;

  return (
    <div className="rounded-md border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-display text-[11px] tracking-widest">{user.name}</span>
        <span className="text-muted-foreground">
          saldo {eur(user.available)} · resultado {eur(user.pnl)} ·{" "}
          {user.isActive ? "conta ativa" : "conta desativada"}
        </span>
      </div>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (obrigatório, fica registado)"
        className={`${inputSm} mt-3 w-full`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="€ crédito"
          className={`${inputSm} w-24`}
        />
        <button
          onClick={() => {
            onGrant(Number(amount), reason);
            setAmount("");
          }}
          disabled={!ready || !amount}
          className={btnSm}
        >
          ATRIBUIR CRÉDITO
        </button>

        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as PlanTier)}
          className={inputSm}
        >
          {(Object.keys(planLabels) as PlanTier[]).map((p) => (
            <option key={p} value={p}>
              {planLabels[p]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className={inputSm}
        />
        <button
          onClick={() => onPlan(plan, expires || null, reason)}
          disabled={!ready}
          className={btnSm}
        >
          GUARDAR PLANO
        </button>

        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputSm}>
          {Object.entries(restrictionLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={() => onRestrict(kind, reason)}
          disabled={!ready}
          className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-1 font-display text-[10px] tracking-widest text-destructive hover:bg-destructive/20 disabled:opacity-50"
        >
          APLICAR RESTRIÇÃO
        </button>
      </div>
    </div>
  );
}
