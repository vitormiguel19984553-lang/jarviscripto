import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Aviso único quando o catálogo de moedas cresceu e a seleção do utilizador
 * ficou pequena: evita que a IA fique só com moedas já compradas (sem espaço
 * para abrir novas posições).
 */
export function NewCoinsNotice({
  userId,
  suggested,
  selectedCount,
  maxCoins,
  onAdd,
}: {
  userId: string;
  suggested: string[];
  selectedCount: number;
  maxCoins: number;
  onAdd: (ids: string[]) => void;
}) {
  const room = Math.max(0, maxCoins - selectedCount);
  const key = `jarvis:new-coins-notice:${userId}:${maxCoins}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(key) === "1");
  }, [key]);

  const relevant = suggested.length > 0 && room > 0 && selectedCount < maxCoins;
  if (dismissed || !relevant) return null;

  const close = () => {
    localStorage.setItem(key, "1");
    setDismissed(true);
  };

  return (
    <div className="hud-panel mb-4 flex flex-wrap items-center justify-between gap-3 border-primary/50 p-4">
      <div className="min-w-0">
        <p className="font-display text-[11px] tracking-widest text-primary">
          NOVAS MOEDAS DISPONÍVEIS
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Estás a vigiar {selectedCount} de {maxCoins} moedas permitidas. Com poucas moedas na lista,
          a IA pode ficar sem sinais de compra quando já tens todas compradas.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onAdd(suggested);
            close();
            toast.success(`Adicionadas ${Math.min(suggested.length, room)} moedas à tua seleção.`);
          }}
          className="rounded-md border border-primary/60 bg-primary/10 px-3 py-2 font-display text-[11px] tracking-widest text-primary hover:bg-primary/20"
        >
          ATUALIZAR SELEÇÃO
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-md border border-border px-3 py-2 font-display text-[10px] tracking-widest text-muted-foreground hover:text-foreground"
        >
          MAIS TARDE
        </button>
      </div>
    </div>
  );
}
