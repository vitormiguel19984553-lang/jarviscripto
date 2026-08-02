import { Link } from "@tanstack/react-router";

const items = [
  { to: "/dashboard", label: "PAINEL" },
  { to: "/chat", label: "JARVIS IA" },
  { to: "/relatorios", label: "RELATÓRIOS" },
  { to: "/alertas", label: "ALERTAS" },
  { to: "/backtest", label: "BACKTEST" },
  { to: "/planos", label: "PLANOS" },
] as const;


export function JarvisNav() {
  return (
    <nav className="-mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:w-auto sm:overflow-visible sm:pb-0">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-display text-[11px] tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{
            className:
              "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-display text-[11px] tracking-widest border border-primary/50 bg-primary/10 text-primary",
          }}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
