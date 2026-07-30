import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Provider apontado ao AI Gateway da Lovable (usa LOVABLE_API_KEY). */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
