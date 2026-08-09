import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyse, eur, pct, type Coin, type Signal } from "@/lib/market";
import type { TradeLog } from "@/lib/useJarvis";
import { patternFor } from "@/lib/brain";
import { supabase } from "@/integrations/supabase/client";

type NodeData = {
  coin: Coin;
  signal: Signal;
  x: number;
  y: number;
  pnl: number;
  trades: number;
  radius: number;
};

const SIZE = 420;
const CENTER = SIZE / 2;

const toneFor = (a: Signal["action"]) =>
  a === "COMPRAR" ? "var(--success)" : a === "VENDER" ? "var(--destructive)" : "var(--warning)";

/**
 * Mapa mental do Jarvis: nó central (cérebro) ligado a cada moeda analisada.
 * As ligações animam quando existe sinal ativo; a cor e o tamanho do nó
 * refletem a confiança e o resultado acumulado.
 */
export function MindMap({
  coins,
  logs,
  running,
  userId,
}: {
  coins: Coin[];
  logs: TradeLog[];
  running: boolean;
  userId: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const memory = useQuery({
    queryKey: ["mapa-memoria", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ia_memoria")
        .select("pattern_key,description,trades,wins,losses,total_pnl,confidence_penalty")
        .eq("user_id", userId)
        .limit(200);
      return data ?? [];
    },
    refetchInterval: 90_000,
  });

  const opinions = useQuery({
    queryKey: ["mapa-pareceres", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ia_pareceres")
        .select("symbol,model,verdict,rationale,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      return data ?? [];
    },
    refetchInterval: 90_000,
  });

  const nodes = useMemo<NodeData[]>(() => {
    const n = coins.length || 1;
    return coins.map((coin, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const signal = analyse(coin);
      const symbol = coin.symbol.toUpperCase();
      const own = logs.filter((l) => l.symbol === symbol && l.amount > 0);
      const pnl = own.reduce((a, l) => a + l.pnl, 0);
      const radius = 16 + (signal.confidence / 100) * 14;
      return {
        coin,
        signal,
        pnl: Number(pnl.toFixed(2)),
        trades: own.length,
        radius,
        x: CENTER + Math.cos(angle) * 150,
        y: CENTER + Math.sin(angle) * 150,
      };
    });
  }, [coins, logs]);

  useEffect(() => {
    if (activeId && !nodes.some((n) => n.coin.id === activeId)) setActiveId(null);
  }, [nodes, activeId]);

  const active = nodes.find((n) => n.coin.id === activeId) ?? null;

  const activeMemory = useMemo(() => {
    if (!active) return null;
    const key = patternFor(active.signal, active.coin).key;
    return (memory.data ?? []).find((m) => m.pattern_key === key) ?? null;
  }, [active, memory.data]);

  const activeOpinion = useMemo(() => {
    if (!active) return null;
    const symbol = active.coin.symbol.toUpperCase();
    return (opinions.data ?? []).find((o) => o.symbol === symbol) ?? null;
  }, [active, opinions.data]);

  const select = (id: string) => {
    setActiveId(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest" }));
  };

  const activeSignals = nodes.filter((n) => n.signal.action !== "AGUARDAR").length;

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="hud-panel hud-particles overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm tracking-widest text-primary">MAPA MENTAL DA IA</h2>
          <span className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-2.5 py-1 font-display text-[10px] tracking-widest text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${running ? "live-dot bg-success" : "bg-muted-foreground"}`}
            />
            {activeSignals} SINAL(IS) ATIVO(S)
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Toca num nó para ver o raciocínio por trás da última decisão.
        </p>

        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mt-3 w-full"
          role="img"
          aria-label="Mapa das moedas analisadas pela IA"
        >
          <defs>
            <radialGradient id="brainGlow">
              <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity="0.95" />
              <stop offset="70%" stopColor="var(--primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {nodes.map((n) => {
            const live = n.signal.action !== "AGUARDAR";
            const tone = toneFor(n.signal.action);
            return (
              <g key={`edge-${n.coin.id}`}>
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={n.x}
                  y2={n.y}
                  stroke={live ? tone : "var(--border)"}
                  strokeWidth={live ? 1.8 : 1}
                  strokeOpacity={live ? 0.85 : 0.4}
                  strokeDasharray={live ? "8 10" : "3 8"}
                  style={
                    live && running
                      ? { animation: "hud-dash 2.4s linear infinite" }
                      : undefined
                  }
                />
              </g>
            );
          })}

          <circle cx={CENTER} cy={CENTER} r={66} fill="url(#brainGlow)" />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={34}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth={1.6}
          />
          <text
            x={CENTER}
            y={CENTER - 2}
            textAnchor="middle"
            fill="var(--primary)"
            style={{ font: "600 13px var(--font-display)", letterSpacing: "0.1em" }}
          >
            JARVIS
          </text>
          <text
            x={CENTER}
            y={CENTER + 13}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            style={{ font: "500 9px var(--font-sans)", letterSpacing: "0.12em" }}
          >
            CÉREBRO
          </text>

          {nodes.map((n) => {
            const tone = toneFor(n.signal.action);
            const on = n.coin.id === activeId;
            return (
              <g
                key={n.coin.id}
                onClick={() => select(n.coin.id)}
                role="button"
                tabIndex={0}
                aria-label={`${n.coin.name}: ${n.signal.action}, confiança ${n.signal.confidence}%`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") select(n.coin.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.radius + (on ? 9 : 6)}
                  fill={tone}
                  opacity={on ? 0.28 : 0.12}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.radius}
                  fill="var(--card)"
                  stroke={n.pnl === 0 ? tone : n.pnl > 0 ? "var(--success)" : "var(--destructive)"}
                  strokeWidth={on ? 2.6 : 1.6}
                />
                <text
                  x={n.x}
                  y={n.y + 3.5}
                  textAnchor="middle"
                  fill="var(--foreground)"
                  style={{ font: "600 9px var(--font-display)", letterSpacing: "0.06em" }}
                >
                  {n.coin.symbol.toUpperCase()}
                </text>
                <text
                  x={n.x}
                  y={n.y + n.radius + 13}
                  textAnchor="middle"
                  fill={tone}
                  style={{ font: "500 8.5px var(--font-sans)", letterSpacing: "0.1em" }}
                >
                  {n.signal.confidence}%
                </text>
              </g>
            );
          })}
        </svg>

        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" /> compra
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" /> venda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" /> em espera
          </span>
          <span>tamanho = confiança · contorno = resultado acumulado</span>
        </div>
      </div>

      <div ref={detailRef} className="hud-panel anim-rise p-4 sm:p-5">
        {!active && (
          <div className="flex h-full min-h-40 flex-col justify-center text-center">
            <p className="font-display text-xs tracking-widest text-primary">DETALHE DO NÓ</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Seleciona uma moeda no mapa para ver os indicadores cruzados, a memória da IA e o
              parecer da segunda IA.
            </p>
          </div>
        )}

        {active && (
          <div className="anim-pop">
            <div className="flex items-center gap-3">
              <img
                src={active.coin.image}
                alt={active.coin.name}
                className="size-8 rounded-full"
                loading="lazy"
              />
              <div className="min-w-0">
                <p className="font-display text-sm">{active.coin.symbol.toUpperCase()}</p>
                <p className="truncate text-[11px] text-muted-foreground">{active.coin.name}</p>
              </div>
              <span
                className="ml-auto rounded-full border px-2.5 py-0.5 font-display text-[10px] tracking-widest"
                style={{
                  color: toneFor(active.signal.action),
                  borderColor: toneFor(active.signal.action),
                }}
              >
                {active.signal.action}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border bg-secondary/40 p-2">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Preço</p>
                <p className="font-display text-[11px]">{eur(active.coin.current_price)}</p>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 p-2">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground">24H</p>
                <p
                  className={`font-display text-[11px] ${
                    (active.coin.price_change_percentage_24h ?? 0) >= 0
                      ? "text-success"
                      : "text-destructive"
                  }`}
                >
                  {pct(active.coin.price_change_percentage_24h)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 p-2">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Resultado
                </p>
                <p
                  className={`font-display text-[11px] ${
                    active.pnl >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {active.pnl >= 0 ? "+" : ""}
                  {active.pnl.toFixed(2)}€
                </p>
              </div>
            </div>

            <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              Indicadores cruzados ({active.signal.agree} a favor · {active.signal.against} contra)
            </p>
            <ul className="mt-1.5 space-y-1">
              {active.signal.checks.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between gap-2 rounded border border-border/60 bg-secondary/30 px-2 py-1 text-[11px]"
                >
                  <span className="text-muted-foreground">{c.name}</span>
                  <span
                    className={
                      c.verdict === "alta"
                        ? "text-success"
                        : c.verdict === "baixa"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {c.value}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              Horizontes
            </p>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {active.signal.timeframes.map((t) => (
                <div
                  key={t.label}
                  className="rounded border border-border/60 bg-secondary/30 p-1.5 text-center"
                >
                  <p className="font-display text-[9px] tracking-widest text-muted-foreground">
                    {t.label}
                  </p>
                  <p
                    className={`text-[10px] ${
                      t.trend === "alta"
                        ? "text-success"
                        : t.trend === "baixa"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {t.changePct >= 0 ? "+" : ""}
                    {t.changePct}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">RSI {t.rsi}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-primary">Memória da IA</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {activeMemory
                  ? `${activeMemory.description}: ${activeMemory.trades} operações, ${activeMemory.wins} acertos, ${activeMemory.losses} perdas, resultado ${Number(activeMemory.total_pnl).toFixed(2)}€ (penalização ${Number(activeMemory.confidence_penalty).toFixed(0)} pts).`
                  : "Padrão ainda sem histórico registado — a IA vai memorizá-lo na próxima operação."}
              </p>
            </div>

            {activeOpinion && (
              <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 p-2.5">
                <p className="text-[10px] uppercase tracking-widest text-accent">
                  2ª IA · {activeOpinion.verdict}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {activeOpinion.rationale}
                </p>
              </div>
            )}

            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              {active.signal.reason}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
