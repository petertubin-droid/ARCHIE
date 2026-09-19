// =========================================================
// FRELUX ARCHIE STAGE 1 — OWNER PWA CLIENT
//
// Client SDK for the ARCHIE Personal Intelligence PWA:
//  - conversation CRUD (Owner-scoped, enforced by RLS)
//  - chat turns through the real archie-core edge function
//  - explicitly-selected attachments → private archie-media
//    bucket (ARCHIE never enumerates device storage)
//  - trusted-device identity (app-generated key, NEVER IMEI)
//  - live status from archie-status
//
// No secrets ever live here; auth flows through the normal
// Supabase session.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";

// ---------------------------------------------------------
// Conversations (RLS: owner-only)
// ---------------------------------------------------------
export interface ArchieConversation {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  message_count: number;
  created_date: string;
  updated_date: string;
}

export interface ArchieMessage {
  id: string;
  conversation_id: string;
  role: "owner" | "archie" | "tool" | "learning";
  content: string;
  attachments: ArchieAttachment[];
  tool_calls: Array<{ tool: string; ok: boolean; summary: string }>;
  model?: string | null;
  starred?: boolean;
  created_date: string;
}

export interface ArchieAttachment {
  kind: "image" | "audio" | "document";
  storage_path: string;
  mime: string;
  name?: string;
}

