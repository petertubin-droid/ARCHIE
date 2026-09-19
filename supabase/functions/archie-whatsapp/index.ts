// Supabase Edge Function: archie-whatsapp
// =========================================================
// ARCHIE WHATSAPP PERSONAL ASSISTANT — COMMUNICATION LAYER
//
// © 2026 FRENZY. All rights reserved.
//
// ARCHITECTURE (owner directive 2026-09-10):
//
//   WhatsApp → Official WhatsApp Business Platform (Cloud API)
//     → this function — SECURE WEBHOOK + COMMUNICATION LAYER
//       → archie-chat — THE ONE ARCHIE COGNITIVE CORE
//         (internal shared-secret call; identical engine,
//          memory, security gates and authority checks as
//          the ARCHIE PWA and web chat)
//       → Memory / Knowledge / Learning / Tools / Web
//     → Response → WhatsApp Cloud API
//
// WHAT THIS FUNCTION IS:
//   * The communication interface: webhook verification,
//     signature checking, idempotency, identity mapping,
//     conversation continuity, message shaping, delivery.
//   * Owner commands that are COMMUNICATION-LAYER operations
//     (status, forget, memory query, reminders) — executed
//     against the SAME central tables the core uses.
//
// WHAT THIS FUNCTION IS NOT:
//   * A second brain. It performs ZERO cognition: it never
//     constructs an engine, never invents answers, and every
//     conversational turn is answered by archie-chat — the
//     same unified cognitive loop the PWA runs.
//   * "remember this" is NOT intercepted here — it flows to
//     the core's teaching pipeline (secret redaction, fact
//     extraction, conflict detection, validation) exactly as
//     in the PWA. ONE memory, ONE learning engine.
//
// HARD RULES:
//   * Official WhatsApp Business API only (Cloud API v21.0).
//   * Webhooks are signature-verified (X-Hub-Signature-256,
//     HMAC-SHA256, constant-time). Unauthenticated POSTs are
//     refused and logged as security events.
//   * Idempotent: Meta retries a webhook delivery on failure.
//     Every processed message id is recorded exactly once —
//     a retry can never double-process or double-reply.
//   * Knowing the WhatsApp number authorizes NOTHING.
//     Identity comes only from the Owner-managed account
//     mapping (frelux_archie_whatsapp_accounts) with an
//     active status.
//   * Owner-only commands require a mapping with role
//     'owner' linked to the admin profile. Receiving a
//     message never authorizes a consequential action —
//     production execution stays behind the Owner Secret in
//     the PWA/Coding Studio, exactly as the constitution
//     demands. ARCHIE says so honestly instead of complying.
//   * Media honesty: voice/audio transcription and image/
//     document content analysis are NOT operational in this
//     channel. ARCHIE never claims to have understood media
//     it cannot process.
//   * No secrets in, no secrets out: secrets are never
//     echoed, logged, stored or sent to WhatsApp.
//   * Nothing here stores conversation content as permanent
//     memory. The message log is an operational record under
//     the Owner's retention control; persistent knowledge
//     only enters through the core's validated teaching.
// =========================================================

import { createClient, User } from "npm:@supabase/supabase-js@2.45.4";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  verifyHubChallenge,
  verifyHubSignature,
  parseWebhookPayload,
  chunkForWhatsApp,
  classifyOwnerCommand,
  parseReminder,
  maskPhone,
  containsSecret,
  WHATSAPP_TEXT_LIMIT,
  type InboundWaMessage,
} from "../_shared/archie-ai/whatsapp/protocol.ts";
import { serveWithCors } from "../_shared/serve.ts";
import {
  analyzeImage,
  summarizeAnalysis,
} from "../_shared/archie-ai/cognitive/vision.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Official WhatsApp Business Platform configuration (Supabase
// secrets — values NEVER appear in code, logs or responses).
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const INTERNAL_KEY = Deno.env.get("ARCHIE_INTERNAL_KEY") ?? "";
const GRAPH_VERSION = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v21.0";

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ---------------------------------------------------------
// Settings cache (short TTL — the Owner can flip the
// integration off from the Admin console and the webhook
// honors it within seconds).
// ---------------------------------------------------------
type WaSettings = {
  enabled: boolean;
  owner_learning_mode: boolean;
  retention_days: number;
};
let settingsCache: { at: number; value: WaSettings | null } = {
  at: 0,
  value: null,
};
async function getSettings(): Promise<WaSettings | null> {
  if (settingsCache.value && Date.now() - settingsCache.at < 10_000) {
    return settingsCache.value;
  }
  const { data, error } = await db
    .from("frelux_archie_whatsapp_settings")
    .select("enabled,owner_learning_mode,retention_days")
    .eq("id", 1)
    .maybeSingle();
  const value = error || !data ? null : (data as WaSettings);
  settingsCache = { at: Date.now(), value };
  return value;
}

// ---------------------------------------------------------
// WhatsApp Cloud API — official Graph send.
// ---------------------------------------------------------
interface SendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

