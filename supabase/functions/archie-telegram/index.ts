// archie-telegram — TELEGRAM CHANNEL (engine 13, audit E-3)
// =========================================================
// Inbound/outbound Telegram adapter behind the same channel
// architecture as archie-whatsapp:
//
//   Telegram webhook → secret-token verify → idempotency
//   → Owner-linked account lookup (never granted by chatting)
//   → kill switch → THE ONE ARCHIE CORE (archie-chat, same
//   engine + memory + consent as the PWA) → chunked send
//   → operational log + audit.
//
// Honesty rules (identical to WhatsApp):
//   * An unlinked chat gets a truthful no-access reply —
//     messaging the bot NEVER grants access.
//   * Media messages are received and acknowledged, never
//     claimed to be understood.
//   * Secret-shaped content never leaves the boundary.
//   * An unconfigured integration is an integration fault,
//     reported as such — not a refusal.
// =========================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  chunkForTelegram,
  maskChatId,
  parseTelegramUpdate,
  TELEGRAM_SECRET_HEADER,
  verifyTelegramSecret,
  type InboundTelegramMessage,
} from "../_shared/archie-ai/telegram/protocol.ts";
// containsSecret: the SAME secret-shape detector the WhatsApp
// channel uses — one boundary policy across channels.
import { containsSecret } from "../_shared/archie-ai/whatsapp/protocol.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_KEY = Deno.env.get("ARCHIE_INTERNAL_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // ---- Webhook security: constant-time secret-token check.
  //  An unconfigured secret refuses EVERYTHING — an open
  //  webhook would let anyone inject messages.
  const secret = req.headers.get(TELEGRAM_SECRET_HEADER);
  if (!verifyTelegramSecret(secret, WEBHOOK_SECRET)) {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "BAD_REQUEST" });
  }

  const { messages, ignoredKinds } = parseTelegramUpdate(payload);
  // Ignored kinds are acknowledged 200 (Telegram would retry
  // forever otherwise) — never silently "processed".
  if (messages.length === 0) {
    if (ignoredKinds.length > 0) {
      await db.from("frelux_archie_telegram_events").insert([
        { event_key: `ignored:${Date.now()}`, kind: `ignored:${ignoredKinds.join("+")}` },
      ]).then(() => undefined, () => undefined);
    }
    return Response.json({ ok: true, ignored: ignoredKinds });
  }

  for (const msg of messages) await handleInbound(msg);
  return Response.json({ ok: true, processed: messages.length });
});

// ---------------------------------------------------------
// Channel settings — Owner kill switch (explicit gate on
// this outbound channel, per owner directive).
// ---------------------------------------------------------
let settingsCache: { at: number; value: { enabled: boolean } | null } = {
  at: 0,
  value: null,
};
async function getSettings() {
  if (settingsCache.value && Date.now() - settingsCache.at < 10_000)
    return settingsCache.value;
  const { data, error } = await db
    .from("frelux_archie_telegram_settings")
    .select("enabled")
    .eq("id", 1)
    .maybeSingle();
  const value = error || !data ? null : (data as { enabled: boolean });
  settingsCache = { at: Date.now(), value };
  return value;
}

interface AccountRow {
  id: string;
  chat_id: string;
  user_id: string | null;
  role: "owner" | "authorized" | "family" | "customer";
  status: "pending" | "active" | "revoked";
}

const UNLINKED_REPLY =
  "You've reached ARCHIE, but this Telegram chat isn't linked to an ARCHIE account. Linking is done by the Owner in the ARCHIE Admin console — messaging this bot alone never grants access.";
const INACTIVE_REPLY =
  "This chat's ARCHIE link is not currently active. The Owner manages linked chats from the ARCHIE Admin console.";
const MEDIA_REPLY =
  (kind: string) =>
  `I received your ${kind} — Telegram media is received and logged in this channel, but not yet understood here. I'll say so rather than pretend. Sensitive operations stay behind Owner Secret controls in the app.`;

