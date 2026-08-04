import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/admin";

const items = [
  { to: "/dashboard", label: "PAINEL" },
  { to: "/chat", label: "JARVIS IA" },
  { to: "/watchlist", label: "WATCHLIST" },
  { to: "/relatorios", label: "RELATÓRIOS" },
  { to: "/alertas", label: "ALERTAS" },
  { to: "/backtest", label: "BACKTEST" },
  { to: "/planos", label: "PLANOS" },
] as const;

const linkClass =
  "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-display text-[11px] tracking-widest text-muted-foreground transition-colors hover:text-foreground";
const activeClass =
  "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-display text-[11px] tracking-widest border border-primary/50 bg-primary/10 text-primary";

export function JarvisNav() {
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return false;
      return checkIsAdmin(data.user.id);
    },
    staleTime: 5 * 60_000,
  });

  return (
    <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:w-auto sm:overflow-visible sm:pb-0">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className={linkClass} activeProps={{ className: activeClass }}>
          {i.label}
        </Link>
      ))}
      {isAdmin && (
        <Link to="/admin" className={linkClass} activeProps={{ className: activeClass }}>
          ADMIN
        </Link>
      )}
    </nav>
  );
}
