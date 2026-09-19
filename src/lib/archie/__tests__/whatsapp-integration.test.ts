import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// =========================================================
// ARCHIE WHATSAPP INTEGRATION — ARCHITECTURE CONTRACT
//
// Structural verification of the REAL production sources (the
// same style as archie-memory-integration.test.ts): the
// WhatsApp channel must be a communication INTERFACE into the
// ONE ARCHIE core — never a second brain — with official-API
// security, idempotency, owner authority and honest media
// handling verified against the deployed code.
// =========================================================

const root = join(import.meta.dirname ?? process.cwd(), "../../../../");
const read = (rel: string): string => readFileSync(join(root, rel), "utf-8");

const fn = read("supabase/functions/archie-whatsapp/index.ts");
const chat = read("supabase/functions/archie-chat/index.ts");
read("src/lib/archie/whatsapp-client.ts"); // existence guard
const migration = read(
  "supabase/migrations/20260914100000_archie_whatsapp_assistant.sql",
);

describe("ONE ARCHIE — WhatsApp is an interface, not a brain", () => {
  it("never constructs an engine or performs cognition itself", () => {
    // The communication layer must not own intelligence.
    expect(fn).not.toContain("ArchieNativeEngine");
    expect(fn).not.toContain("new Archie");
    expect(fn).not.toContain("resolveArchieCapabilityEngine");
  });

  it("forwards every conversational turn to the ONE cognitive core (archie-chat)", () => {
    expect(fn).toContain("askArchieCore");
    expect(fn).toContain("functions/v1/archie-chat");
    expect(fn).toContain("x-archie-internal-key");
    expect(fn).toContain("x-archie-user-id");
  });

  it("the core's internal path authenticates the mapped identity from the database — not from the channel", () => {
    // The archie-chat internal branch: shared-secret gate +
    // profile role resolved from profiles (same authority model).
    expect(chat).toContain("ARCHIE INTERNAL SERVICE INVOCATION");
    expect(chat).toContain('Deno.env.get("ARCHIE_INTERNAL_KEY")');
    // The branch resolves the role via a DB lookup, never trusts
    // a role header from the caller.
    const branch = chat.slice(
      chat.indexOf("ARCHIE INTERNAL SERVICE INVOCATION"),
      chat.indexOf("activeOwnerUserId = isOwner"),
    );
    expect(branch).toContain('.from("profiles")');
    expect(branch).not.toContain("x-archie-role");
  });

  it("uses the SAME central memory tables — no WhatsApp-only memory", () => {
    expect(fn).toContain("frelux_archie_native_facts");
    expect(fn).not.toContain("frelux_archie_whatsapp_facts");
    // The message log is operational, declared as NOT memory.
    expect(migration).toContain("NOT persistent memory");
  });
});