async function sendWhatsAppText(to: string, text: string): Promise<SendResult> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    return { ok: false, error: "WhatsApp sending is not configured" };
  }
  if (containsSecret(text)) {
    return {
      ok: false,
      error: "response blocked: contained secret-shaped content",
    };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: text.slice(0, WHATSAPP_TEXT_LIMIT) },
        }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (body as { error?: { message?: string } }).error?.message;
      return { ok: false, error: detail ?? `Graph API ${res.status}` };
    }
    return {
      ok: true,
      waMessageId: String(
        (body as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? "",
      ),
    };
  } catch (e) {
    return { ok: false, error: `send failed: ${String(e).slice(0, 160)}` };
  }
}

/** Send a (possibly long) reply, chunked at WhatsApp's limit,
 * logging each outbound chunk against the account. */
async function replyToAccount(
  account: { id: string; wa_id: string },
  text: string,
): Promise<number> {
  const chunks = chunkForWhatsApp(text);
  for (const chunk of chunks) {
    const sent = await sendWhatsAppText(account.wa_id, chunk);
    await db.from("frelux_archie_whatsapp_messages").insert([
      {
        account_id: account.id,
        direction: "out",
        wa_message_id: sent.ok ? sent.waMessageId || null : null,
        media_type: "text",
        body: chunk,
        status: sent.ok ? "sent" : "failed_send",
        error: sent.ok
          ? null
          : (sent.error ?? "unknown send error").slice(0, 300),
      },
    ]);
  }
  return chunks.length;
}

// ---------------------------------------------------------
// The ONE cognitive core. All conversational cognition for
// every mapped account happens in archie-chat — the same
// engine, memory, security verdict, privacy consent and
// authority gates as the PWA and web chat. The internal
// shared secret authenticates the identity the Owner mapped;
// archie-chat resolves the profile role itself, so a mapped
// non-admin runs the ISOLATED visitor engine (zero owner
// memory access), exactly like an anonymous site visitor.
// ---------------------------------------------------------
async function askArchieCore(
  account: {
    user_id: string | null;
    wa_id: string;
    role: string;
  },
  message: string,
): Promise<{ ok: boolean; reply: string }> {
  if (!INTERNAL_KEY) {
    return {
      ok: false,
      reply:
        "The ARCHIE core link is not configured (ARCHIE_INTERNAL_KEY). This is an integration fault, not a refusal — the Owner can fix it in the Admin console.",
    };
  }

  // Conversation continuity: the last turns of THIS account's
  // conversation, from the operational log.
  const { data: turns } = await db
    .from("frelux_archie_whatsapp_messages")
    .select("direction,body")
    .eq("account_id", account.id)
    .in("media_type", ["text"])
    .order("created_at", { ascending: true })
    .limit(200);
  const history = (turns ?? [])
    .slice(-10)
    .map((t: { direction: string; body: string | null }) => ({
      role: t.direction === "in" ? "owner" : "archie",
      content: String(t.body ?? "").slice(0, 4000),
    }));

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-archie-internal-key": INTERNAL_KEY,
    };
    if (account.user_id) headers["x-archie-user-id"] = account.user_id;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/archie-chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        history,
        clientId: `whatsapp:${maskPhone(account.wa_id)}`,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      reply?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        reply:
          data.error && !containsSecret(String(data.error))
            ? `The core reported a fault: ${String(data.error).slice(0, 200)}`
            : "The ARCHIE core could not process this turn. This is an integration fault — it has been logged for the Owner.",
      };
    }
    const reply = String(data.reply ?? "").trim();
    if (!reply) {
      return {
        ok: false,
        reply:
          "The ARCHIE core returned an empty answer — logged for the Owner.",
      };
    }
    return { ok: true, reply };
  } catch (e) {
    return {
      ok: false,
      reply: `The ARCHIE core is unreachable right now (${String(e).slice(0, 80)}). It has been logged — try again shortly.`,
    };
  }
}

