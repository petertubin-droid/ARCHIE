// =========================================================
// ARCHIE WHATSAPP PROTOCOL — PURE COMMUNICATION LAYER LOGIC
// supabase/functions/_shared/archie-ai/whatsapp/protocol.ts
//
// © 2026 FRENZY. All rights reserved.
//
// PURE functions only: no Deno, no Node, no database, no
// fetch. This module is shared by the archie-whatsapp edge
// function (the secure webhook + communication layer) and is
// imported DIRECTLY by the test suite — the exact code that
// runs in production is the code under test.
//
// WhatsApp is an INTERFACE into ARCHIE, never a second brain.
// Nothing here performs cognition. Explicit owner commands
// are classified ONLY at the communication layer where they
// are communication-layer operations (status, forget,
// memory query); "remember this" is deliberately NOT
// intercepted — it flows into the cognitive core so memory
// writes go through the SAME teaching/validation governance
// as the PWA (LEARN → ANALYZE → CROSS-CHECK → VALIDATE →
// ORGANIZE → RETAIN).
// =========================================================

export const WHATSAPP_TEXT_LIMIT = 4096;

// ---------------------------------------------------------
// Webhook verification (GET) — Meta's subscribe handshake.
// ---------------------------------------------------------
export function verifyHubChallenge(
  url: URL,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false; reason: string } {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe") {
    return { ok: false, reason: "hub.mode must be 'subscribe'" };
  }
  if (!verifyToken) {
    return { ok: false, reason: "verify token not configured" };
  }
  if (token !== verifyToken) {
    return { ok: false, reason: "verify token mismatch" };
  }
  if (!challenge) {
    return { ok: false, reason: "missing challenge" };
  }
  return { ok: true, challenge };
}

// ---------------------------------------------------------
// Webhook signature (POST) — HMAC-SHA256 over the raw body
// with the App Secret, constant-time comparison.
// ---------------------------------------------------------
export async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const expected = signatureHeader
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const actual = await hmacSha256Hex(appSecret, rawBody);
  // Constant-time comparison — no early-exit timing oracle.
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------
// Cloud API payload parsing — normalized inbound messages
// and delivery statuses.
// ---------------------------------------------------------
export interface InboundWaMessage {
  waMessageId: string;
  waId: string;
  profileName: string | null;
  type:
    | "text"
    | "audio"
    | "image"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "unsupported";
  text: string | null;
  mediaId: string | null;
  filename: string | null;
}

export interface InboundWaStatus {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

export function parseWebhookPayload(payload: unknown): {
  messages: InboundWaMessage[];
  statuses: InboundWaStatus[];
} {
  const messages: InboundWaMessage[] = [];
  const statuses: InboundWaStatus[] = [];
  const root = payload as Record<string, unknown> | null;
  if (!root || typeof root !== "object") return { messages, statuses };
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entryRaw of entries) {
    const entry = entryRaw as Record<string, unknown> | null;
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeRaw of changes) {
      const change = changeRaw as Record<string, unknown> | null;
      if (!change || typeof change !== "object") continue;
      const value = change.value as Record<string, unknown> | null;
      if (!value || typeof value !== "object") continue;

      // Delivery statuses
      const statusList = Array.isArray(value.statuses) ? value.statuses : [];
      for (const sRaw of statusList) {
        const s = sRaw as Record<string, unknown> | null;
        if (!s) continue;
        const st = String(s.status ?? "");
        if (
          st === "sent" ||
          st === "delivered" ||
          st === "read" ||
          st === "failed"
        ) {
          statuses.push({
            waMessageId: String(s.id ?? ""),
            status: st,
            timestamp: String(s.timestamp ?? Date.now()),
          });
        }
      }

      // Inbound messages
      const msgList = Array.isArray(value.messages) ? value.messages : [];
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const profileName =
        contacts.length &&
        (contacts[0] as Record<string, unknown> | null)?.profile
          ? String(
              (
                (contacts[0] as Record<string, unknown>).profile as Record<
                  string,
                  unknown
                >
              ).name ?? "",
            ) || null
          : null;
      for (const mRaw of msgList) {
        const m = mRaw as Record<string, unknown> | null;
        if (!m || typeof m !== "object") continue;
        const type = String(m.type ?? "unsupported");
        let text: string | null = null;
        let mediaId: string | null = null;
        let filename: string | null = null;
        if (type === "text") {
          text = String(
            ((m.text as Record<string, unknown> | null) ?? {}).body ?? "",
          );
        } else if (
          type === "audio" ||
          type === "image" ||
          type === "video" ||
          type === "document" ||
          type === "sticker"
        ) {
          const media = m[type] as Record<string, unknown> | null;
          mediaId = media ? String(media.id ?? "") || null : null;
          if (media) {
            if (typeof media.caption === "string") text = media.caption;
            if (typeof media.filename === "string") filename = media.filename;
          }
        }
        const normalized: InboundWaMessage["type"] =
          type === "text" ||
          type === "audio" ||
          type === "image" ||
          type === "video" ||
          type === "document" ||
          type === "sticker" ||
          type === "location" ||
          type === "contact"
            ? type
            : "unsupported";
        messages.push({
          waMessageId: String(m.id ?? ""),
          waId: String(((m.from as string) ?? "").replace(/[^0-9+]/g, "")),
          profileName,
          type: normalized,
          text,
          mediaId,
          filename,
        });
      }
    }
  }
  return { messages, statuses };
}

