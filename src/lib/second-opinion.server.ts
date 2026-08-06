import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export type Verdict = "concorda" | "discorda" | "cautela" | "sem_revisao";

export type Opinion = {
  model: string;
  verdict: Verdict;
  rationale: string;
};

const REVIEWER_MODEL = "google/gemini-3.6-flash";

const SYSTEM = `És um revisor de risco de sinais de trading (ambiente 100% simulado).
Recebes o sinal de um modelo de análise técnica e o histórico de memória da IA.
Respondes SEMPRE no formato exacto:
VEREDICTO: concorda|discorda|cautela
JUSTIFICACAO: uma frase curta em português de Portugal (máx. 25 palavras).`;

/**
 * Segunda opinião entre IAs: um modelo diferente revê o raciocínio do modelo
 * técnico. Tem limite de tempo curto — se não responder, seguimos com a
 * decisão principal assinalada como "sem segunda revisão".
 */
export async function secondOpinion(input: {
  apiKey: string;
  symbol: string;
  action: string;
  confidence: number;
  reason: string;
  memoryNote: string;
  timeoutMs?: number;
}): Promise<Opinion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 6000);
  try {
    const gateway = createLovableAiGatewayProvider(input.apiKey);
    const { text } = await generateText({
      model: gateway(REVIEWER_MODEL),
      system: SYSTEM,
      abortSignal: controller.signal,
      prompt: `Moeda: ${input.symbol}
Acção proposta: ${input.action}
Confiança do modelo técnico: ${input.confidence}%
Indicadores e motivo: ${input.reason}
Memória da IA sobre este padrão: ${input.memoryNote || "sem histórico relevante"}`,
    });

    const verdictMatch = /VEREDICTO:\s*(concorda|discorda|cautela)/i.exec(text);
    const rationaleMatch = /JUSTIFICACAO:\s*([\s\S]+)/i.exec(text);
    const verdict = (verdictMatch?.[1]?.toLowerCase() as Verdict) ?? "cautela";
    return {
      model: REVIEWER_MODEL,
      verdict,
      rationale: (rationaleMatch?.[1] ?? text).trim().slice(0, 300),
    };
  } catch {
    return {
      model: REVIEWER_MODEL,
      verdict: "sem_revisao",
      rationale: "A segunda IA não respondeu dentro do tempo limite.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Efeito do parecer na execução: nunca cancela, torna o sistema mais cauteloso. */
export function applyVerdict(
  verdict: Verdict,
  amount: number,
  confidence: number,
): { amount: number; requiredConfidence: number; label: string } {
  switch (verdict) {
    case "concorda":
      return { amount, requiredConfidence: 0, label: "2ª IA concorda" };
    case "cautela":
      return {
        amount: Math.max(1, Math.round(amount * 0.7)),
        requiredConfidence: confidence + 4,
        label: "2ª IA pediu cautela",
      };
    case "discorda":
      return {
        amount: Math.max(1, Math.round(amount * 0.45)),
        requiredConfidence: confidence + 8,
        label: "2ª IA discorda",
      };
    default:
      return { amount, requiredConfidence: 0, label: "sem segunda revisão" };
  }
}
