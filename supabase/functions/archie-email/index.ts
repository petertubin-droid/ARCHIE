// archie-email — EMAIL CHANNEL (engine 13, audit E-3, tranche 2)
// =========================================================
// Inbound/outbound email adapter behind the same channel
// architecture as WhatsApp/Telegram:
//
//   Provider webhook → shared-secret verify → idempotency
//   → Owner-linked address lookup (emailing ARCHIE NEVER
//   grants access) → kill switch → THE ONE ARCHIE CORE
//   (archie-chat) → provider send → operational log + audit.
//
// The channel is DISABLED until the Owner enables it and
// wires a provider (EMAIL_PROVIDER/EMAIL_API_KEY). Until
// then every send reports the honest integration fault —
// nothing is faked, and inbound mail is logged as received
// with no content while disabled.
// =========================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  maskEmail,
  parseInboundEmail,
  sendEmailText,
  stripQuotedReply,
  type EmailProvider,
} from "../_shared/archie-ai/email/protocol.ts";
import { containsSecret } from "../_shared/archie-ai/whatsapp/protocol.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_KEY = Deno.env.get("ARCHIE_INTERNAL_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("EMAIL_WEBHOOK_SECRET") ?? "";
const PROVIDER = (Deno.env.get("EMAIL_PROVIDER") ?? "none") as EmailProvider;
const API_KEY = Deno.env.get("EMAIL_API_KEY") ?? "";
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "";

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
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  // ---- Webhook security: shared secret (constant-time shape).
  //  Unconfigured secret refuses EVERYTHING.
  const secret = req.headers.get("x-archie-email-secret");
  if (!WEBHOOK_SECRET || !secret || secret.length !== WEBHOOK_SECRET.length) {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }
  let diff = 0;
  for (let i = 0; i < secret.length; i++)
    diff |= secret.charCodeAt(i) ^ WEBHOOK_SECRET.charCodeAt(i);
  if (diff !== 0) return json(401, { ok: false, error: "UNAUTHORIZED" });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "BAD_REQUEST" });
  }

  const parsed = parseInboundEmail(payload);
  if (!parsed.ok) return json(422, { ok: false, error: parsed.reason });
  await handleInbound(parsed.email!);
  return Response.json({ ok: true });
});

interface AccountRow {
  id: string;
  email: string;
  user_id: string | null;
  role: "owner" | "authorized" | "family" | "customer";
  status: "pending" | "active" | "revoked";
}

const UNLINKED_REPLY =
  "You've reached ARCHIE by email, but this address isn't linked to an ARCHIE account. Linking is done by the Owner in the ARCHIE Admin console — emailing this address alone never grants access.";
const NO_TEXT_REPLY =
  "I received your email, but it arrived HTML-only — this channel reads plain text only. I'll say so rather than pretend. Please resend in plain text.";

async function handleInbound(email: {
  messageId: string;
  from: string;
  to: string | null;
  subject: string | null;
  text: string | null;
}): Promise<void> {
  // ---- Idempotency FIRST: providers retry deliveries.
  const { error: dupErr } = await db
    .from("frelux_archie_email_events")
    .insert([{ event_key: `email:${email.messageId}`, kind: "message" }]);
  if (dupErr) return;

  // ---- Kill switch: arrival metadata only, no content, no reply.
  const { data: settings } = await db
    .from("frelux_archie_email_settings")
    .select("enabled")
    .eq("id", 1)
    .maybeSingle();
  if (!settings?.enabled) {
    const { data: acct } = await db
      .from("frelux_archie_email_accounts")
      .select("id")
      .eq("email", email.from)
      .maybeSingle();
    await db.from("frelux_archie_email_messages").insert([
      {
        account_id: acct?.id ?? null,
        direction: "in",
        smtp_message_id: email.messageId.slice(0, 500),
        media_type: email.text ? "text" : "html-only",
        body: null,
        status: "received",
        error: "channel_disabled",
      },
    ]);
    return;
  }

  // ---- Owner-linked lookup — the ONLY grant.
  const { data: account } = await db
    .from("frelux_archie_email_accounts")
    .select("id,email,user_id,role,status")
    .eq("email", email.from)
    .maybeSingle();
  const acct = (account ?? null) as AccountRow | null;

  if (!acct || acct.status !== "active") {
    await db.from("frelux_archie_email_messages").insert([
      {
        account_id: acct?.id ?? null,
        direction: "in",
        smtp_message_id: email.messageId.slice(0, 500),
        media_type: "text",
        body: null, // unlinked/inactive content never stored
        status: "failed",
        error: acct ? `link_${acct.status}` : "unlinked_sender",
      },
    ]);
    if (!acct) await sendReply(email.from, "ARCHIE — address not linked", UNLINKED_REPLY);
    return;
  }

  // ---- HTML-only mail: honest, never pretend to have read it.
  if (!email.text) {
    await db.from("frelux_archie_email_messages").insert([
      {
        account_id: acct.id,
        direction: "in",
        smtp_message_id: email.messageId.slice(0, 500),
        subject: email.subject?.slice(0, 500) ?? null,
        media_type: "html-only",
        body: null,
        status: "processed",
        error: "html_only_not_parsed",
      },
    ]);
    await sendReply(email.from, "Re: ARCHIE — plain text needed", NO_TEXT_REPLY);
    return;
  }

  // ---- Store the inbound turn (new words only — quoted
  //  reply lines are structurally trimmed, not analyzed).
  const newWords = stripQuotedReply(email.text);
  await db.from("frelux_archie_email_messages").insert([
    {
      account_id: acct.id,
      direction: "in",
      smtp_message_id: email.messageId.slice(0, 500),
      subject: email.subject?.slice(0, 500) ?? null,
      media_type: "text",
      body: newWords.slice(0, 20_000),
      status: "processed",
    },
  ]);
  await db
    .from("frelux_archie_email_accounts")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", acct.id);

  if (!newWords) return; // an email of pure quoted history: nothing to answer

  // ---- THE ONE ARCHIE CORE.
  const core = await askArchieCore(acct, newWords);
  const subject = `Re: ${email.subject ?? "your message"}`.slice(0, 200);
  await sendReply(email.from, subject, core.reply, acct.id);
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
  const { data: turns } = await db
    .from("frelux_archie_email_messages")
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
        clientId: `email:${maskEmail(account.email)}`,
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
    if (!reply)
      return { ok: false, reply: "The ARCHIE core returned an empty answer — logged for the Owner." };
    return { ok: true, reply };
  } catch (e) {
    return {
      ok: false,
      reply: `The ARCHIE core is unreachable right now (${String(e).slice(0, 80)}). It has been logged — email again shortly.`,
    };
  }
}

async function sendReply(
  to: string,
  subject: string,
  text: string,
  accountId?: string,
): Promise<void> {
  if (containsSecret(text)) {
    await db.from("frelux_archie_email_messages").insert([
      {
        account_id: accountId ?? null,
        direction: "out",
        subject,
        media_type: "text",
        body: null,
        status: "failed_send",
        error: "blocked: secret-shaped content",
      },
    ]);
    return;
  }
  const sent = await sendEmailText({
    provider: PROVIDER,
    apiKey: API_KEY,
    to,
    fromAddress: FROM_ADDRESS,
    subject,
    text,
  });
  await db.from("frelux_archie_email_messages").insert([
    {
      account_id: accountId ?? null,
      direction: "out",
      subject,
      media_type: "text",
      body: text.slice(0, 20_000),
      status: sent.ok ? "sent" : "failed_send",
      error: sent.ok ? null : (sent.error ?? "unknown send error").slice(0, 300),
    },
  ]);
}