// ---------------------------------------------------------
// Reminders — honest delivery. Due reminders ride along the
// next inbound activity (this layer has no scheduler); the
// Admin console lists pending ones.
// ---------------------------------------------------------
async function deliverDueReminders(account: {
  id: string;
  wa_id: string;
}): Promise<number> {
  const { data: due } = await db
    .from("frelux_archie_whatsapp_reminders")
    .select("id,note")
    .eq("account_id", account.id)
    .is("delivered_at", null)
    .not("due_at", "is", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(5);
  let sent = 0;
  for (const r of due ?? []) {
    const res = await sendWhatsAppText(account.wa_id, `⏰ Reminder: ${r.note}`);
    if (res.ok) {
      await db
        .from("frelux_archie_whatsapp_reminders")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", r.id);
      sent++;
    }
  }
  return sent;
}

// ---------------------------------------------------------
// Owner communication-layer commands — executed against the
// SAME central tables (frelux_archie_native_facts is THE
// ARCHIE memory; no WhatsApp-side memory exists).
// ---------------------------------------------------------
async function ownerStatusSummary(): Promise<string> {
  const [
    { data: settings },
    { count: accounts },
    { count: msgs24 },
    { count: errs24 },
    { count: pendingReminders },
  ] = await Promise.all([
    db
      .from("frelux_archie_whatsapp_settings")
      .select("enabled,owner_learning_mode,retention_days")
      .eq("id", 1)
      .maybeSingle(),
    db
      .from("frelux_archie_whatsapp_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    db
      .from("frelux_archie_whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    db
      .from("frelux_archie_whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed_send")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    db
      .from("frelux_archie_whatsapp_reminders")
      .select("id", { count: "exact", head: true })
      .is("delivered_at", null),
  ]);
  const sendConfigured = Boolean(ACCESS_TOKEN && PHONE_NUMBER_ID);
  const webhookConfigured = Boolean(VERIFY_TOKEN && APP_SECRET);
  return [
    "ARCHIE WhatsApp Assistant — status:",
    `• Integration: ${settings?.enabled ? "ENABLED" : "disabled"} (this channel)`,
    `• WhatsApp send config: ${sendConfigured ? "configured" : "MISSING — set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID"}`,
    `• Webhook security: ${webhookConfigured ? "signature verification active" : "MISSING — set WHATSAPP_APP_SECRET + WHATSAPP_VERIFY_TOKEN"}`,
    `• Owner Learning Mode: ${settings?.owner_learning_mode ? "on" : "off"} (learning still requires your explicit teaching)`,
    `• Active linked numbers: ${accounts ?? 0}`,
    `• Messages (24h): ${msgs24 ?? 0}${errs24 ? ` — ${errs24} send failure(s)` : ""}`,
    `• Undelivered reminders/tasks: ${pendingReminders ?? 0}`,
    "Cognition: every reply comes from the ONE ARCHIE core (same engine as the PWA). Production execution and Owner-Secret actions stay in the PWA/Coding Studio by design — I will never run them from WhatsApp.",
  ].join("\n");
}

const HELP_TEXT = [
  "I'm ARCHIE on WhatsApp — the same intelligence as the app, this is just another way to talk to me.",
  "",
  "Ask me anything (calculations, construction knowledge, planning, coding questions, research through my web intelligence). You can also say:",
  '• "remember this: <fact>" — teaches my central memory (validated, with provenance)',
  '• "what do you remember about <topic>"',
  '• "forget what I just told you" / "forget <topic>"',
  '• "remind me in 20 minutes to <note>" / "remind me at 2026-09-15 09:00 to <note>"',
  '• "create a task to <note>"',
  '• "status" — integration + message status',
  "",
  "I answer from the same brain and memory as the ARCHIE app. Voice notes, images and documents are received but not yet understood in this channel — I'll say so rather than pretend. Sensitive operations (production deploys, payments, security changes) stay behind Owner Secret controls in the app.",
].join("\n");

async function ownerMemoryQuery(topic: string): Promise<string> {
  const { data } = await db
    .from("frelux_archie_native_facts")
    .select("subject,predicate,object,status,confidence,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  let rows: Array<Record<string, unknown>> = (data ?? []) as Array<
    Record<string, unknown>
  >;
  if (topic) {
    const needle = topic.toLowerCase();
    rows = rows.filter((r) => {
      const hay = [
        String(r.subject ?? ""),
        String(r.predicate ?? ""),
        JSON.stringify(r.object ?? "").toLowerCase(),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }
  if (rows.length === 0) {
    return topic
      ? `I hold no retained knowledge about "${topic}". (I only retain what you teach me or what my validation pipeline accepts — nothing is memorized automatically.)`
      : 'My retained memory is currently empty — teach me with "remember this: <fact>".';
  }
  const lines = rows.slice(0, 8).map((r) => {
    const obj = JSON.stringify(r.object).replace(/^"|"$/g, "");
    const st =
      r.status === "validated"
        ? "validated"
        : `${String(r.status)} (unconfirmed)`;
    return `• ${String(r.subject)} ${String(r.predicate).replace(/-/g, " ")} → ${obj} [${st}, confidence ${Math.round(Number(r.confidence) * 100)}%]`;
  });
  const shown = Math.min(rows.length, 8);
  return `What I remember${topic ? ` about "${topic}"` : ""} (${shown} of ${rows.length} shown):\n${lines.join("\n")}\n\nSay "forget <topic>" to remove entries.`;
}

async function ownerForgetRecent(account: {
  id: string;
  wa_id: string;
}): Promise<string> {
  const window = new Date(Date.now() - 15 * 60_000).toISOString();
  // Retract facts taught in the last 15 minutes (the core's
  // teaching path is the only writer of owner-taught facts).
  const { data: recent } = await db
    .from("frelux_archie_native_facts")
    .select("id")
    .eq("provenance->>source", "owner-taught")
    .gte("created_at", window);
  let removedFacts = 0;
  if (recent && recent.length > 0) {
    const { error } = await db
      .from("frelux_archie_native_facts")
      .delete()
      .in(
        "id",
        recent.map((r: { id: string }) => r.id),
      );
    if (!error) removedFacts = recent.length;
  }
  // Privacy: scrub the raw conversation bodies of this window
  // from the operational log too (structure kept, content
  // dropped).
  await db
    .from("frelux_archie_whatsapp_messages")
    .update({ body: "[redacted on owner forget request]" })
    .eq("account_id", account.id)
    .gte("created_at", window);
  return `Done. I removed ${removedFacts} fact(s) learned in the last 15 minutes and redacted this channel's message content from that window. For anything older, say "forget <topic>".`;
}

async function ownerForgetTopic(topic: string): Promise<string> {
  const needle = `%${topic.replace(/[%_]/g, "")}%`;
  const { data: subjectMatch } = await db
    .from("frelux_archie_native_facts")
    .select("id")
    .ilike("subject", needle);
  const { data: objectMatch } = await db
    .from("frelux_archie_native_facts")
    .select("id")
    .ilike("object", needle);
  const ids = [
    ...new Set(
      [...(subjectMatch ?? []), ...(objectMatch ?? [])].map(
        (r: { id: string }) => r.id,
      ),
    ),
  ];
  if (ids.length === 0) {
    return `I found no retained knowledge matching "${topic}" — nothing to forget.`;
  }
  const { error } = await db
    .from("frelux_archie_native_facts")
    .delete()
    .in("id", ids);
  if (error) {
    return "The deletion failed on the database side — logged for the Owner. I did not pretend it worked.";
  }
  return `Done — I removed ${ids.length} retained item(s) about "${topic}".`;
}

// ---------------------------------------------------------
// Inbound message handling (the full verified path).
// ---------------------------------------------------------
interface AccountRow {
  id: string;
  wa_id: string;
  display_name: string | null;
  user_id: string | null;
  role: "owner" | "authorized" | "family" | "customer";
  status: "pending" | "active" | "revoked";
  learning_mode: boolean;
  memory_permission: boolean;
}

const UNLINKED_REPLY =
  "You've reached ARCHIE, but this number isn't linked to an ARCHIE account. Linking is done by the Owner in the ARCHIE Admin console — messaging this number alone never grants access.";

const INACTIVE_REPLY =
  "This number's ARCHIE link is not currently active. The Owner manages linked numbers from the ARCHIE Admin console.";

async function handleInbound(msg: InboundWaMessage): Promise<void> {
  if (!msg.waMessageId || !msg.waId) return;

  // Idempotency FIRST: Meta retries failed webhook deliveries.
  // The event row is the single source of truth for "already
  // processed" — inserted exactly once (PRIMARY KEY).
  const { error: dupErr } = await db
    .from("frelux_archie_whatsapp_events")
    .insert([{ event_key: `msg:${msg.waMessageId}`, kind: "message" }]);
  if (dupErr) return; // Unique violation → already processed.

  // Global kill switch (Owner can disable the channel).
  const settings = await getSettings();
  if (!settings || !settings.enabled) {
    // Kill switch is ON: record that the message arrived and
    // who sent it (metadata only), then stop. No reply, no
    // processing — the Owner disabled this channel on purpose.
    const { data: auditAcct } = await db
      .from("frelux_archie_whatsapp_accounts")
      .select("id")
      .eq("wa_id", msg.waId)
      .maybeSingle();
    await db.from("frelux_archie_whatsapp_messages").insert([
      {
        account_id: auditAcct?.id ?? null,
        wa_message_id: msg.waMessageId,
        direction: "in",
        media_type: msg.type,
        body: null,
        media_wa_id: msg.mediaId,
        status: "received",
        error: "integration disabled — inbound recorded, not processed",
      },
    ]);
    return;
  }

  // Identity: ONLY the Owner-managed mapping grants anything.
  const { data: accountRow } = await db
    .from("frelux_archie_whatsapp_accounts")
    .select(
      "id,wa_id,display_name,user_id,role,status,learning_mode,memory_permission",
    )
    .eq("wa_id", msg.waId)
    .maybeSingle();
  const account = accountRow as AccountRow | null;

  if (!account) {
    // Rate-limit unknown numbers hard: one reply per 10 min.
    if (
      checkRateLimit(`wa-unknown:${msg.waId}`, {
        maxRequests: 1,
        windowMs: 600_000,
      }).allowed
    ) {
      await db.from("frelux_archie_whatsapp_messages").insert([
        {
          wa_message_id: msg.waMessageId,
          direction: "in",
          media_type: msg.type,
          body: null, // unknown senders: content never stored
          status: "received",
          error: "no linked account — refusal sent, content not retained",
        },
      ]);
      await sendWhatsAppText(msg.waId, UNLINKED_REPLY);
    }
    return;
  }

  if (account.status !== "active") {
    if (
      checkRateLimit(`wa-inactive:${account.id}`, {
        maxRequests: 1,
        windowMs: 600_000,
      }).allowed
    ) {
      await sendWhatsAppText(account.wa_id, INACTIVE_REPLY);
    }
    return;
  }

  // Per-account rate limit (in-memory, per isolate; Meta's own
  // limits apply upstream as well).
  const rl = checkRateLimit(`wa-acct:${account.id}`, {
    maxRequests: account.role === "owner" ? 60 : 20,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) {
    await sendWhatsAppText(
      account.wa_id,
      "That's a lot of messages in a short time — I need to slow down for a while. Try again later.",
    );
    return;
  }

  // Record the inbound (operational log — NOT memory).
  const { data: inRow } = await db
    .from("frelux_archie_whatsapp_messages")
    .insert([
      {
        account_id: account.id,
        wa_message_id: msg.waMessageId,
        direction: "in",
        media_type: msg.type,
        body:
          account.memory_permission || account.role === "owner"
            ? msg.text
            : null, // accounts without memory permission: log metadata only
        media_wa_id: msg.mediaId,
        status: "received",
      },
    ])
    .select("id")
    .single();

  // Owner linked to the admin profile is the ONLY owner mode.
  const isOwner = account.role === "owner" && account.user_id !== null;

  await db
    .from("frelux_archie_whatsapp_accounts")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", account.id);

  // Deliver any due reminders for this account (honest lazy
  // delivery — see the reminders comment above).
  await deliverDueReminders(account);

  // ---- Native eyes (audit item P8, 2026-09-11) ----
  // Images get REAL native perception: download the media,
  // analyze the actual bytes (PNG, baseline-JPEG and GIF
  // first-frame pixels; progressive JPEG structure), and fold
  // the honest summary into the text flow. No object recognition exists
  // — the summary says so. On any failure
  // the honest-refusal path below still applies, verbatim.
  if (msg.type === "image" && msg.mediaId && ACCESS_TOKEN) {
    let seenText: string | null = null;
    try {
      const meta = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${msg.mediaId}`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      );
      if (meta.ok) {
        const { url: mediaUrl } = (await meta.json()) as { url?: string };
        if (mediaUrl) {
          const mediaRes = await fetch(mediaUrl);
          if (mediaRes.ok) {
            const bytes = new Uint8Array(await mediaRes.arrayBuffer());
            if (bytes.length > 10 * 1024 * 1024) {
              seenText =
                "[attached image over 10MB — not downloaded for analysis, honestly]";
            } else {
              const vision = await analyzeImage(bytes);
              seenText = vision.ok
                ? `[attached image — native vision, ${summarizeAnalysis(vision.analysis)}]`
                : `[attached image — not analyzable: ${vision.note}]`;
            }
          }
        }
      }
    } catch {
      // honest: perception failed, the refusal below speaks
    }
    if (seenText) {
      // The perception summary joins the caption as the text
      // payload — the normal pipeline (secrets, commands,
      // reasoning) runs on it unchanged.
      (msg as { text?: string | null }).text = [
        (msg.text ?? "").trim(),
        seenText,
      ]
        .filter(Boolean)
        .join("\n\n");
      msg.type = "text";
    }
  }

  // ---- Media honesty (Ears not operational here; Eyes above) ----
  if (msg.type !== "text") {
    const suffix = msg.filename
      ? ` I received "${msg.filename.slice(0, 80)}".`
      : "";
    const honest = {
      audio: `I received your voice note${suffix ? " — " + suffix.slice(2) : ""}, but spoken-audio transcription is not operational in this channel yet — I will never pretend to understand audio I can't process. Please type it (or use the ARCHIE app's native voice input).`,
      image:
        "I received your image, but image content analysis is not operational in this channel yet — I won't pretend to see it. Describe it in text and I'll work with that.",
      video:
        "I received your video, but video understanding is not operational in this channel yet — I won't pretend to have watched it.",
      document:
        "I received your document, but document content reading is not operational in this channel yet — I won't pretend to have read it. Paste the relevant text and I'll analyze it.",
      sticker: "Sticker received — noted, no content analysis in this channel.",
      location:
        "Location received — noted; I can't act on it in this channel yet.",
      contact:
        "Contact received — noted; I can't act on it in this channel yet.",
      unsupported:
        "I received a message type I can't process in this channel — I won't pretend to understand it.",
    }[msg.type];
    await replyToAccount(account, honest);
    await markProcessed(inRow?.id, msg.type);
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) {
    await replyToAccount(
      account,
      "I received an empty message — nothing to process.",
    );
    return;
  }

  // ---- Secret refusal (channel-level immune rule) ----
  if (containsSecret(text)) {
    await replyToAccount(
      account,
      "I won't process or store that — it looks like it contains a credential or secret. ARCHIE never retains secrets. Send the non-secret part and I'll handle it.",
    );
    await markProcessed(inRow?.id, "text");
    return;
  }

  // ---- Owner communication-layer commands ----
  if (isOwner) {
    const cmd = classifyOwnerCommand(text);
    if (cmd.kind === "status") {
      await replyToAccount(account, await ownerStatusSummary());
      await markProcessed(inRow?.id, "text");
      return;
    }
    if (cmd.kind === "help") {
      await replyToAccount(account, HELP_TEXT);
      await markProcessed(inRow?.id, "text");
      return;
    }
    if (cmd.kind === "forget_recent") {
      await replyToAccount(account, await ownerForgetRecent(account));
      await markProcessed(inRow?.id, "text");
      return;
    }
    if (cmd.kind === "forget_topic") {
      await replyToAccount(account, await ownerForgetTopic(cmd.topic));
      await markProcessed(inRow?.id, "text");
      return;
    }
    if (cmd.kind === "memory_query") {
      await replyToAccount(account, await ownerMemoryQuery(cmd.topic));
      await markProcessed(inRow?.id, "text");
      return;
    }

    // Reminders & tasks (deterministic time parsing only).
    const reminder = parseReminder(text);
    if (reminder.note) {
      if (reminder.needsTime && !reminder.dueAt) {
        await replyToAccount(
          account,
          'I want to set that reminder, but I didn\'t catch a clear time. Use "remind me in 20 minutes to <note>" or "remind me at 2026-09-15 09:00 to <note>" — I never guess a time.',
        );
        await markProcessed(inRow?.id, "text");
        return;
      }
      const { error } = await db
        .from("frelux_archie_whatsapp_reminders")
        .insert([
          {
            account_id: account.id,
            kind: reminder.kind,
            note: reminder.note.slice(0, 400),
            due_at: reminder.dueAt,
          },
        ]);
      if (error) {
        await replyToAccount(
          account,
          "I couldn't save that reminder (database error) — logged for the Owner. I won't claim it's set.",
        );
      } else {
        await replyToAccount(
          account,
          reminder.dueAt
            ? `Set. I'll remind you: "${reminder.note}" — due ${reminder.dueAt.replace("T", " ").slice(0, 16)} UTC. Honest note: I deliver reminders with my next reply cycle, not by a background scheduler.`
            : `Task saved: "${reminder.note}". It has no due time — say "remind me at <time> to <note>" if you want it scheduled.`,
        );
      }
      await markProcessed(inRow?.id, "text");
      return;
    }
  } else {
    // Non-owner linked users: reminders are an owner capability.
    const reminderIntent =
      /^\s*(?:please\s+)?(?:remind\s+me|create\s+(?:a\s+)?task)/i;
    if (reminderIntent.test(text)) {
      await replyToAccount(
        account,
        "Reminders and tasks via WhatsApp are an Owner capability — your account isn't configured for it.",
      );
      await markProcessed(inRow?.id, "text");
      return;
    }
  }

  // ---- THE ONE BRAIN: everything else goes to the core ----
  // Owner: full ARCHIE (memory retrieval, reasoning, tools,
  //         web research, security verdict, authority gates,
  //         privacy consent — identical to the PWA chat).
  // Non-owner: archie-chat runs its ISOLATED visitor engine
  //         for this user — zero owner memory, zero tools.
  const core = await askArchieCore(account, text);
  if (!core.ok) {
    // Integration fault: record it for the Admin console.
    await db
      .from("frelux_archie_whatsapp_messages")
      .update({ status: "failed", error: "core fault" })
      .eq("id", inRow?.id ?? "");
  }
  await replyToAccount(
    account,
    core.reply +
      (core.ok ? "" : "\n\n[This was a channel fault, not an ARCHIE refusal.]"),
  );
  await markProcessed(inRow?.id, "text", !core.ok);
}

async function markProcessed(
  rowId: string | undefined | null,
  mediaType: string,
  failed = false,
): Promise<void> {
  if (!rowId) return;
  await db
    .from("frelux_archie_whatsapp_messages")
    .update({ status: failed ? "failed" : "processed" })
    .eq("id", rowId);
}

// ---------------------------------------------------------
// Delivery statuses (Meta → us).
// ---------------------------------------------------------
async function handleStatus(
  waMessageId: string,
  status: "sent" | "delivered" | "read" | "failed",
): Promise<void> {
  const { error: dupErr } = await db
    .from("frelux_archie_whatsapp_events")
    .insert([{ event_key: `status:${waMessageId}:${status}`, kind: "status" }]);
  if (dupErr) return;
  await db
    .from("frelux_archie_whatsapp_messages")
    .update({
      status: status === "failed" ? "failed_send" : status,
      error: status === "failed" ? "delivery failed (Meta reported)" : null,
    })
    .eq("wa_message_id", waMessageId);
}

// ---------------------------------------------------------
// Owner/Admin API (Admin Control Center → real controls).
// Owner JWT + profile.role='admin' required, mirroring the
// archie-legal admin pattern.
// ---------------------------------------------------------
async function requireOwner(
  req: Request,
): Promise<{ user: User; isAdmin: boolean } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Unauthorized" });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await anon.auth.getUser();
  const user = data.user;
  if (!user) return json(401, { error: "Unauthorized" });
  const { data: profile } = await anon
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { user, isAdmin: profile?.role === "admin" };
}

async function adminAction(
  action: string,
  body: Record<string, unknown>,
): Promise<Response> {
  switch (action) {
    case "status": {
      const [settings, accounts, counts] = await Promise.all([
        db
          .from("frelux_archie_whatsapp_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle(),
        db
          .from("frelux_archie_whatsapp_accounts")
          .select("*")
          .order("created_at", { ascending: false }),
        db
          .from("frelux_archie_whatsapp_messages")
          .select("status,created_at", { count: "exact" })
          .gte(
            "created_at",
            new Date(Date.now() - 7 * 86_400_000).toISOString(),
          ),
      ]);
      const { data: lastIn } = await db
        .from("frelux_archie_whatsapp_messages")
        .select("created_at")
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1);
      const { count: errs } = await db
        .from("frelux_archie_whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed_send")
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
      const { data: lastEvent } = await db
        .from("frelux_archie_whatsapp_events")
        .select("processed_at,kind")
        .order("processed_at", { ascending: false })
        .limit(1);
      return json(200, {
        ok: true,
        data: {
          settings: settings.data,
          // Config presence ONLY — values never leave the server.
          config: {
            verifyTokenConfigured: Boolean(VERIFY_TOKEN),
            appSecretConfigured: Boolean(APP_SECRET),
            accessTokenConfigured: Boolean(ACCESS_TOKEN),
            phoneNumberIdConfigured: Boolean(PHONE_NUMBER_ID),
            internalKeyConfigured: Boolean(INTERNAL_KEY),
            graphVersion: GRAPH_VERSION,
          },
          accounts: (accounts.data ?? []).map((a: Record<string, unknown>) => ({
            ...a,
            wa_id: maskPhone(String(a.wa_id)),
          })),
          messages7d: counts.count ?? 0,
          sendErrors7d: errs ?? 0,
          lastInboundAt: lastIn?.[0]?.created_at ?? null,
          lastWebhookEventAt: lastEvent?.[0]?.processed_at ?? null,
        },
      });
    }

    case "settings_save": {
      const enabled = Boolean(body.enabled);
      const ownerLearningMode = Boolean(body.ownerLearningMode);
      const retentionDays = Math.min(
        3650,
        Math.max(1, Number(body.retentionDays ?? 365) || 365),
      );
      const { error } = await db
        .from("frelux_archie_whatsapp_settings")
        .update({
          enabled,
          owner_learning_mode: ownerLearningMode,
          retention_days: retentionDays,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) return json(500, { error: error.message });
      settingsCache = { at: 0, value: null };
      return json(200, { ok: true });
    }

    case "account_add": {
      const waId = String(body.waId ?? "").replace(/[^0-9]/g, "");
      if (!/^\d{8,20}$/.test(waId)) {
        return json(400, {
          error: "WhatsApp number must be 8-20 digits (E.164 without the '+')",
        });
      }
      const role = String(body.role ?? "customer");
      if (!["owner", "authorized", "family", "customer"].includes(role)) {
        return json(400, { error: "Invalid role" });
      }
      const userId = body.userId ? String(body.userId) : null;
      if (role === "owner" && !userId) {
        return json(400, {
          error: "Owner mappings must link an ARCHIE admin user id",
        });
      }
      const { error } = await db.from("frelux_archie_whatsapp_accounts").upsert(
        {
          wa_id: waId,
          display_name: body.displayName
            ? String(body.displayName).slice(0, 120)
            : null,
          user_id: userId,
          role,
          status: "active",
          verified_at: new Date().toISOString(),
        },
        { onConflict: "wa_id" },
      );
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    case "account_update": {
      const id = String(body.id ?? "");
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.status !== undefined) {
        const st = String(body.status);
        if (!["pending", "active", "revoked"].includes(st)) {
          return json(400, { error: "Invalid status" });
        }
        patch.status = st;
        if (st === "active") patch.verified_at = new Date().toISOString();
      }
      if (body.learningMode !== undefined) {
        patch.learning_mode = Boolean(body.learningMode);
      }
      if (body.memoryPermission !== undefined) {
        patch.memory_permission = Boolean(body.memoryPermission);
      }
      if (body.displayName !== undefined) {
        patch.display_name = body.displayName
          ? String(body.displayName).slice(0, 120)
          : null;
      }
      const { error } = await db
        .from("frelux_archie_whatsapp_accounts")
        .update(patch)
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    case "account_revoke": {
      const id = String(body.id ?? "");
      const { error } = await db
        .from("frelux_archie_whatsapp_accounts")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    case "account_delete": {
      const id = String(body.id ?? "");
      const { error } = await db
        .from("frelux_archie_whatsapp_accounts")
        .delete()
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    case "messages": {
      const limit = Math.min(200, Math.max(1, Number(body.limit ?? 50)));
      const { data, error } = await db
        .from("frelux_archie_whatsapp_messages")
        .select(
          "id,direction,media_type,body,status,error,created_at,account_id",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, data: { messages: data ?? [] } });
    }

    case "reminders": {
      const { data, error } = await db
        .from("frelux_archie_whatsapp_reminders")
        .select("id,kind,note,due_at,delivered_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, data: { reminders: data ?? [] } });
    }

    case "test_connection": {
      // REAL call to the official Graph API — reports live
      // phone-number metadata or the honest error.
      if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
        return json(200, {
          ok: true,
          data: {
            connected: false,
            reason:
              "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured (set them as Supabase secrets)",
          },
        });
      }
      try {
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}`,
          { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = (body as { error?: { message?: string } }).error
            ?.message;
          return json(200, {
            ok: true,
            data: {
              connected: false,
              reason: detail ?? `Graph API responded ${res.status}`,
            },
          });
        }
        const d = body as {
          display_phone_number?: string;
          verified_name?: string;
          quality_rating?: string;
        };
        return json(200, {
          ok: true,
          data: {
            connected: true,
            displayPhoneNumber: d.display_phone_number ?? null,
            verifiedName: d.verified_name ?? null,
            qualityRating: d.quality_rating ?? null,
          },
        });
      } catch (e) {
        return json(200, {
          ok: true,
          data: {
            connected: false,
            reason: `Network error: ${String(e).slice(0, 160)}`,
          },
        });
      }
    }

    case "disconnect": {
      // Honest disconnect: the webhook stops processing (kill
      // switch) and all mappings are revoked. Meta-side token
      // rotation happens in the Meta dashboard — stated here,
      // never faked.
      const { error } = await db
        .from("frelux_archie_whatsapp_settings")
        .update({
          enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) return json(500, { error: error.message });
      await db
        .from("frelux_archie_whatsapp_accounts")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("status", "active");
      settingsCache = { at: 0, value: null };
      return json(200, {
        ok: true,
        data: {
          note: "Channel disabled and all mappings revoked. To fully cut Meta-side access, rotate/remove the system-user token in the Meta app dashboard — ARCHIE cannot revoke Meta tokens from here and will not pretend to.",
        },
      });
    }

    default:
      return json(400, { error: `Unknown action: ${action}` });
  }
}

// ---------------------------------------------------------
// Entry point
// ---------------------------------------------------------
serveWithCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  // ---- GET: Meta webhook subscription handshake ----
  if (req.method === "GET") {
    const challenge = verifyHubChallenge(url, VERIFY_TOKEN);
    if (challenge.ok) {
      return new Response(challenge.challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ---- POST: could be the webhook OR an Admin console call.
  // Meta's webhook is signature-verified and has no auth
  // header; Admin calls carry the Owner's JWT.
  const authHeader = req.headers.get("Authorization");

  if (authHeader) {
    // Admin Control Center path — Owner JWT required.
    const owner = await requireOwner(req);
    if (owner instanceof Response) return owner;
    if (!owner.isAdmin) {
      return json(403, {
        error: "Forbidden — the WhatsApp Assistant console is owner-only.",
      });
    }
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const action = String(body.action ?? "");
    return adminAction(action, body);
  }

  // ---- Meta webhook path ----
  const rawBody = await req.text();

  if (!APP_SECRET) {
    // Signature verification is impossible without the app
    // secret: REFUSE (fail closed), and log the event.
    try {
      // FIX 26: system-level event with no user — insertable
      // only since user_id became nullable (migration
      // 20260913030000). Pre-fix, the NOT NULL constraint
      // silently swallowed BOTH signature-refusal criticals.
      await db.from("frelux_security_events").insert({
        kind: "ARCHIE_WHATSAPP_SIGNATURE_UNVERIFIABLE",
        severity: "critical",
        message: "webhook POST refused: WHATSAPP_APP_SECRET not configured",
      });
    } catch {
      // Never let audit-logging break the refusal.
    }
    return json(401, { error: "Unauthorized" });
  }

  const valid = await verifyHubSignature(
    rawBody,
    req.headers.get("x-hub-signature-256"),
    APP_SECRET,
  );
  if (!valid) {
    try {
      // FIX 26: same as above — system-level, user_id NULL.
      await db.from("frelux_security_events").insert({
        kind: "ARCHIE_WHATSAPP_BAD_SIGNATURE",
        severity: "warning",
        message: "webhook POST with invalid X-Hub-Signature-256 refused",
      });
    } catch {
      // Swallow: the refusal stands.
    }
    return json(401, { error: "Unauthorized" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const { messages, statuses } = parseWebhookPayload(payload);

  // Delivery statuses: update outbound rows.
  for (const st of statuses) {
    if (st.waMessageId) await handleStatus(st.waMessageId, st.status);
  }

  // Inbound messages: full verified pipeline per message.
  let failures = 0;
  for (const msg of messages) {
    try {
      await handleInbound(msg);
    } catch (e) {
      failures++;
      try {
        await db.from("frelux_archie_whatsapp_messages").insert([
          {
            wa_message_id: msg.waMessageId || null,
            direction: "in",
            media_type: msg.type,
            status: "failed",
            error: `processing error: ${String(e).slice(0, 280)}`,
          },
        ]);
      } catch {
        // Swallow — best effort.
      }
    }
  }

  // 500 on infrastructure failures lets Meta retry (idempotency
  // makes retries safe). Healthy/refused processing is a 200 —
  // refusals are deliberate, not errors.
  return json(failures > 0 ? 500 : 200, { received: messages.length });
});
