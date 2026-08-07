import { createFileRoute, redirect } from "@tanstack/react-router";
import { createThread, listThreads } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/chat/")({
  beforeLoad: async ({ context }) => {
    // Abre sempre a conversa mais recente; só cria uma nova quando não existe
    // nenhuma (o botão "NOVA CONVERSA" é o único caminho para criar).
    const threads = await listThreads().catch(() => []);
    const target =
      threads[0] ?? (await createThread((context as { user: { id: string } }).user.id));
    throw redirect({ to: "/chat/$threadId", params: { threadId: target.id } });
  },
  component: () => null,
});
