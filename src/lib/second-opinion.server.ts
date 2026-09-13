import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export type Verdict = "concorda" | "discorda" | "cautela" | "sem_revisao";

/** Motivo técnico da falha de um revisor — diagnosticável sem adivinhar. */
export type FailureKind =
  | "timeout"
  | "rate_limit"
  | "sem_creditos"
  | "bloqueado"
  | "pedido_invalido"
  | "erro_gateway"
  | "erro_desconhecido";

export type ModelOpinion = {
  model: string;
  label: string;
  verdict: Verdict;
  rationale: string;
  /** Presente apenas quando o revisor não respondeu. */
  failure?: FailureKind;
  /** Mensagem crua (truncada) do gateway, para inspeção. */
  failureDetail?: string;
  latencyMs?: number;
};

export type Opinion = {
  model: string;
  verdict: Verdict;
  rationale: string;
  /** Pareceres individuais de cada modelo revisor (revisão cruzada real). */
  opinions?: ModelOpinion[];
  /** Verdadeiro quando os revisores não chegaram ao mesmo veredicto. */
  disagreement?: boolean;
  /** Resumo das falhas por modelo (ex.: "Gemini 3.1 Pro: timeout"). */
  failureSummary?: string;
};

const FAILURE_LABEL: Record<FailureKind, string> = {
  timeout: "excedeu o tempo limite",
  rate_limit: "limite de pedidos do gateway (429)",
  sem_creditos: "sem créditos de IA (402)",
  bloqueado: "bloqueado por política do workspace (403)",
  pedido_invalido: "pedido inválido (400)",
  erro_gateway: "erro do gateway (5xx)",
  erro_desconhecido: "erro desconhecido",
};

/** Traduz o erro do gateway num motivo concreto e inspecionável. */
export function classifyFailure(error: unknown, aborted: boolean): FailureKind {
  if (aborted) return "timeout";
  const err = error as { statusCode?: number; status?: number; name?: string; message?: string };
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return "timeout";
  const status = err?.statusCode ?? err?.status;
  if (status === 429) return "rate_limit";
  if (status === 402) return "sem_creditos";
  if (status === 403 || status === 401) return "bloqueado";
  if (status === 400) return "pedido_invalido";
  if (typeof status === "number" && status >= 500) return "erro_gateway";
  const msg = String(err?.message ?? error ?? "").toLowerCase();
  if (msg.includes("abort") || msg.includes("timeout")) return "timeout";
  if (msg.includes("rate limit") || msg.includes("429")) return "rate_limit";
  if (msg.includes("402")) return "sem_creditos";
  if (msg.includes("403") || msg.includes("401")) return "bloqueado";
  return "erro_desconhecido";
}

function failureDetail(error: unknown): string {
  const err = error as { message?: string; responseBody?: string };
  return String(err?.responseBody ?? err?.message ?? error ?? "").slice(0, 300);
}

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
  const failureSummary =
    opinions
      .filter((o) => o.failure)
      .map(
        (o) =>
          `${o.label}: ${FAILURE_LABEL[o.failure!]}` +
          (o.latencyMs ? ` após ${Math.round(o.latencyMs)}ms` : "") +
          (o.failureDetail ? ` — ${o.failureDetail}` : ""),
      )
      .join(" | ")
      .slice(0, 600) || undefined;

  if (!answered.length) {
    return {
      model: opinions.map((o) => o.label).join(" + ") || "sem-revisao",
      verdict: "sem_revisao",
      rationale: failureSummary
        ? `Nenhuma segunda IA respondeu — ${failureSummary}`
        : "Nenhuma das segundas IAs respondeu.",
      opinions,
      disagreement: false,
      failureSummary,
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