export async function listConversations(
  search?: string,
): Promise<ArchieConversation[]> {
  const supabase = await getSupabase();
  let q = supabase
    .from("frelux_archie_conversations")
    .select(
      "id, title, pinned, archived, message_count, created_date, updated_date",
    )
    .eq("archived", false)
    .order("pinned", { ascending: false })
    .order("updated_date", { ascending: false })
    .limit(100);
  if (search && search.trim()) q = q.ilike("title", `%${search.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieConversation[];
}

export async function createConversation(
  title = "New conversation",
): Promise<ArchieConversation> {
  const supabase = await getSupabase();
  // owner_id is NOT NULL on frelux_archie_conversations with no
  // DB default, and RLS gates every row on it. Without it the
  // insert always failed — no conversation could ever be
  // created, the send button stayed disabled and ARCHIE's
  // replies could never persist or render.
  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth?.user?.id;
  if (!ownerId) {
    throw new Error("Sign in to start an ARCHIE conversation.");
  }
  const { data, error } = await supabase
    .from("frelux_archie_conversations")
    .insert({ title, owner_id: ownerId })
    .select(
      "id, title, pinned, archived, message_count, created_date, updated_date",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as ArchieConversation;
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_conversations")
    .update({ title: title.slice(0, 120) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveConversation(id: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_conversations")
    .update({ archived: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMessages(
  conversationId: string,
): Promise<ArchieMessage[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_messages")
    .select(
      "id, conversation_id, role, content, attachments, tool_calls, model, starred, created_date",
    )
    .eq("conversation_id", conversationId)
    .order("created_date", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieMessage[];
}

// ---------------------------------------------------------
// Attachments — only files the Owner explicitly selected.
// ---------------------------------------------------------
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME: RegExp =
  /^(image\/(png|jpeg|webp|heic)|audio\/(webm|ogg|mp3|wav|mpeg|mp4)|application\/pdf|text\/plain)$/;

export function validateAttachment(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `"${file.name}" is over 20 MB.` };
  }
  if (!ALLOWED_MIME.test(file.type)) {
    return {
      ok: false,
      error: `"${file.name}" type (${file.type || "unknown"}) is not supported. Supported: images, audio, PDF, plain text.`,
    };
  }
  return { ok: true };
}

export async function uploadAttachment(
  userId: string,
  file: File,
): Promise<
  { ok: true; attachment: ArchieAttachment } | { ok: false; error: string }
> {
  const check = validateAttachment(file);
  if (!check.ok) return { ok: false, error: check.error };
  const supabase = await getSupabase();
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `chat/${userId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("archie-media")
    .upload(path, file, { upsert: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    attachment: {
      kind: file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
          ? "audio"
          : "document",
      storage_path: path,
      mime: file.type,
      name: file.name,
    },
  };
}

// ---------------------------------------------------------
// A chat turn through the REAL ARCHIE core.
// ---------------------------------------------------------
export interface ChatTurnResult {
  ok: boolean;
  reply?: string;
  intent?: string;
  used_tools?: string[];
  tool_results?: Array<{ tool: string; ok: boolean; summary: string }>;
  warnings?: string[];
  error?: string;
  /** Language resolution for this turn (§16). */
  language?: {
    language_code: string;
    source: "USER_SELECTION" | "LOCATION_SUGGESTION";
    authoritative: boolean;
    terminology_terms_used?: number;
  };
}

export async function sendChatTurn(input: {
  conversationId: string;
  message: string;
  attachments?: ArchieAttachment[];
  teach?: boolean;
  history?: Array<{ role: "owner" | "archie"; content: string }>;
  /** §16: resolved session language (user selection is
   * authoritative; location suggestion is advisory). The
   * server validates against the live registry. */
  language?: {
    language_code: string;
    source: "USER_SELECTION" | "LOCATION_SUGGESTION";
  };
  /** Gap 3 (2026-09-16): live reply streaming — when provided,
   *  the turn runs over SSE and onDelta fires with each
   *  word-group chunk as it arrives (paced delivery of the
   *  fully computed reply; never fabrication). The final
   *  result is identical to the classic call. */
  onDelta?: (chunk: string) => void;
}): Promise<ChatTurnResult> {
  const supabase = await getSupabase();

  // Classic path — byte-identical behavior, zero risk.
  if (!input.onDelta) {
    const { data, error } = await supabase.functions.invoke("archie-core", {
      body: {
        conversation_id: input.conversationId,
        message: input.message,
        attachments: input.attachments ?? [],
        teach: input.teach ?? false,
        history: input.history ?? [],
        language: input.language ?? null,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok)
      return { ok: false, error: data?.error ?? "ARCHIE core error" };
    return data as ChatTurnResult;
  }

  // Streaming path — direct fetch with the live session JWT.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const url = (import.meta.env.VITE_SUPABASE_URL ??
    import.meta.env.VITE_SUPABASE_API_URL) as string;
  const res = await fetch(`${url}/functions/v1/archie-core`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      message: input.message,
      attachments: input.attachments ?? [],
      teach: input.teach ?? false,
      history: input.history ?? [],
      language: input.language ?? null,
      stream: true,
    }),
  });
  if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("text/event-stream")) {
    // stream unavailable → fall back honestly to the classic call
    return sendChatTurn({ ...input, onDelta: undefined });
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatTurnResult | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (const block of buffer.split("\n\n")) {
      const evLine = block.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!evLine || !dataLine) continue;
      const event = evLine.slice(7);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLine.slice(6));
      } catch {
        continue; // chunk boundary mid-JSON — next read completes it
      }
      if (event === "delta") input.onDelta(String(payload.text ?? ""));
      if (event === "done") {
        result = payload as unknown as ChatTurnResult;
        if (!result.ok) {
          result = {
            ok: false,
            error: result.error ?? "ARCHIE core error",
          };
        }
      }
    }
    buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
  }
  return result ?? { ok: false, error: "ARCHIE stream ended without a result" };
}

// ---------------------------------------------------------
// Status center — live system state from archie-status.
// ---------------------------------------------------------
export interface ArchieSystemStatus {
  archie_core: { state: string; note?: string };
  knowledge_core: {
    state: string;
    knowledge_items: number;
    approved: number;
    domains: number;
  };
  learning: { state: string; awaiting_approval: number };
  frelux_connection: { state: string; estimates: number; materials: number };
  internal_agents: { active: number; total: number };
  devices: { trusted: number; pending: number };
  conversations: number;
  ears: {
    state: string;
    configured: boolean;
    transcriptions: number;
    note?: string;
  };
  security: { state: string; audit_events: number; critical_events: number };
  infrastructure: {
    cost_records: number;
    api_keys: number;
    intel_sources: number;
    price_observations: number;
  };
}