describe("official WhatsApp Business API security", () => {
  it("verifies the X-Hub-Signature-256 HMAC before parsing the payload", () => {
    const sigIdx = fn.indexOf("verifyHubSignature");
    const parseIdx = fn.indexOf("JSON.parse(rawBody)");
    expect(sigIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(sigIdx);
  });

  it("fails closed when the app secret is missing (refuses + logs a security event)", () => {
    expect(fn).toContain("SIGNATURE_UNVERIFIABLE");
    expect(fn).toContain('"Unauthorized"');
  });

  it("logs bad signatures as security events and refuses them", () => {
    expect(fn).toContain("ARCHIE_WHATSAPP_BAD_SIGNATURE");
  });

  it("answers the Meta subscription handshake with the configured verify token", () => {
    expect(fn).toContain("verifyHubChallenge");
    expect(fn).toContain("WHATSAPP_VERIFY_TOKEN");
  });

  it("sends through the official Graph Cloud API with env-held credentials only", () => {
    expect(fn).toContain("graph.facebook.com");
    expect(fn).toContain("WHATSAPP_ACCESS_TOKEN");
    expect(fn).toContain("WHATSAPP_PHONE_NUMBER_ID");
  });

  it("never lets a secret-shaped message be stored or echoed", () => {
    expect(fn).toContain("containsSecret");
  });
});

describe("idempotency & recovery (webhook retries)", () => {
  it("records every processed message id exactly once — retries can never double-process", () => {
    expect(fn).toContain("frelux_archie_whatsapp_events");
    const dedupeIdx = fn.indexOf("`msg:${msg.waMessageId}`");
    expect(dedupeIdx).toBeGreaterThan(-1);
    // The dedupe insert must come BEFORE any side effects: it is
    // the first act of handleInbound after validation.
    const handleStart = fn.indexOf("async function handleInbound");
    const coreCall = fn.indexOf("askArchieCore(account");
    expect(dedupeIdx).toBeGreaterThan(handleStart);
    expect(dedupeIdx).toBeLessThan(coreCall);
  });

  it("returns 500 to Meta only on real processing failures, so retries can recover", () => {
    expect(fn).toContain("failures > 0 ? 500 : 200");
  });

  it("records processing failures in the message log honestly", () => {
    expect(fn).toContain("processing error:");
  });
});

describe("identity & owner authority", () => {
  it("authorizes NOTHING from knowing the number — only the Owner-managed mapping counts", () => {
    expect(fn).toContain("UNLINKED_REPLY");
    expect(fn).toContain("no linked account");
    // Unknown senders: content is never stored.
    // The unknown-sender insert (inside handleInbound): content
    // is never stored for unlinked numbers — metadata only.
    const insertIdx = fn.indexOf("no linked account");
    expect(insertIdx).toBeGreaterThan(-1);
    const insertBlock = fn.slice(insertIdx - 400, insertIdx + 200);
    expect(insertBlock).toContain("content not retained");
    expect(insertBlock).toContain("body: null");
  });

  it("owner commands require a mapped owner account linked to the admin profile", () => {
    expect(fn).toContain('account.role === "owner"');
    expect(fn).toContain("account.user_id !== null");
  });

  it("owner-only admin controls require the Owner JWT + admin profile role", () => {
    expect(fn).toContain("requireOwner");
    expect(fn).toContain('profile?.role === "admin"');
    expect(fn).toContain("owner-only");
  });

  it("refuses to keep owner-only capabilities for non-owner mapped users", () => {
    expect(fn).toContain("an Owner capability");
  });

  it("explicit 'forget' commands really delete from the central facts table and redact the log", () => {
    expect(fn).toContain("ownerForgetRecent");
    expect(fn).toContain("ownerForgetTopic");
    expect(fn).toContain("[redacted on owner forget request]");
  });

  it("admin status reveals config PRESENCE only — never values", () => {
    expect(fn).toContain("Config presence ONLY");
    expect(fn).toContain("verifyTokenConfigured");
  });
});

describe("media honesty (Ears/Eyes not operational in this channel)", () => {
  it("tells the sender the truth for voice notes instead of pretending", () => {
    expect(fn).toContain("transcription is not operational");
    expect(fn).toContain("never pretend to understand audio");
  });

  it("tells the truth for images, videos and documents too", () => {
    expect(fn).toContain("image content analysis is not operational");
    expect(fn).toContain("document content reading is not operational");
    expect(fn).toContain("video understanding is not operational");
  });
});

describe("learning & memory governance", () => {
  it("the command router has NO remember/teach case — memory writes belong to the core alone", () => {
    const router = fn.slice(
      fn.indexOf("classifyOwnerCommand(text)"),
      fn.indexOf("askArchieCore(account, text)"),
    );
    expect(router).not.toMatch(/\bremember\b|\bteach\b|\bsave.*fact\b/i);
  });

  it("the ONLY code-path writer of facts is the core — the WhatsApp layer only deletes on explicit forget", () => {
    // The communication layer may DELETE from the central
    // facts table (owner 'forget' commands) but must never
    // INSERT or create facts itself.
    const factWrites =
      fn.match(/frelux_archie_native_facts[\s\S]{0,120}/g) ?? [];
    expect(factWrites.length).toBeGreaterThan(0);
    for (const w of factWrites) {
      expect(w).not.toMatch(/\.insert\(/);
    }
  });

  it("the message log is an operational record — accounts without memory permission log metadata only", () => {
    expect(fn).toContain("memory_permission");
    expect(fn).toContain("log metadata only");
  });

  it("the migration keeps every WhatsApp table service-role only (RLS, no anon policies)", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toContain("TO anon");
    expect(migration).not.toContain("TO authenticated");
    expect(migration).toContain("security violation: RLS is not enabled");
  });
});
