import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export type Verdict = "concorda" | "discorda" | "cautela" | "sem_revisao";

export type ModelOpinion = {
  model: string;
  label: string;
  verdict: Verdict;
  rationale: string;
};

export type Opinion = {
  model: string;
  verdict: Verdict;
  rationale: string;
  /** Pareceres individuais de cada modelo revisor (revisão cruzada real). */
  opinions?: ModelOpinion[];
  /** Verdadeiro quando os revisores não chegaram ao mesmo veredicto. */
  disagreement?: boolean;
};

/**
 * Painel de revisores: modelos distintos do catálogo do Lovable AI Gateway,
 * chamados em paralelo. (O catálogo do gateway só serve modelos `google/*` e
 * `openai/*` — não há `anthropic/*` nem `xai/*` disponíveis.)
 */
const REVIEWERS: { model: string; label: string }[] = [
  { model: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { model: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash" },
];

const SYSTEM = `És um revisor de risco de sinais de trading (ambiente 100% simulado).
Recebes o sinal de um modelo de análise técnica e o histórico de memória da IA.
Respondes SEMPRE no formato exacto:
VEREDICTO: concorda|discorda|cautela
JUSTIFICACAO: uma frase curta em português de Portugal (máx. 25 palavras).`;

function parse(text: string): { verdict: Verdict; rationale: string } {
  const verdictMatch = /VEREDICTO:\s*(concorda|discorda|cautela)/i.exec(text);
  const rationaleMatch = /JUSTIFICACAO:\s*([\s\S]+)/i.exec(text);
  return {
    verdict: (verdictMatch?.[1]?.toLowerCase() as Verdict) ?? "cautela",
    rationale: (rationaleMatch?.[1] ?? text).trim().slice(0, 300),
  };
}

/** Combina os pareceres: divergência entre modelos é sempre "cautela" no mínimo. */
export function mergeOpinions(opinions: ModelOpinion[]): Opinion {
  const answered = opinions.filter((o) => o.verdict !== "sem_revisao");
  if (!answered.length) {
    return {
      model: opinions.map((o) => o.label).join(" + ") || "sem-revisao",
      verdict: "sem_revisao",
      rationale: "Nenhuma das segundas IAs respondeu dentro do tempo limite.",
      opinions,
      disagreement: false,
    };
  }

  const distinct = new Set(answered.map((o) => o.verdict));
  const disagreement = distinct.size > 1;
  let verdict: Verdict;
  if (!disagreement) {
    verdict = answered[0]!.verdict;
  } else if (distinct.has("discorda") && !distinct.has("concorda")) {
    // discorda + cautela → mantém o parecer mais severo
    verdict = "discorda";
  } else {
    // qualquer divergência real → no mínimo cautela
    verdict = "cautela";
  }

  const rationale = answered.map((o) => `${o.label}: ${o.rationale}`).join(" | ").slice(0, 600);

  return {
    model: answered.map((o) => o.label).join(" + "),
    verdict,
    rationale: disagreement ? `Divergência entre modelos → cautela. ${rationale}` : rationale,
    opinions,
    disagreement,
  };
}

/**
 * Segunda opinião entre IAs: vários modelos diferentes revêem, em paralelo, o
 * raciocínio do modelo técnico. Tem limite de tempo curto — se nenhum responder,
 * seguimos com a decisão principal assinalada como "sem segunda revisão".
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
  const gateway = createLovableAiGatewayProvider(input.apiKey);
  const prompt = `Moeda: ${input.symbol}
Acção proposta: ${input.action}
Confiança do modelo técnico: ${input.confidence}%
Indicadores e motivo: ${input.reason}
Memória da IA sobre este padrão: ${input.memoryNote || "sem histórico relevante"}`;

  const results = await Promise.all(
    REVIEWERS.map(async ({ model, label }): Promise<ModelOpinion> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 9000);
      try {
        const { text } = await generateText({
          model: gateway(model),
          system: SYSTEM,
          abortSignal: controller.signal,
          prompt,
        });
        const parsed = parse(text);
        return { model, label, ...parsed };
      } catch {
        return {
          model,
          label,
          verdict: "sem_revisao",
          rationale: "Não respondeu dentro do tempo limite.",
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return mergeOpinions(results);
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