// ---------------------------------------------------------
// Outgoing message shaping — WhatsApp text messages are
// capped at 4096 characters. Long ARCHIE responses are split
// at paragraph/sentence boundaries, never mid-word.
// ---------------------------------------------------------
export function chunkForWhatsApp(
  text: string,
  limit = WHATSAPP_TEXT_LIMIT,
): string[] {
  const clean = (text ?? "").trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > limit) {
    let cut = -1;
    // Prefer paragraph break, then sentence, then space.
    for (const sep of ["\n\n", ". ", "! ", "? ", " "]) {
      const idx = remaining.lastIndexOf(sep, limit);
      if (idx > limit * 0.4) {
        cut = idx + (sep === "\n\n" ? 2 : sep.length);
        break;
      }
    }
    // FIX 41 (batch 12): a separator starting at the last
    // allowed index (e.g. ". " at limit-1) pushed the cut to
    // limit+1 — the chunk was 4097 chars and WhatsApp
    // rejected the send. The cut is clamped to the limit.
    if (cut <= 0 || cut > limit) cut = limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// ---------------------------------------------------------
// Explicit communication-layer owner commands.
// 'remember' / 'learn' are NOT here on purpose — they belong
// to the cognitive core's teaching pipeline (same as PWA).
// ---------------------------------------------------------
export type OwnerCommand =
  | { kind: "status" }
  | { kind: "help" }
  | { kind: "forget_recent" }
  | { kind: "forget_topic"; topic: string }
  | { kind: "memory_query"; topic: string }
  | { kind: "none" };

export function classifyOwnerCommand(raw: string): OwnerCommand {
  const text = (raw ?? "").trim();
  // Escape hatch: quoted/inline text after another sentence is
  // still a command when it starts with ARCHIE,
  const t = text.replace(/^archie[,:!.\s]+/i, "").trim();

  if (/^(what'?s?\s+)?(your\s+)?(integration\s+)?status\??$/i.test(t)) {
    return { kind: "status" };
  }
  if (/^(help|what can you do\??|capabilities\??)$/i.test(t)) {
    return { kind: "help" };
  }
  // "forget what I just told you" / "don't remember this" /
  // "forget the last thing"
  if (
    /^(?:please\s+)?(?:forget|delete|erase|remove)\s+(?:what\s+)?(?:i\s+)?(?:just\s+)?(?:told|said|sent)(?:\s+you)?\.?$/i.test(
      t,
    ) ||
    /^(?:don'?t|do\s+not)\s+(?:remember|store|keep|retain)\s+(?:this|that)\.?$/i.test(
      t,
    ) ||
    // FIX 42 (batch 12): this variant was missing the /i
    // flag — "FORGET THE LAST MESSAGE" silently fell through
    // to the cognitive core instead of the communication
    // layer's forget_recent. Consistent with the other two.
    /^(?:forget|delete)\s+(?:the\s+)?last\s+(?:thing|message)\.?$/i.test(t)
  ) {
    return { kind: "forget_recent" };
  }
  // "forget X" / "forget about X" / "delete memory X"
  const forgetTopic = t.match(
    /^(?:please\s+)?(?:forget|delete|erase)\s+(?:everything\s+)?(?:about\s+|regarding\s+|the\s+memory\s+(?:of|about)\s+)?(.{2,120})$/i,
  );
  if (forgetTopic && !/^this$/i.test(forgetTopic[1].trim())) {
    return { kind: "forget_topic", topic: forgetTopic[1].trim() };
  }
  // "what do you remember about X"
  const memoryQuery = t.match(
    /^(?:what\s+)?do\s+you\s+(?:remember|know)\s+about\s+(.{2,120}?)\s*\??$/i,
  );
  if (memoryQuery) {
    return { kind: "memory_query", topic: memoryQuery[1].trim() };
  }
  // "what do you remember" (no topic) → status of memory
  if (/^what\s+do\s+you\s+remember\??$/i.test(t)) {
    return { kind: "memory_query", topic: "" };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------
// Reminders & tasks — deterministic time parsing only.
// ARCHIE never invents a due time; unrecognized formats are
// rejected with a request for an explicit time.
// ---------------------------------------------------------
export interface ParsedReminder {
  ok: true;
  kind: "reminder" | "task";
  note: string;
  dueAt: string | null; // ISO timestamp or null (undated task)
  needsTime: boolean;
}

/** FIX 40 — the owner's timezone offset for wall-clock
 *  reminder times. Africa/Lagos: UTC+1, no daylight saving
 *  (deterministic every day of the year). */
export const OWNER_TZ_OFFSET = "+01:00";

export function parseReminder(input: string, now = new Date()): ParsedReminder {
  const t = (input ?? "")
    .trim()
    .replace(/^archie[,:!.\s]+/i, "")
    .trim();
  const lower = t.toLowerCase();

  const isReminder = /^(?:please\s+)?remind\s+me\b/i.test(lower);
  const isTask =
    /^(?:please\s+)?(?:create|add|new)\s+(?:a\s+)?task\b/i.test(lower) ||
    /^(?:add|put)\s+this\s+on\s+my\s+(?:task\s+)?list\b/i.test(lower);
  if (!isReminder && !isTask) {
    return {
      ok: true,
      kind: "reminder",
      note: "",
      dueAt: null,
      needsTime: true,
    };
  }

  // due_at YYYY-MM-DD[ HH:MM]
  // FIX 40 (batch 12, Level 8 audit 2026-09-13): absolute
  // wall-clock times used to be pinned to UTC with a hard
  // "Z" — an owner saying 14:00 meant 2pm where they live
  // (Africa/Lagos, UTC+1, no DST), and the reminder fired an
  // hour late. Wall-clock times are now interpreted in the
  // owner's timezone, deterministic year-round.
  let dueAt: string | null = null;
  const abs = lower.match(/\b(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?\b/);
  if (abs) {
    const time = abs[2] ?? "09:00";
    dueAt = new Date(`${abs[1]}T${time}:00${OWNER_TZ_OFFSET}`).toISOString();
  } else {
    // in N minutes / hours / days
    const rel = lower.match(/\bin\s+(\d{1,4})\s+(minute|min|hour|hr|day)s?\b/);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const unit = rel[2];
      const ms = unit.startsWith("min")
        ? n * 60_000
        : unit.startsWith("h")
          ? n * 3_600_000
          : n * 86_400_000;
      dueAt = new Date(now.getTime() + ms).toISOString();
    }
  }

  // The note: strip the TIME PHRASE FIRST, then the command
  // words, then any dangling connector.
  const note = t
    .replace(/\b(?:at|on|by)\s+\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?\b/i, "")
    .replace(/\bin\s+\d{1,4}\s+(?:minute|min|hour|hr|day)s?\b/i, "")
    .replace(/^(?:please\s+)?remind\s+me\s+(?:to\s+|that\s+|about\s+)?/i, "")
    .replace(
      /^(?:please\s+)?(?:create|add|new)\s+(?:a\s+)?task\s+(?:to\s+|that\s+|about\s+)?/i,
      "",
    )
    .replace(/^(?:to|that|about)\s+/i, "")
    .trim()
    .replace(/\s{2,}/g, " ");

  if (!note) {
    return {
      ok: true,
      kind: isReminder ? "reminder" : "task",
      note: "",
      dueAt,
      needsTime: true,
    };
  }
  if (isReminder && !dueAt) {
    // A reminder REQUIRES a time we actually parsed. Be honest.
    return {
      ok: true,
      kind: "reminder",
      note,
      dueAt: null,
      needsTime: true,
    };
  }
  return {
    ok: true,
    kind: isReminder ? "reminder" : "task",
    note,
    dueAt,
    needsTime: false,
  };
}

// ---------------------------------------------------------
// Privacy: phone numbers are masked in logs and admin
// surfaces outside the dedicated mapping console.
// ---------------------------------------------------------
export function maskPhone(waId: string): string {
  const digits = (waId ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 7) return "***";
  return `***${digits.slice(-4)}`;
}

// ---------------------------------------------------------
// Secrets are never stored or echoed — the same class of
// redaction the ARCHIE immune system applies to memory
// writes, applied to the WhatsApp channel.
// ---------------------------------------------------------
const SECRET_PATTERNS = [
  /(?:api[\s_-]?key|token|password|secret|bearer)\s*[:=]\s*\S+/gi,
  /sk-[A-Za-z0-9]{16,}/g,
  /ey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
];

export function containsSecret(text: string): boolean {
  for (const p of SECRET_PATTERNS) {
    p.lastIndex = 0;
    if (p.test(text ?? "")) return true;
  }
  return false;
}
