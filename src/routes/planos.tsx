import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos e Preços — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Compara os planos do Cripto Jarvis: Explorador gratuito, Pro com automação contínua e backtesting avançado, e Elite com relatórios completos e prioridade da IA.",
      },
      { property: "og:title", content: "Planos e Preços — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Escolhe o plano certo para a tua estratégia de trading simulado com IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Planos,
});

type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
};

const plans: Plan[] = [
  {
    id: "explorador",
    name: "EXPLORADOR",
    price: "0 €",
    period: "para sempre",
    tagline: "Conhece a IA sem compromisso.",
    features: [
      "Sinais da IA em 4 moedas",
      "Carteira simulada de 1 000 €",
      "Histórico dos últimos 30 dias",
      "Automação até 30 minutos por sessão",
      "Relatório diário",
    ],
  },
  {
    id: "pro",
    name: "PRO",
    price: "12 €",
    period: "por mês",
    tagline: "Para quem quer testar estratégias a sério.",
    highlight: true,
    features: [
      "Sinais da IA em todas as moedas seguidas",
      "Carteira simulada de 25 000 €",
      "Histórico completo e ilimitado",
      "Automação sem limite de duração",
      "Backtesting com parâmetros ajustáveis",
      "Relatórios diários, semanais e mensais",
    ],
  },
  {
    id: "elite",
    name: "ELITE",
    price: "29 €",
    period: "por mês",
    tagline: "Máximo controlo e análise avançada.",
    features: [
      "Tudo o que o Pro inclui",
      "Várias carteiras em paralelo",
      "Perfis de risco personalizados",
      "Exportação de relatórios em CSV",
      "Alertas por email em cada operação",
      "Prioridade nos pedidos à IA",
    ],
  },
];

function Planos() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl text-glow sm:text-3xl">PLANOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolhe o nível de acesso ao Cripto Jarvis · tudo em modo simulação
          </p>
        </div>
        <Link
          to="/"
          className="rounded-md border border-border bg-secondary/60 px-4 py-2 font-display text-[11px] tracking-widest hover:bg-secondary"
        >
          VOLTAR
        </Link>
      </header>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <article
            key={p.id}
            className={`hud-panel relative flex flex-col p-6 ${
              p.highlight ? "border-primary/60 ring-1 ring-primary/30" : ""
            }`}
          >
            {p.highlight && (
              <span className="absolute -top-3 left-6 rounded-full border border-primary/50 bg-background px-3 py-0.5 font-display text-[10px] tracking-widest text-primary">
                MAIS ESCOLHIDO
              </span>
            )}
            <h2 className="font-display text-sm tracking-widest text-primary">{p.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
            <p className="mt-4 font-display text-3xl text-glow">{p.price}</p>
            <p className="text-[11px] tracking-widest text-muted-foreground">{p.period}</p>

            <ul className="mt-5 flex-1 space-y-2 text-[13px] text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-primary">▸</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled
              className={`mt-6 cursor-not-allowed rounded-md px-4 py-2 font-display text-[11px] tracking-widest opacity-70 ${
                p.highlight
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary/60"
              }`}
            >
              {p.price === "0 €" ? "PLANO ATUAL" : "EM BREVE"}
            </button>
          </article>
        ))}
      </section>

      <p className="mt-8 pb-4 text-center text-xs text-muted-foreground">
        Os pagamentos ainda não estão ativos — esta página apresenta os planos previstos. Nenhum
        valor é cobrado e todas as operações continuam simuladas.
      </p>
    </main>
  );
}
