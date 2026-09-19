// =========================================================
// FRELUX ARCHIE STAGE 1, CHAT CLIENT
//
// Owner-private chat persistence (RLS-guarded tables) and
// the bridge to the archie-chat edge function (the real
// ARCHIE Core). Nothing here fabricates intelligence: every
// status comes from production tables or the edge function.
// =========================================================
import { supabase } from "@/lib/supabase";

export interface ArchieConversation {
  id: string;
  title: string;
  archived: boolean;
  last_message_at: string;
  created_date: string;
}

export interface ArchieChatAttachment {
  name: string;
  type: string;
  uri?: string;
}

export interface ArchieToolRun {
  tool: string;
  ok: boolean;
  input: unknown;
  output: unknown;
  at: string;
}

export interface ArchieEngineInfo {
  path: "archie-native" | "external-adapter" | "system";
  adapter?: string;
  note?: string;
}

export interface ArchieMessage {
  id: string;
  conversation_id: string;
  role: "owner" | "archie" | "system";
  content: string;
  attachments: ArchieChatAttachment[];
  tool_runs: ArchieToolRun[];
  /** Honest provenance: which inference engine produced this reply. */
  engine: ArchieEngineInfo["path"];
  created_date: string;
}

export interface ArchieChatResponse {
  reply: string;
  toolRuns: ArchieToolRun[];
  engine?: ArchieEngineInfo;
  pendingCapabilities?: string[];
}

const CONVERSATION_COLUMNS = "id,title,archived,last_message_at,created_date";
const MESSAGE_COLUMNS =
  "id,conversation_id,role,content,attachments,tool_runs,engine,created_date";

// ---------------------------------------------------------
// Conversations
// ---------------------------------------------------------
export async function listConversations(): Promise<ArchieConversation[]> {
  const { data, error } = await supabase
    .from("frelux_archie_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("archived", false)
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieConversation[];
}

export async function searchConversations(
  term: string,
): Promise<ArchieConversation[]> {
  const { data, error } = await supabase
    .from("frelux_archie_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("archived", false)
    .ilike("title", `%${term}%`)
    .order("last_message_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieConversation[];
}

export async function createConversation(
  title = "New conversation",
): Promise<ArchieConversation> {
  // owner_id is NOT NULL on frelux_archie_conversations and
  // RLS gates every row on it — without it the insert failed
  // silently at the DB level and the owner could never start
  // a conversation (send button stayed dead, replies never
  // persisted). Attach the authenticated user explicitly.
  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth?.user?.id;
  if (!ownerId) {
    throw new Error("Sign in to start an ARCHIE conversation.");
  }
  const { data, error } = await supabase
    .from("frelux_archie_conversations")
    .insert({ title, owner_id: ownerId })
    .select(CONVERSATION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as ArchieConversation;
}

export async function archiveConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("frelux_archie_conversations")
    .update({ archived: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("frelux_archie_conversations")
    .update({ title: title.slice(0, 120) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------
// Messages
// ---------------------------------------------------------
export async function listMessages(
  conversationId: string,
): Promise<ArchieMessage[]> {
  const { data, error } = await supabase
    .from("frelux_archie_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_date", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieMessage[];
}

async function insertMessage(
  conversationId: string,
  role: ArchieMessage["role"],
  content: string,
  attachments: ArchieChatAttachment[],
  toolRuns: ArchieToolRun[],
  engine: ArchieEngineInfo["path"] = "system",
): Promise<ArchieMessage> {
  const { data, error } = await supabase
    .from("frelux_archie_messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      attachments,
      tool_runs: toolRuns,
      engine,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as ArchieMessage;
}

// Auto-title a conversation from its first owner message.
async function maybeAutoTitle(
  conversation: ArchieConversation,
  firstMessage: string,
): Promise<void> {
  if (conversation.title !== "New conversation") return;
  const title =
    firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New conversation";
  await renameConversation(conversation.id, title);
}

// ---------------------------------------------------------
// Send: persist owner turn, invoke the real ARCHIE Core,
// persist ARCHIE's turn. Tool runs are stored with the reply
// so responses stay auditable.
// ---------------------------------------------------------
export async function sendMessage(
  conversation: ArchieConversation,
  text: string,
  attachments: ArchieChatAttachment[] = [],
  history: { role: "owner" | "archie"; content: string }[] = [],
): Promise<{ ownerMessage: ArchieMessage; archieMessage: ArchieMessage }> {
  const ownerMessage = await insertMessage(
    conversation.id,
    "owner",
    text,
    attachments,
    [],
  );

  const { data, error } = await supabase.functions.invoke("archie-chat", {
    body: {
      message: text,
      history: history.slice(-20),
      attachments: attachments.map(({ name, type }) => ({ name, type })),
      // C-1: scopes the engine session server-side so
      // concurrent conversations never share working memory.
      conversationId: conversation.id,
    },
  });
  if (error) throw new Error(error.message);

  const res = data as ArchieChatResponse & { error?: string };
  if (!res || res.error || typeof res.reply !== "string") {
    throw new Error(res?.error ?? "ARCHIE Core returned an invalid response");
  }

  const enginePath: ArchieEngineInfo["path"] =
    res.engine?.path === "external-adapter"
      ? "external-adapter"
      : "archie-native";
  const archieMessage = await insertMessage(
    conversation.id,
    "archie",
    res.reply,
    [],
    res.toolRuns ?? [],
    enginePath,
  );

  await maybeAutoTitle(conversation, text);
  return { ownerMessage, archieMessage };
}
