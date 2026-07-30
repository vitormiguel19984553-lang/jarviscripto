import { supabase } from "@/integrations/supabase/client";
import type { UIMessage } from "ai";

export type ChatThread = {
  id: string;
  title: string;
  updated_at: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export function textOf(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

export function toUIMessages(rows: StoredMessage[]): UIMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    parts: [{ type: "text" as const, text: r.content }],
  })) as UIMessage[];
}

export async function listThreads(): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createThread(userId: string, title = "Nova conversa") {
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: userId, title })
    .select("id,title,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteThread(id: string) {
  const { error } = await supabase.from("chat_threads").delete().eq("id", id);
  if (error) throw error;
}

export async function renameThread(id: string, title: string) {
  const { error } = await supabase
    .from("chat_threads")
    .update({ title: title.slice(0, 80) })
    .eq("id", id);
  if (error) throw error;
}

export async function listMessages(threadId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,role,content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StoredMessage[];
}

export async function saveMessage(args: {
  threadId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  clientMessageId?: string;
}) {
  const { error } = await supabase.from("chat_messages").insert({
    thread_id: args.threadId,
    user_id: args.userId,
    role: args.role,
    content: args.content,
    client_message_id: args.clientMessageId ?? null,
  });
  if (error) throw error;
  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.threadId);
}
