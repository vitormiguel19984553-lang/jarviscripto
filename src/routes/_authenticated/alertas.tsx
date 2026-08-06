import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";
import {
  clearAlerts,
  listAlerts,
  loadAlertSettings,
  markAllRead,
  saveAlertSettings,
  type AlertSettings,
} from "@/lib/alerts";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas e Notificações — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Define quando o Cripto Jarvis te avisa: execuções de ordens simuladas, limites de risco atingidos e resumos por email.",
      },
      { property: "og:title", content: "Alertas e Notificações — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Configura avisos de ordens e de limites de risco do teu bot simulado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertasPage,
});

function AlertasPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ["alert-settings", user.id],
    queryFn: () => loadAlertSettings(user.id),
  });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: listAlerts });

  const update = async (patch: Partial<AlertSettings>) => {
    try {
      await saveAlertSettings(user.id, patch);
      await qc.invalidateQueries({ queryKey: ["alert-settings", user.id] });
    } catch {
      toast.error("Não foi possível guardar as preferências.");
    }
  };

  const s = settings.data;
  const unread = (alerts.data ?? []).filter((a) => !a.read).length;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">ALERTAS</h1>
          <p className="text-xs text-muted-foreground">
            {unread > 0 ? `${unread} alerta(s) sem ler` : "Sem alertas novos"}
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="hud-panel h-fit p-5">
          <h2 className="font-display text-[11px] tracking-widest text-muted-foreground">
            PREFERÊNCIAS
          </h2>
          {!s ? (
            <p className="mt-3 text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <div className="mt-4 space-y-4">
              <Toggle
                label="Avisar quando uma ordem é executada"
                checked={s.on_trade}
                onChange={(v) => update({ on_trade: v })}
              />
              <Toggle
                label="Avisar quando um limite de risco é atingido"
                checked={s.on_risk_halt}
                onChange={(v) => update({ on_risk_halt: v })}
              />
              <div>
                <label className="text-xs text-muted-foreground">
                  Só avisar acima de {s.min_pnl.toFixed(0)}€ de resultado
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={s.min_pnl}
                  onChange={(e) => update({ min_pnl: Number(e.target.value) })}
                  className="mt-2 w-full accent-primary"
                />
              </div>
              <Toggle
                label="Enviar também por email"
                checked={s.email_enabled}
                onChange={(v) => update({ email_enabled: v })}
              />
              <p className="rounded-md border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                O envio por email exige um domínio próprio configurado. Enquanto isso não estiver
                pronto, os alertas ficam guardados aqui na cloud.
              </p>
            </div>
          )}
        </section>

        <section className="hud-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[11px] tracking-widest text-muted-foreground">
              HISTÓRICO
            </h2>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await markAllRead();
                  qc.invalidateQueries({ queryKey: ["alerts"] });
                }}
                className="rounded-md border border-border px-3 py-1.5 font-display text-[10px] tracking-widest text-muted-foreground hover:text-foreground"
              >
                MARCAR LIDOS
              </button>
              <button
                onClick={async () => {
                  await clearAlerts();
                  qc.invalidateQueries({ queryKey: ["alerts"] });
                }}
                className="rounded-md border border-border px-3 py-1.5 font-display text-[10px] tracking-widest text-muted-foreground hover:text-destructive"
              >
                LIMPAR
              </button>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {(alerts.data ?? []).length === 0 && (
              <li className="text-sm text-muted-foreground">
                Ainda não há alertas. Liga a automação no painel para começar a receber avisos.
              </li>
            )}
            {(alerts.data ?? []).map((a) => (
              <li
                key={a.id}
                className={`rounded-md border p-3 ${
                  a.read ? "border-border bg-secondary/30" : "border-primary/40 bg-primary/5"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pt-PT")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <BottomNav />
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}
