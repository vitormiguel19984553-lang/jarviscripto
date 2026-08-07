import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type ChatRequestBody = { messages?: unknown; context?: unknown; model?: unknown };

/** Multi-IA: só modelos suportados pelo gateway são aceites. */
export const CHAT_MODELS = [
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-luna",
  "google/gemini-3.6-flash",
] as const;
const DEFAULT_MODEL = "openai/gpt-5.6-sol";

const SYSTEM = `És o "Cripto Jarvis", um assistente de investimento em criptomoedas que fala sempre em português de Portugal.
Regras:
- Toda a operação da aplicação é SIMULADA (paper trading). Nunca sugiras que existe dinheiro real envolvido.
- Explicas indicadores técnicos (RSI, médias móveis, volatilidade), sinais da IA e resultados de backtesting de forma simples e directa.
- Nunca prometes lucro. Lembras o risco quando o utilizador fala em investir a sério.
- Não és consultor financeiro licenciado; para decisões reais recomendas cautela e estudo próprio.
- Respostas curtas e úteis, com listas quando ajudar.

AÇÕES NA APLICAÇÃO
Quando o utilizador pedir claramente uma ação executável, explica numa frase o que vais fazer e acrescenta no FIM da resposta, na última linha, uma diretiva neste formato exacto (uma só por resposta):
[[ACAO:{"tipo":"comprar","moeda":"bitcoin","valor":50}]]
Tipos válidos:
- {"tipo":"comprar","moeda":"<id>","valor":<euros>} e {"tipo":"vender","moeda":"<id>","valor":<euros>}
- {"tipo":"modo","modo":"passivo"|"moderado"|"agressivo"}
- {"tipo":"automacao","horas":<número>}
- {"tipo":"parar_automacao"}
Os ids de moeda válidos são: bitcoin, ethereum, solana, cardano, ripple, chainlink, avalanche-2, polkadot.
A app mostra sempre uma confirmação ao utilizador antes de executar — nunca digas que já executaste. Se faltar informação (moeda, valor ou horas), pergunta primeiro e não emitas diretiva.
Se o utilizador não pedir uma ação, não emitas nenhuma diretiva.`;


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(body.messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const context = typeof body.context === "string" ? body.context : "";
        const requested = typeof body.model === "string" ? body.model : "";
        const model = (CHAT_MODELS as readonly string[]).includes(requested)
          ? requested
          : DEFAULT_MODEL;
        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway(model),
          system: context ? `${SYSTEM}\n\nContexto actual do utilizador:\n${context}` : SYSTEM,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
          ...(model.startsWith("openai/")
            ? { providerOptions: { lovable: { reasoningEffort: "none" as const } } }
            : {}),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
