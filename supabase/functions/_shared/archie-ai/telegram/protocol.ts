// =========================================================
// ARCHIE TELEGRAM CHANNEL — PROTOCOL (engine 13, audit E-3)
//
// Deterministic Telegram Bot API webhook protocol: update
// parsing, webhook-secret verification, outbound chunking
// and identity masking. No external AI; no fabricated
// fields — anything Telegram did not send is absent, and
// unsupported media types surface as an honest note.
// Mirrors the WhatsApp channel's architecture exactly
// (whatsapp/protocol.ts) so both channels are the same
// shape behind the channel abstraction.
// =========================================================

/** Telegram's message text limit — same 4096 cap. */
export const TELEGRAM_TEXT_LIMIT = 4096;

/** The header Telegram sends on every webhook delivery when
 *  a secret token is configured at setWebhook time. */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

export function verifyTelegramSecret(
  headerValue: string | null,
  expected: string,
): boolean {
  if (!expected) return false; // unconfigured secret = refuse all
  if (!headerValue) return false;
  // constant-time-ish comparison (length + XOR accumulation)
  const a = headerValue;
  const b = expected;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------
// Inbound updates — parsed with total honesty about what
// Telegram actually sent.
// ---------------------------------------------------------

export interface InboundTelegramMessage {
  /** update_id — Telegram's monotonically increasing event id. */
  updateId: number;
  /** chat.id — the mapped conversation identity. */
  chatId: string;
  /** message_id — unique per chat. */
  messageId: number | null;
  /** Text body, present only for text messages. */
  text: string | null;
  /** Honest media type label. */
  type:
    | "text"
    | "audio"
    | "voice"
    | "photo"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "unsupported";
  /** File id when a media message carries one. */
  fileId: string | null;
  /** Telegram user id of the sender. */
  fromUserId: string | null;
}

export interface TelegramUpdateParse {
  messages: InboundTelegramMessage[];
  /** True when the payload contained something (callback
   *  queries, edits, channel posts) ARCHIE does not process —
   *  honestly acknowledged, never silently swallowed. */
  ignoredKinds: string[];
}

export function parseTelegramUpdate(payload: unknown): TelegramUpdateParse {
  const out: TelegramUpdateParse = { messages: [], ignoredKinds: [] };
  if (!payload || typeof payload !== "object") return out;
  const p = payload as Record<string, unknown>;

  // Single update: { update_id, message | edited_message | ... }
  const updateId = numberOr(p.update_id);
  const message = p.message as Record<string, unknown> | undefined;

  if (message) {
    const chat = message.chat as Record<string, unknown> | undefined;
    const chatId = chat ? numberOr(chat.id) : null;
    const from = message.from as Record<string, unknown> | undefined;
    const fromUserId = from ? numberOr(from.id) : null;
    if (updateId !== null && chatId !== null) {
      const text = typeof message.text === "string" ? message.text : null;
      out.messages.push({
        updateId,
        chatId: String(chatId),
        messageId: numberOr(message.message_id),
        text,
        type: classify(message),
        fileId: fileIdOf(message),
        fromUserId: fromUserId !== null ? String(fromUserId) : null,
      });
    }
    return out;
  }

  // Honest inventory of what arrived that ARCHIE does not
  // process (this channel handles user text messages only).
  for (const key of [
    "edited_message",
    "channel_post",
    "edited_channel_post",
    "callback_query",
    "inline_query",
    "my_chat_member",
    "chat_member",
  ]) {
    if (key in p) out.ignoredKinds.push(key);
  }
  return out;
}

function numberOr(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function classify(m: Record<string, unknown>): InboundTelegramMessage["type"] {
  if (typeof m.text === "string" && m.text.length > 0) return "text";
  for (const t of [
    "voice",
    "audio",
    "photo",
    "video",
    "document",
    "sticker",
    "location",
    "contact",
  ] as const) {
    if (t in m) return t;
  }
  return "unsupported";
}

function fileIdOf(m: Record<string, unknown>): string | null {
  for (const t of [
    "voice",
    "audio",
    "document",
    "sticker",
    "video",
  ] as const) {
    const v = m[t] as Record<string, unknown> | undefined;
    if (v && typeof v.file_id === "string") return v.file_id;
  }
  const photo = m.photo as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(photo) && photo.length > 0) {
    const last = photo[photo.length - 1];
    if (typeof last.file_id === "string") return last.file_id;
  }
  return null;
}

// ---------------------------------------------------------
// Outbound chunking — same guarantee as WhatsApp: never
// truncated, never merged past the platform limit.
// ---------------------------------------------------------

export function chunkForTelegram(text: string): string[] {
  if (text.length === 0) return [""];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += TELEGRAM_TEXT_LIMIT) {
    chunks.push(text.slice(i, i + TELEGRAM_TEXT_LIMIT));
  }
  return chunks;
}

/** Privacy: chat ids never appear verbatim in logs. */
export function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return "*".repeat(chatId.length);
  return `…${chatId.slice(-4)}`;
}