export async function fetchSystemStatus(): Promise<ArchieSystemStatus | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("archie-status", {
    method: "GET",
  });
  if (error || !data?.ok) return null;
  return data.status as ArchieSystemStatus;
}

// ---------------------------------------------------------
// Trusted devices — app-generated identity key (crypto
// random), stored locally, registered server-side. NEVER IMEI.
// ---------------------------------------------------------
const DEVICE_KEY_STORAGE = "frelux_archie_device_key";

export function getDeviceKey(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (existing) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(DEVICE_KEY_STORAGE, key);
    return key;
  } catch {
    // storage unavailable (private mode): ephemeral key
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export interface ArchieDevice {
  id: string;
  device_key: string;
  label: string;
  platform: string | null;
  status: "PENDING" | "TRUSTED" | "REVOKED";
  last_seen_at: string;
  created_date: string;
}

export function devicePlatformLabel(): string {
  const ua = navigator.userAgent;
  const platform =
    (/Mobi|Android/i.test(ua) ? "Mobile" : "Desktop") +
    (/(Chrome|Safari|Firefox|Edg)/.test(ua) ? "" : "");
  return `${platform} browser`;
}

export async function registerThisDevice(
  label?: string,
): Promise<{ ok: true; device: ArchieDevice } | { ok: false; error: string }> {
  const supabase = await getSupabase();
  const deviceKey = getDeviceKey();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const payload = {
    device_key: deviceKey,
    label: (label ?? devicePlatformLabel()).slice(0, 60),
    platform: devicePlatformLabel(),
    status: "PENDING",
  };
  const { data, error } = await supabase
    .from("frelux_archie_devices")
    .upsert(payload, { onConflict: "owner_id,device_key" })
    .select(
      "id, device_key, label, platform, status, last_seen_at, created_date",
    )
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, device: data as ArchieDevice };
}

export async function listDevices(): Promise<ArchieDevice[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_devices")
    .select(
      "id, device_key, label, platform, status, last_seen_at, created_date",
    )
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieDevice[];
}

export async function updateDevice(
  id: string,
  patch: { status?: "TRUSTED" | "REVOKED" | "PENDING"; label?: string },
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_devices")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------
// Security center — own audit events (RLS: owner read-only).
// ---------------------------------------------------------
export interface ArchieAuditEvent {
  id: string;
  event_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  detail: Record<string, unknown>;
  created_date: string;
}

export async function listAuditEvents(limit = 50): Promise<ArchieAuditEvent[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_audit_events")
    .select("id, event_type, severity, detail, created_date")
    .order("created_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieAuditEvent[];
}

export async function recordAuditEvent(
  eventType: string,
  severity: "INFO" | "WARNING" | "CRITICAL",
  detail: Record<string, unknown>,
): Promise<void> {
  const supabase = await getSupabase();
  await supabase.from("frelux_archie_audit_events").insert({
    event_type: eventType,
    severity,
    detail,
  });
}

// ---------------------------------------------------------
// Learning center — real ingestion pipeline data (RLS).
// ---------------------------------------------------------
export interface ArchieLearningIngestion {
  id: string;
  title: string;
  domain: string;
  input_type: string;
  pipeline_state: string;
  candidate_count: number;
  created_date: string;
}

export async function listLearningIngestions(
  limit = 50,
): Promise<ArchieLearningIngestion[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_ingestions")
    .select(
      "id, title, domain, input_type, pipeline_state, candidate_count, created_date",
    )
    .order("created_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchieLearningIngestion[];
}
