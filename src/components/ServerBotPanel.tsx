import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loadServerBot, startServerBot, stopServerBot } from "@/lib/serverBot";

export function ServerBotPanel({
  userId,
  hours = [6, 12, 24, 72],
  planLabel,
}: {
  userId: string;
  hours?: number[];
  planLabel?: string;
}) {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["server-bot", userId],
    queryFn: () => loadServerBot(userId),
    refetchInterval: 30_000,
  });

  const s = state.data;
  const active = !!s?.auto_run && !!s.run_until && new Date(s.run_until) > new Date();

  const refresh = () => qc.invalidateQueries({ queryKey: ["server-bot", userId] });

  const start = async (hours: number) => {
    try {
      await startServerBot(userId, hours);
      await refresh();
      toast.success(`Automação no servidor ligada por ${hours}h.`);
    } catch {
      toast.error("Não foi possível ligar a automação no servidor.");
    }
  };

  const stop = async () => {
    try {
      await stopServerBot(userId);
      await refresh();
      toast.success("Automação no servidor desligada.");
    } catch {
      toast.error("Não foi possível desligar a automação.");
    }
  };

  return (
    <section className="hud-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm tracking-widest text-primary">AUTOMAÇÃO 24/7 (SERVIDOR)</h2>
        <span className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1">
          <span
            className={`size-2 rounded-full ${active ? "bg-success" : "bg-muted-foreground"}`}
          />
          <span className="font-display text-[10px] tracking-widest">
            {active ? "A CORRER" : "PARADA"}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        O Jarvis continua a analisar e a operar mesmo com o browser fechado, usando as tuas moedas
        e limites de risco. Modo atual: {s?.real_mode ? "DINHEIRO REAL · BINANCE" : "SIMULAÇÃO"}.
        {planLabel ? ` Duração máxima do plano ${planLabel}: ${hours[hours.length - 1]}h.` : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {hours.map((h) => (
          <button
            key={h}
            onClick={() => start(h)}
            className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 font-display text-xs text-primary hover:bg-primary/20"
          >
            LIGAR {h}H
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {active && s?.run_until
            ? `Até ${new Date(s.run_until).toLocaleString("pt-PT")}`
            : "Sem sessão agendada."}
          {s?.last_tick_at
            ? ` · última execução ${new Date(s.last_tick_at).toLocaleTimeString("pt-PT")}`
            : ""}
        </p>
        <button
          onClick={stop}
          disabled={!active}
          className="rounded-md border border-destructive/60 bg-destructive/15 px-3 py-2 font-display text-xs text-destructive hover:bg-destructive/25 disabled:opacity-40"
        >
          DESLIGAR
        </button>
      </div>
    </section>
  );
}
