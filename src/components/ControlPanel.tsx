import { useState } from "react";
import type { useJarvis } from "@/lib/useJarvis";
import { eur } from "@/lib/market";
import { AGGRESSION_LIST, aggressionProfiles } from "@/lib/aggression";
import { loadFeedback, pulseFeedback, saveFeedback } from "@/lib/feedback";
import { useQuery } from "@tanstack/react-query";
import { loadServerBot } from "@/lib/serverBot";
import { MoneyModeCard } from "@/components/MoneyModeCard";

type Engine = ReturnType<typeof useJarvis>;

/** Som e vibração nos alertas — guardado neste dispositivo. */
function FeedbackToggles() {
  const [prefs, setPrefs] = useState(loadFeedback);
  const set = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveFeedback(next);
    pulseFeedback("alert", next);
  };
  return (
    <div className="mt-4 rounded-md border border-border bg-secondary/30 p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
        Retorno nos alertas
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => set({ sound: !prefs.sound })}
          aria-pressed={prefs.sound}
          className={`hud-btn px-2 py-2 text-[10px] ${prefs.sound ? "hud-btn-primary" : "hud-btn-ghost"}`}
        >
          SOM {prefs.sound ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => set({ haptics: !prefs.haptics })}
          aria-pressed={prefs.haptics}
          className={`hud-btn px-2 py-2 text-[10px] ${prefs.haptics ? "hud-btn-primary" : "hud-btn-ghost"}`}
        >
          VIBRAÇÃO {prefs.haptics ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border bg-secondary/60 px-3 py-2 font-display text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

const fmtTime = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function ControlPanel({
  engine,
  selectedCount,
  userId,
}: {
  engine: Engine;
  selectedCount: number;
  userId: string;
}) {
  const bot = useQuery({
    queryKey: ["server-bot", userId],
    queryFn: () => loadServerBot(userId),
    enabled: Boolean(userId),
  });
  const realMode = Boolean(bot.data?.real_mode);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MoneyModeCard userId={userId} hours={engine.durationHours} />

      <section className="hud-panel p-5">
        <h2 className="text-sm tracking-widest text-primary">AUTOMAÇÃO</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedCount} de {engine.limits.maxCoins} moeda(s) · plano {engine.limits.label}
        </p>

        <div className="mt-4">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Modo da IA
          </span>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {AGGRESSION_LIST.map((m) => {
              const p = aggressionProfiles[m];
              const on = engine.aggression === m;
              return (
                <button
                  key={m}
                  onClick={() => engine.setAggression(m)}
                  aria-pressed={on}
                  className={`rounded-md border px-2 py-2 font-display text-[10px] tracking-widest transition-all ${
                    on
                      ? "border-primary/70 bg-primary/15 text-primary shadow-[0_0_18px_-6px_var(--primary)]"
                      : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {aggressionProfiles[engine.aggression].description} O limite de perda diária aplica-se
            em qualquer modo.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {engine.limits.clientHours.map((h) => (
            <button
              key={h}
              onClick={() => engine.setDurationHours(h)}
              className={`flex-1 rounded-md border px-3 py-2 font-display text-xs transition-colors ${
                engine.durationHours === h
                  ? "border-primary/70 bg-primary/15 text-primary"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {h}H
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Tempo restante
          </p>
          <p className="font-display text-2xl text-glow">{fmtTime(engine.remaining)}</p>
        </div>

        {realMode && (
          <p className="mt-3 text-[11px] leading-snug text-destructive">
            Modo DINHEIRO REAL ativo: o botão abaixo liga/desliga as ordens reais na tua Binance
            durante {engine.durationHours}H.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (realMode) {
                realRun.mutate(!realActive);
                return;
              }
              engine.running ? engine.setRunning(false) : engine.start();
            }}
            disabled={realMode ? realRun.isPending : !selectedCount}
            className={`hud-btn px-3 py-2.5 text-xs ${
              realMode && realActive ? "hud-btn-danger" : "hud-btn-primary"
            }`}
          >
            {realMode
              ? realActive
                ? "PARAR REAIS"
                : `ATIVAR IA (REAL) · ${engine.durationHours}H`
              : engine.running
                ? "PAUSAR"
                : "ATIVAR IA (SIMULAÇÃO)"}
          </button>
          <button
            onClick={() => {
              engine.stopAll();
              if (realMode) realRun.mutate(false);
            }}
            className="hud-btn hud-btn-danger px-3 py-2.5 text-xs"
          >
            PARAGEM DE EMERGÊNCIA
          </button>
        </div>

        {engine.halted && (
          <p className="mt-3 text-xs text-destructive">
            Automação desligada. Verifica os limites de risco antes de reativar.
          </p>
        )}
      </section>

      <section className="hud-panel p-5">
        <h2 className="text-sm tracking-widest text-primary">GESTÃO DE RISCO · SIMULAÇÃO</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {realMode
            ? "Estás em DINHEIRO REAL: as operações usam os limites em USDT do cartão MODO DO DINHEIRO."
            : "Limites da carteira virtual, em euros de simulação."}
        </p>
        <div className="mt-4 space-y-3">
          <Field
            label="Investimento mínimo (€)"
            value={engine.risk.minTrade}
            onChange={(v) => engine.setRisk({ ...engine.risk, minTrade: v })}
          />
          <Field
            label="Perda máx. por operação (€)"
            value={engine.risk.maxLossPerTrade}
            onChange={(v) => engine.setRisk({ ...engine.risk, maxLossPerTrade: v })}
          />
          <Field
            label="Perda máx. diária (€)"
            value={engine.risk.maxLossPerDay}
            onChange={(v) => engine.setRisk({ ...engine.risk, maxLossPerDay: v })}
          />
        </div>
      </section>

      <section className="hud-panel p-5">
        <h2 className="text-sm tracking-widest text-primary">PROTEÇÕES DE ORDEM</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada ordem fecha automaticamente na primeira proteção acionada.
        </p>
        <div className="mt-4 space-y-3">
          <Field
            label="Take profit (%)"
            value={engine.protection.takeProfitPct}
            onChange={(v) => engine.setProtection({ ...engine.protection, takeProfitPct: v })}
          />
          <Field
            label="Stop loss (%)"
            value={engine.protection.stopLossPct}
            onChange={(v) => engine.setProtection({ ...engine.protection, stopLossPct: v })}
          />
          <Field
            label="Trailing stop (%) · 0 desliga"
            value={engine.protection.trailingStopPct}
            onChange={(v) => engine.setProtection({ ...engine.protection, trailingStopPct: v })}
          />
        </div>
      </section>

      <section className="hud-panel p-5">
        <h2 className="text-sm tracking-widest text-primary">CARTEIRAS</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O dinheiro de simulação e o saldo real da tua Binance estão separados no separador
          CARTEIRAS.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Simulação · disponível
            </p>
            <p className="font-display text-lg">{eur(engine.available)}</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Simulação · investido
            </p>
            <p className="font-display text-lg text-glow">{eur(engine.invested)}</p>
          </div>
        </div>

        <FeedbackToggles />
      </section>
    </div>
  );
}
