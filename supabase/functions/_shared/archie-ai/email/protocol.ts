// =========================================================
// ARCHIE EMAIL CHANNEL — PROTOCOL (engine 13, audit E-3)
//
// Deterministic email-channel protocol behind the same
// channel architecture as WhatsApp/Telegram. Provider-
// independent by design: the inbound webhook contract is the
// generic envelope every email webhook provider posts
// (from, to, subject, text) plus a provider token header for
// verification; the outbound adapter is a pluggable provider
// call. Honesty rules identical to the sibling channels —
// an unconfigured provider is an integration fault reported
// as such; nothing is ever fabricated.
// =========================================================

/** Outbound email providers the adapter supports today. */
export type EmailProvider = "resend" | "postmark" | "none";

export const EMAIL_BODY_LIMIT = 80_000; // generous plain-text cap

// ---------------------------------------------------------
// Inbound webhook envelope (provider-agnostic contract)
// ---------------------------------------------------------

export interface InboundEmail {
  /** Envelope Message-ID — the idempotency key. */
  messageId: string;
  /** Sender email — the mapped identity. */
  from: string;
  /** Recipient (ARCHIE's inbound address). */
  to: string | null;
  subject: string | null;
  /** Plain-text body, when the provider posts one. */
  text: string | null;
}

export interface EmailParseResult {
  ok: boolean;
  email?: InboundEmail;
  /** Honest reason when not ok. */
  reason?: string;
}

export function parseInboundEmail(payload: unknown): EmailParseResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "payload not an object" };
  }
  const p = payload as Record<string, unknown>;
  const messageId = str(p["Message-ID"]) ?? str(p.message_id) ?? str(p.messageId);
  const from = str(p.from) ?? str(p.From) ?? str(p.sender);
  if (!messageId) return { ok: false, reason: "missing Message-ID (idempotency key)" };
  if (!from || !from.includes("@")) return { ok: false, reason: "missing or malformed sender" };
  return {
    ok: true,
    email: {
      messageId,
      from: from.toLowerCase().trim(),
      to: str(p.to) ?? str(p.To) ?? null,
      subject: str(p.subject) ?? str(p.Subject) ?? null,
      // HTML-only mail has no text part — that is honest: we
      // never parse HTML in the channel.
      text: str(p.text) ?? str(p["text/plain"]) ?? null,
    },
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ---------------------------------------------------------
// Outbound — provider adapter. Honest: "none" configured
// means every send fails with the integration-fault message,
// never a fake success.
// ---------------------------------------------------------

export interface EmailSendResult {
  ok: boolean;
  error?: string;
}

export async function sendEmailText(opts: {
  provider: EmailProvider;
  apiKey: string;
  to: string;
  fromAddress: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  const { provider, apiKey, to, fromAddress, subject, text } = opts;
  if (!provider || provider === "none" || !apiKey) {
    return {
      ok: false,
      error:
        "Email sending is not configured (EMAIL_PROVIDER + EMAIL_API_KEY + EMAIL_FROM_ADDRESS). This is an integration fault, not a refusal — the Owner can fix it in the Admin console.",
    };
  }
  const body = text.slice(0, EMAIL_BODY_LIMIT);
  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: fromAddress, to, subject, text: body }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `Resend API ${res.status}: ${detail.slice(0, 120)}` };
      }
      return { ok: true };
    }
    if (provider === "postmark") {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          From: fromAddress,
          To: to,
          Subject: subject,
          TextBody: body,
          MessageStream: "outbound",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `Postmark API ${res.status}: ${detail.slice(0, 120)}` };
      }
      return { ok: true };
    }
    return { ok: false, error: `unknown email provider "${provider}"` };
  } catch (e) {
    return { ok: false, error: `send failed: ${String(e).slice(0, 160)}` };
  }
}

// ---------------------------------------------------------
// Shared channel helpers
// ---------------------------------------------------------

/** Privacy: email addresses never appear verbatim in logs. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "*".repeat(Math.min(email.length, 4));
  const local = email.slice(0, at);
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${email.slice(at + 1)}`;
}

/** Strip quoted reply lines from an inbound email body so the
 *  core only ever sees the NEW words the sender wrote (a
 *  deterministic, structural trim — not content analysis). */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // Structural conventions: any quoted line ("..." or
    // "...quoted text"), an "On <date> <person> wrote:"
    // attribution, or the classic Original-Message marker
    // ends the NEW content. Found by test: the original
    // `^>+\s?$` only matched a ">" alone on its line, so
    // "> see you then" was never trimmed.
    if (
      /^>/.test(t) ||
      /^on .+ wrote:$/i.test(t) ||
      /^-+\s*original\s+message\s*-+$/i.test(t)
    )
      break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}