async function handleInbound(msg: InboundTelegramMessage): Promise<void> {
  // ---- Idempotency FIRST: Telegram redelivers failed
  //  webhook deliveries; the event row is inserted exactly
  //  once (PRIMARY KEY).
  const { error: dupErr } = await db
    .from("frelux_archie_telegram_events")
    .insert([{ event_key: `update:${msg.updateId}`, kind: "message" }]);
  if (dupErr) return; // unique violation → already processed

  // ---- Kill switch: record arrival metadata, never reply.
  const settings = await getSettings();
  if (!settings || !settings.enabled) {
    const { data: acct } = await db
      .from("frelux_archie_telegram_accounts")
      .select("id")
      .eq("chat_id", msg.chatId)
      .maybeSingle();
    await db.from("frelux_archie_telegram_messages").insert([
      {
        account_id: acct?.id ?? null,
        direction: "in",
        update_id: msg.updateId,
        media_type: msg.type,
        body: null, // content never stored while disabled
        status: "received",
        error: "channel_disabled",
      },
    ]);
    return;
  }

  // ---- Owner-linked account lookup — the ONLY grant.
  const { data: account } = await db
    .from("frelux_archie_telegram_accounts")
    .select("id,chat_id,user_id,role,status")
    .eq("chat_id", msg.chatId)
    .maybeSingle();
  const acct = (account ?? null) as AccountRow | null;

  if (!acct) {
    await db.from("frelux_archie_telegram_messages").insert([
      {
        account_id: null,
        direction: "in",
        update_id: msg.updateId,
        media_type: msg.type,
        body: null, // unlinked-sender content is never stored
        status: "failed",
        error: "unlinked_chat",
      },
    ]);
    await sendTelegramText(msg.chatId, UNLINKED_REPLY);
    return;
  }
  if (acct.status !== "active") {
    await db.from("frelux_archie_telegram_messages").insert([
      {
        account_id: acct.id,
        direction: "in",
        update_id: msg.updateId,
        media_type: msg.type,
        body: null,
        status: "failed",
        error: `link_${acct.status}`,
      },
    ]);
    await sendTelegramText(msg.chatId, INACTIVE_REPLY);
    return;
  }

  // ---- Store the inbound turn (operational log).
  await db.from("frelux_archie_telegram_messages").insert([
    {
      account_id: acct.id,
      direction: "in",
      update_id: msg.updateId,
      media_type: msg.type,
      body: msg.text,
      status: "processed",
    },
  ]);
  await db
    .from("frelux_archie_telegram_accounts")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", acct.id);

  // ---- Media: honest acknowledgment, never fake insight.
  if (msg.type !== "text" || !msg.text) {
    await replyToChat(acct, MEDIA_REPLY(msg.type));
    return;
  }

  // ---- Status command (same shape as WhatsApp's channel).
  if (msg.text.trim().toLowerCase() === "status") {
    await replyToChat(acct, await statusText(acct));
    return;
  }

  // ---- THE ONE ARCHIE CORE — same engine as the PWA.
  const core = await askArchieCore(acct, msg.text);
  await replyToChat(acct, core.reply);
}

async function askArchieCore(
  account: AccountRow,
  message: string,
): Promise<{ ok: boolean; reply: string }> {
  if (!INTERNAL_KEY) {
    return {
      ok: false,
      reply:
        "The ARCHIE core link is not configured (ARCHIE_INTERNAL_KEY). This is an integration fault, not a refusal — the Owner can fix it in the Admin console.",
    };
  }
  // Conversation continuity: the last turns of THIS chat.
  const { data: turns } = await db
    .from("frelux_archie_telegram_messages")
    .select("direction,body")
    .eq("account_id", account.id)
    .eq("media_type", "text")
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
        clientId: `telegram:${maskChatId(account.chat_id)}`,
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
// Telegram Bot API send.
// ---------------------------------------------------------
async function sendTelegramText(
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "Telegram sending is not configured (TELEGRAM_BOT_TOKEN)" };
  if (containsSecret(text)) return { ok: false, error: "response blocked: contained secret-shaped content" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Telegram API ${res.status}: ${detail.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `send failed: ${String(e).slice(0, 160)}` };
  }
}

/** Chunked reply, each chunk logged against the account. */
async function replyToChat(
  account: AccountRow,
  text: string,
): Promise<number> {
  const chunks = chunkForTelegram(text);
  for (const chunk of chunks) {
    const sent = await sendTelegramText(account.chat_id, chunk);
    await db.from("frelux_archie_telegram_messages").insert([
      {
        account_id: account.id,
        direction: "out",
        media_type: "text",
        body: chunk,
        status: sent.ok ? "sent" : "failed_send",
        error: sent.ok ? null : (sent.error ?? "unknown send error").slice(0, 300),
      },
    ]);
  }
  return chunks.length;
}

async function statusText(acct: AccountRow): Promise<string> {
  const { count: msgs24 } = await db
    .from("frelux_archie_telegram_messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", acct.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return [
    "ARCHIE Telegram Assistant — status:",
    `• Integration: ${BOT_TOKEN ? "configured" : "MISSING — set TELEGRAM_BOT_TOKEN"}`,
    `• Webhook security: ${WEBHOOK_SECRET ? "secret-token verification active" : "MISSING — set TELEGRAM_WEBHOOK_SECRET (an unconfigured secret refuses all deliveries)"}`,
    `• Your chat link: ${acct.status}${acct.role === "owner" ? " (owner)" : ""}`,
    `• Messages (24h): ${msgs24 ?? 0}`,
    "Cognition: every reply comes from the ONE ARCHIE core (same engine as the PWA). Sensitive operations stay behind Owner Secret controls in the app.",
  ].join("\n");
}
