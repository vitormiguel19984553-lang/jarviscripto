import { Link } from "@tanstack/react-router";
import { Bell, LayoutDashboard, LineChart, MessageSquare, Star } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Painel", Icon: LayoutDashboard },
  { to: "/chat", label: "Jarvis", Icon: MessageSquare },
  { to: "/watchlist", label: "Favoritos", Icon: Star },
  { to: "/relatorios", label: "Relatórios", Icon: LineChart },
  { to: "/alertas", label: "Alertas", Icon: Bell },
] as const;

/** Barra de navegação inferior fixa — só em ecrãs pequenos. */
export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-muted-foreground transition-colors"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="size-5" aria-hidden />
              <span className="font-display text-[10px] tracking-widest">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
