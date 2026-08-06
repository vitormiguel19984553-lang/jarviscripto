import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { JarvisNav } from "@/components/JarvisNav";
import { BottomNav } from "@/components/BottomNav";
import { topRiskPatterns } from "@/lib/brainStore";
import { limitsFor } from "@/lib/plans";
import { loadPlan } from "@/lib/planStore";
import { fetchMarkets, analyse, eur } from "@/lib/market";
import {
  createThread,
  deleteThread,
  listMessages,
  listThreads,
  renameThread,
  saveMessage,
  textOf,
  toUIMessages,
} from "@/lib/chat";

const MODEL_LABELS: Record<string, string> = {
  "openai/gpt-5.6-sol": "JARVIS PRO",
  "openai/gpt-5.6-luna": "JARVIS RÁPIDO",
  "google/gemini-3.6-flash": "SEGUNDA OPINIÃO",
};

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Assistente IA — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Conversa com o assistente do Cripto Jarvis sobre sinais de mercado, indicadores técnicos e a tua carteira simulada, com histórico guardado na cloud.",
      },
      { property: "og:title", content: "Assistente IA — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Pergunta ao Jarvis sobre o mercado e a tua estratégia simulada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const threads = useQuery({ queryKey: ["chat-threads"], queryFn: listThreads });
  const history = useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: () => listMessages(threadId),
  });

  const newThread = async () => {
    try {
      const t = await createThread(user.id);
      await qc.invalidateQueries({ queryKey: ["chat-threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    } catch {
      toast.error("Não foi possível criar a conversa.");
    }
  };

  const removeThread = async (id: string) => {
    try {
      await deleteThread(id);
      const rest = (threads.data ?? []).filter((t) => t.id !== id);
      await qc.invalidateQueries({ queryKey: ["chat-threads"] });
      if (id === threadId) {
        if (rest[0]) navigate({ to: "/chat/$threadId", params: { threadId: rest[0].id } });
        else newThread();
      }
    } catch {
      toast.error("Não foi possível apagar a conversa.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <header className="hud-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-xl text-glow sm:text-2xl">ASSISTENTE IA</h1>
          <p className="text-xs text-muted-foreground">
            Pergunta sobre sinais, indicadores e a tua carteira simulada
          </p>
        </div>
        <div className="hidden md:block">
          <JarvisNav />
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="hud-panel h-fit p-3">
          <button
            onClick={newThread}
            className="w-full rounded-md bg-primary px-3 py-2 font-display text-[11px] tracking-widest text-primary-foreground"
          >
            NOVA CONVERSA
          </button>
          <ul className="mt-3 space-y-1">
            {(threads.data ?? []).map((t) => (
              <li
                key={t.id}
                className={`flex items-center gap-1 rounded-md px-1 ${
                  t.id === threadId
                    ? "bg-primary/10 ring-1 ring-primary/40"
                    : "hover:bg-secondary/60"
                }`}
              >
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="min-w-0 flex-1 truncate px-2 py-2 text-xs"
                >
                  {t.title}
                </Link>
                <button
                  aria-label="Apagar conversa"
                  onClick={() => removeThread(t.id)}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {history.isLoading ? (
          <section className="hud-panel p-5 text-sm text-muted-foreground">
            A carregar a conversa…
          </section>
        ) : (
          <ChatWindow
            key={threadId}
            threadId={threadId}
            userId={user.id}
            initial={toUIMessages(history.data ?? [])}
          />
        )}
      </div>

      <BottomNav />
    </main>
  );
}

function ChatWindow({
  threadId,
  userId,
  initial,
}: {
  threadId: string;
  userId: string;
  initial: ReturnType<typeof toUIMessages>;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: coins } = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const { data: plan } = useQuery({ queryKey: ["plan", userId], queryFn: () => loadPlan(userId) });
  const { data: patterns } = useQuery({
    queryKey: ["ia-memoria", userId],
    queryFn: () => topRiskPatterns(userId, 5),
  });
  const models = limitsFor(plan).models;
  const [model, setModel] = useState(models[0]);
  useEffect(() => {
    if (!models.includes(model)) setModel(models[0]);
  }, [models, model]);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onFinish: async ({ message }) => {
      const content = textOf(message);
      if (!content) return;
      try {
        await saveMessage({ threadId, userId, role: "assistant", content });
        qc.invalidateQueries({ queryKey: ["chat-threads"] });
      } catch {
        toast.error("A resposta não ficou guardada no histórico.");
      }
    },
    onError: () => toast.error("O assistente não respondeu. Tenta novamente."),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const context = useMemo(() => {
    const memory = (patterns ?? []).length
      ? "Memória de padrões da IA deste utilizador (usa-a para explicar decisões):\n" +
        (patterns ?? [])
          .map(
            (m) =>
              `- ${m.description}: ${m.trades} operações, ${m.wins} acertos, ${m.losses} perdas, resultado ${m.total_pnl.toFixed(2)}€, penalização ${m.confidence_penalty.toFixed(0)} pontos`,
          )
          .join("\n")
      : "";
    if (!coins?.length) return memory;
    const market = coins
      .map((c) => {
        const s = analyse(c);
        return `${c.symbol.toUpperCase()} ${eur(c.current_price)} · 24h ${(c.price_change_percentage_24h ?? 0).toFixed(2)}% · sinal ${s.action} (${s.confidence}%)`;
      })
      .join("\n");
    return memory ? `${market}\n\n${memory}` : market;
  }, [coins, patterns]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    try {
      await saveMessage({ threadId, userId, role: "user", content: text });
      if (messages.length === 0) {
        await renameThread(threadId, text);
        qc.invalidateQueries({ queryKey: ["chat-threads"] });
      }
    } catch {
      toast.error("A mensagem não ficou guardada no histórico.");
    }
    sendMessage({ text }, { body: { context, model } });
    inputRef.current?.focus();
  };

  return (
    <section className="hud-panel flex h-[70vh] flex-col p-4">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Pergunta algo como “o que está a acontecer com o BTC hoje?” ou “explica-me o RSI”.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "ml-auto bg-primary/15 ring-1 ring-primary/30" : "bg-secondary/60"
            }`}
          >
            {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
          </div>
        ))}
        {status === "submitted" && (
          <div className="w-fit rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
            O Jarvis está a pensar…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        {models.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModel(m)}
            className={`rounded-md px-2.5 py-1.5 font-display text-[10px] tracking-widest transition-colors ${
              model === m
                ? "border border-primary/50 bg-primary/10 text-primary"
                : "border border-transparent bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {MODEL_LABELS[m] ?? m}
          </button>
        ))}
        {models.length === 1 && (
          <span className="text-[10px] text-muted-foreground">
            Mais modelos disponíveis nos planos superiores.
          </span>
        )}
      </div>

      <form onSubmit={submit} className="mt-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          placeholder="Escreve a tua pergunta…"
          className="flex-1 resize-none rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 font-display text-[11px] tracking-widest text-primary-foreground disabled:opacity-50"
        >
          ENVIAR
        </button>
      </form>
    </section>
  );
}
