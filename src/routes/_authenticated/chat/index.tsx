import { createFileRoute, redirect } from "@tanstack/react-router";
import { createThread } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/chat/")({
  beforeLoad: async ({ context }) => {
    const thread = await createThread((context as { user: { id: string } }).user.id);
    throw redirect({ to: "/chat/$threadId", params: { threadId: thread.id } });
  },
  component: () => null,
});
