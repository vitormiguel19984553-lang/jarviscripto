import { useState } from "react";
import type { useJarvis } from "@/lib/useJarvis";
import { eur } from "@/lib/market";
import { AGGRESSION_LIST, aggressionProfiles } from "@/lib/aggression";

type Engine = ReturnType<typeof useJarvis>;

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

export function ControlPanel({ engine, selectedCount }: { engine: Engine; selectedCount: number }) {
  const [amount, setAmount] = useState(500);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => (engine.running ? engine.setRunning(false) : engine.start())}
            disabled={!selectedCount}
            className="hud-btn hud-btn-primary px-3 py-2.5 text-xs"
          >
            {engine.running ? "PAUSAR" : "ATIVAR IA"}
          </button>
          <button onClick={engine.stopAll} className="hud-btn hud-btn-danger px-3 py-2.5 text-xs">
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
        <h2 className="text-sm tracking-widest text-primary">GESTÃO DE RISCO</h2>
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
        <h2 className="text-sm tracking-widest text-primary">CARTEIRA (SIMULAÇÃO)</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Disponível
            </p>
            <p className="font-display text-lg">{eur(engine.available)}</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Investido</p>
            <p className="font-display text-lg text-glow">{eur(engine.invested)}</p>
          </div>
        </div>

        <div className="mt-4">
          <Field label="Montante (€)" value={amount} onChange={setAmount} />
        </div>

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
            onClick={() => engine.deposit(amount)}
            className="hud-btn hud-btn-accent px-3 py-2 text-xs"
          >
            DEPOSITAR
          </button>
          <button
            disabled
            aria-disabled="true"
            className="hud-btn hud-btn-ghost px-3 py-2 text-xs text-muted-foreground"
            title="Levantamentos em breve"
          >
            LEVANTAR · EM BREVE
          </button>
        </div>

        <FeedbackToggles />
      </section>
    </div>
  );
}
