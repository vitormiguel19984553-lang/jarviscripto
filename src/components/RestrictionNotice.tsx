import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadMyRestrictions, restrictionLabels } from "@/lib/staff";

/**
 * Mostra ao utilizador, de forma clara, quando a conta está restringida ou
 * bloqueada pela equipa — com o motivo registado pelo staff.
 */
export function RestrictionNotice() {
  const user = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60_000,
  });
  const userId = user.data?.id ?? "";
  const { data } = useQuery({
    queryKey: ["my-restrictions", userId],
    queryFn: () => loadMyRestrictions(userId),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });

  const active = data ?? [];
  if (!active.length) return null;
  const ban = active.find((r) => r.kind === "ban_total");

  if (ban) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6">
        <div className="hud-panel max-w-md border-destructive/60 p-6 text-center">
          <h2 className="font-display text-sm tracking-widest text-destructive">
            ACESSO BLOQUEADO
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            A tua conta está bloqueada pela equipa do Cripto Jarvis.
          </p>
          <p className="mt-2 text-xs">
            Motivo: <span className="text-foreground">{ban.reason}</span>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Esta decisão é reversível — contacta o suporte para rever o caso.
          </p>
          <button
            onClick={() => void supabase.auth.signOut()}
            className="mt-4 rounded-md border border-border px-4 py-1.5 font-display text-[11px] tracking-widest"
          >
            TERMINAR SESSÃO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
      <div className="hud-panel border-warning/50 p-4">
        <p className="font-display text-[11px] tracking-widest text-warning">CONTA RESTRINGIDA</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {active.map((r) => (
            <li key={r.id}>
              • {restrictionLabels[r.kind] ?? r.kind} — {r.reason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
