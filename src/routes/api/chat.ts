import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type ChatRequestBody = { messages?: unknown; context?: unknown };

const SYSTEM = `És o "Cripto Jarvis", um assistente de investimento em criptomoedas que fala sempre em português de Portugal.
Regras:
- Toda a operação da aplicação é SIMULADA (paper trading). Nunca sugiras que existe dinheiro real envolvido.
- Explicas indicadores técnicos (RSI, médias móveis, volatilidade), sinais da IA e resultados de backtesting de forma simples e directa.
- Nunca prometes lucro. Lembras o risco quando o utilizador fala em investir a sério.
- Não és consultor financeiro licenciado; para decisões reais recomendas cautela e estudo próprio.
- Respostas curtas e úteis, com listas quando ajudar.`;

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
        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("openai/gpt-5.6-sol"),
          system: context ? `${SYSTEM}\n\nContexto actual do utilizador:\n${context}` : SYSTEM,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
          providerOptions: { lovable: { reasoningEffort: "none" } },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
