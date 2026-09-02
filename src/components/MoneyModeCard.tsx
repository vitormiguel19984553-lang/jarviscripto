import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  loadRealBudget,
  loadRealReadiness,
  loadServerBot,
  saveRealBudget,
  setServerRealMode,
  startServerBot,
  stopServerBot,
  type RealBudget,
} from "@/lib/serverBot";

/**
 * Um único botão escolhe entre dinheiro totalmente simulado e dinheiro
 * totalmente real. Em modo real, as operações são executadas na conta Binance
 * do próprio utilizador com os limites definidos aqui (em USDT).
 */
export function MoneyModeCard({ userId, hours }: { userId: string; hours: number }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RealBudget | null>(null);

  const bot = useQuery({
    queryKey: ["server-bot", userId],
    queryFn: () => loadServerBot(userId),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });
  const ready = useQuery({
    queryKey: ["real-ready", userId],
    queryFn: () => loadRealReadiness(userId),
    enabled: Boolean(userId),
  });
  const budget = useQuery({
    queryKey: ["real-budget", userId],
    queryFn: () => loadRealBudget(userId),
    enabled: Boolean(userId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["server-bot", userId] });
    void qc.invalidateQueries({ queryKey: ["real-budget", userId] });
  };

  const mode = useMutation({
    mutationFn: async (real: boolean) => {
      if (real && !ready.data?.enabled) {
        throw new Error("Ativa primeiro as operações reais na página Binance.");
      }
      await setServerRealMode(userId, real);
      // Ao trocar de modo a automação para, para nunca correr com o dinheiro errado.
      await stopServerBot(userId);
    },
    onSuccess: (_d, real) => {
      toast.success(real ? "Modo DINHEIRO REAL ativo." : "Modo SIMULAÇÃO ativo.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: async (start: boolean) =>
      start ? startServerBot(userId, hours) : stopServerBot(userId),
    onSuccess: (_d, start) => {
      toast.success(start ? "Operações reais 24/7 iniciadas." : "Automação real parada.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível mudar a automação."),
  });

  const save = useMutation({
    mutationFn: (next: RealBudget) => saveRealBudget(userId, next),
    onSuccess: (saved) => {
      setDraft(saved);
      toast.success("Limites do dinheiro real guardados.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível guardar os limites."),
  });

  const real = Boolean(bot.data?.real_mode);
  const active =
    Boolean(bot.data?.auto_run) &&
    Boolean(bot.data?.run_until && new Date(bot.data.run_until).getTime() > Date.now());
  const value = draft ?? budget.data ?? null;
  const set = (patch: Partial<RealBudget>) => value && setDraft({ ...value, ...patch });

  const fields: { key: keyof RealBudget; label: string; hint: string }[] = [
    { key: "tradeAmount", label: "Valor por operação (USDT)", hint: "mínimo 5 · máximo 5000" },
    {
      key: "maxLossTrade",
      label: "Perda máx. por operação (USDT)",
      hint: "nunca acima do valor por operação",
    },
    { key: "maxLossDay", label: "Perda máx. por dia (USDT)", hint: "ao atingir, a automação para" },
  ];

  return (
    <section className={`hud-panel p-5 ${real ? "border-destructive/50" : ""}`}>
      <h2 className="text-sm tracking-widest text-primary">MODO DO DINHEIRO</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Um botão só: ou tudo simulado, ou tudo real na tua Binance. O Cripto Jarvis nunca guarda
        nem retira os teus fundos.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => mode.mutate(false)}
          aria-pressed={!real}
          disabled={mode.isPending}
          className={`hud-btn px-3 py-2.5 text-[11px] ${!real ? "hud-btn-primary" : "hud-btn-ghost"}`}
        >
          SIMULAÇÃO
        </button>
        <button
          onClick={() => mode.mutate(true)}
          aria-pressed={real}
          disabled={mode.isPending}
          className={`hud-btn px-3 py-2.5 text-[11px] ${real ? "hud-btn-danger" : "hud-btn-ghost"}`}
        >
          DINHEIRO REAL
        </button>
      </div>

      {!ready.data?.enabled && (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Para usar dinheiro real precisas da conta verificada e das operações reais ativadas em{" "}
          <Link to="/binance" className="text-primary underline">
            Binance
          </Link>
          .
        </p>
      )}

      {real && (
        <>
          <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Saldo real verificado
            </p>
            <p className="font-display text-xl text-glow">
              {(ready.data?.balance ?? 0).toFixed(2)} USDT
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Estado da automação real: {active ? "ATIVA" : "PARADA"}
              {bot.data?.last_tick_at
                ? ` · último ciclo ${new Date(bot.data.last_tick_at).toLocaleTimeString("pt-PT")}`
                : ""}
            </p>
          </div>

          {value && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    {f.label}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={value[f.key]}
                    onChange={(e) =>
                      set({ [f.key]: Number(e.target.value) } as Partial<RealBudget>)
                    }
                    className="mt-1 w-full rounded-md border border-border bg-secondary/60 px-3 py-2 font-display text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="mt-1 block text-[10px] text-muted-foreground">{f.hint}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => value && save.mutate(value)}
              disabled={save.isPending || !value}
              className="hud-btn hud-btn-ghost px-3 py-2.5 text-[11px]"
            >
              {save.isPending ? "A GUARDAR…" : "GUARDAR LIMITES"}
            </button>
            <button
              onClick={() => run.mutate(!active)}
              disabled={run.isPending}
              className={`hud-btn px-3 py-2.5 text-[11px] ${active ? "hud-btn-danger" : "hud-btn-primary"}`}
            >
              {active ? "PARAR REAIS" : `INICIAR REAIS · ${hours}H`}
            </button>
          </div>
          {(ready.data?.balance ?? 0) < (value?.tradeAmount ?? 5) && (
            <p className="mt-3 text-[11px] text-destructive">
              O saldo real ({(ready.data?.balance ?? 0).toFixed(2)} USDT) é inferior ao valor por
              operação. Adiciona saldo na Binance ou reduz o valor por operação.
            </p>
          )}
        </>
      )}
    </section>
  );
}
