import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  MoreHorizontal,
  Star,
  X,
} from "lucide-react";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { supabase } from "@/integrations/supabase/client";
import { loadMyStaffLevel } from "@/lib/staff";

const items = [
  { to: "/dashboard", label: "Painel", Icon: LayoutDashboard },
  { to: "/chat", label: "Jarvis", Icon: MessageSquare },
  { to: "/watchlist", label: "Favoritos", Icon: Star },
  { to: "/relatorios", label: "Relatórios", Icon: LineChart },
  { to: "/alertas", label: "Alertas", Icon: Bell },
] as const;

/** Tudo o que antes só aparecia no menu de ecrã largo. */
const moreItems = [
  { to: "/backtest", label: "BACKTEST" },
  { to: "/binance", label: "BINANCE · CARTEIRA REAL" },
  { to: "/conta", label: "CONTA E VERIFICAÇÃO" },
  { to: "/planos", label: "PLANOS" },
  { to: "/relatorios", label: "RELATÓRIOS" },
  { to: "/watchlist", label: "WATCHLIST" },
  { to: "/alertas", label: "ALERTAS" },
] as const;

/** Barra de navegação inferior fixa — só em ecrãs pequenos. */
export function BottomNav() {
  // Com o teclado do telemóvel aberto, a barra encosta ao topo do teclado em
  // vez de ficar escondida atrás dele.
  const { open, offset } = useKeyboardOpen();
  const [menu, setMenu] = useState(false);

  const { data: isStaff } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return false;
      return (await loadMyStaffLevel(data.user.id)) !== "none";
    },
    staleTime: 5 * 60_000,
  });

  return (
    <>
      {menu && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur md:hidden"
          role="dialog"
          aria-label="Mais opções"
          onClick={() => setMenu(false)}
        >
          <div
            className="absolute inset-x-3 bottom-24 rounded-lg border border-border bg-card p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="font-display text-[11px] tracking-widest text-primary">MAIS OPÇÕES</p>
              <button onClick={() => setMenu(false)} aria-label="Fechar menu">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {moreItems.map((i) => (
                <li key={i.label}>
                  <Link
                    to={i.to}
                    onClick={() => setMenu(false)}
                    className="block rounded-md border border-border bg-secondary/50 px-3 py-3 text-center font-display text-[10px] tracking-widest text-muted-foreground"
                    activeProps={{ className: "text-primary border-primary/60 bg-primary/10" }}
                  >
                    {i.label}
                  </Link>
                </li>
              ))}
              {isStaff && (
                <li>
                  <Link
                    to="/admin"
                    onClick={() => setMenu(false)}
                    className="block rounded-md border border-border bg-secondary/50 px-3 py-3 text-center font-display text-[10px] tracking-widest text-muted-foreground"
                    activeProps={{ className: "text-primary border-primary/60 bg-primary/10" }}
                  >
                    ADMIN
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur transition-[bottom] duration-200 md:hidden"
        style={{
          bottom: open ? offset : 0,
          paddingBottom: open ? 0 : "env(safe-area-inset-bottom)",
        }}
      >
        <ul className="grid grid-cols-6">
          {items.map(({ to, label, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1 py-2.5 text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary drop-shadow-[0_0_10px_var(--primary)]" }}
              >
                <Icon className="size-5" aria-hidden />
                <span className="font-display text-[10px] tracking-widest">{label}</span>
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              className={`flex w-full flex-col items-center gap-1 py-2.5 ${menu ? "text-primary" : "text-muted-foreground"}`}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              <span className="font-display text-[10px] tracking-widest">Mais</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
