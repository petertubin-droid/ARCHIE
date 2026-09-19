import { describe, it, expect } from "vitest";

// =========================================================
// ARCHIE WHATSAPP PROTOCOL — the EXACT production code
//
// This suite imports the pure communication-layer module
// that the archie-whatsapp edge function runs in production
// (supabase/functions/_shared/archie-ai/whatsapp/protocol.ts).
// Not a copy, not a mock — the same file.
// =========================================================

import {
  verifyHubChallenge,
  verifyHubSignature,
  hmacSha256Hex,
  parseWebhookPayload,
  chunkForWhatsApp,
  classifyOwnerCommand,
  parseReminder,
  maskPhone,
  containsSecret,
  WHATSAPP_TEXT_LIMIT,
} from "../../../../supabase/functions/_shared/archie-ai/whatsapp/protocol.ts";

function challengeUrl(params: Record<string, string>) {
  const url = new URL("https://api.example.com/functions/v1/archie-whatsapp");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

describe("webhook verification (GET handshake)", () => {
  it("echoes the challenge for a valid subscribe request", () => {
    const res = verifyHubChallenge(
      challengeUrl({
        "hub.mode": "subscribe",
        "hub.verify_token": "the-token",
        "hub.challenge": "1234567890",
      }),
      "the-token",
    );
    expect(res).toEqual({ ok: true, challenge: "1234567890" });
  });

  it("refuses a wrong verify token", () => {
    const res = verifyHubChallenge(
      challengeUrl({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "123",
      }),
      "the-token",
    );
    expect(res.ok).toBe(false);
  });

  it("refuses when no token is configured (fail closed)", () => {
    const res = verifyHubChallenge(
      challengeUrl({
        "hub.mode": "subscribe",
        "hub.verify_token": "anything",
        "hub.challenge": "123",
      }),
      "",
    );
    expect(res.ok).toBe(false);
  });

  it("refuses a non-subscribe mode", () => {
    const res = verifyHubChallenge(
      challengeUrl({
        "hub.mode": "other",
        "hub.verify_token": "the-token",
        "hub.challenge": "123",
      }),
      "the-token",
    );
    expect(res.ok).toBe(false);
  });
});

describe("webhook signature (POST, X-Hub-Signature-256)", () => {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [],
  });

  it("accepts a correctly signed request", async () => {
    const sig = await hmacSha256Hex("app-secret", body);
    const ok = await verifyHubSignature(body, `sha256=${sig}`, "app-secret");
    expect(ok).toBe(true);
  });

  it("refuses a tampered body", async () => {
    const sig = await hmacSha256Hex("app-secret", body);
    const ok = await verifyHubSignature(
      body + "tampered",
      `sha256=${sig}`,
      "app-secret",
    );
    expect(ok).toBe(false);
  });

  it("refuses a missing header and a malformed signature", async () => {
    expect(await verifyHubSignature(body, null, "app-secret")).toBe(false);
    expect(await verifyHubSignature(body, "sha256=zzz", "app-secret")).toBe(
      false,
    );
  });

  it("fails closed when the app secret is not configured", async () => {
    const sig = await hmacSha256Hex("app-secret", body);
    expect(await verifyHubSignature(body, `sha256=${sig}`, "")).toBe(false);
  });
});

describe("Cloud API payload parsing", () => {
  const TEXT_PAYLOAD = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "2348000000000" },
              contacts: [
                { profile: { name: "Peter" }, wa_id: "2348000000001" },
              ],
              messages: [
                {
                  from: "2348000000001",
                  id: "wamid.abc",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "status" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  it("parses an inbound text message with sender + profile", () => {
    const { messages } = parseWebhookPayload(TEXT_PAYLOAD);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      waMessageId: "wamid.abc",
      waId: "2348000000001",
      profileName: "Peter",
      type: "text",
      text: "status",
    });
  });

  it("parses media messages (audio with caption filename etc.)", () => {
    const { messages } = parseWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "2348000000001",
                    id: "wamid.audio",
                    type: "audio",
                    audio: { id: "media-123" },
                  },
                  {
                    from: "2348000000001",
                    id: "wamid.doc",
                    type: "document",
                    document: { id: "media-456", filename: "plan.pdf" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(messages[0]).toMatchObject({
      type: "audio",
      mediaId: "media-123",
      text: null,
    });
    expect(messages[1]).toMatchObject({
      type: "document",
      mediaId: "media-456",
      filename: "plan.pdf",
    });
  });

  it("normalizes unknown message types to 'unsupported'", () => {
    const { messages } = parseWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "1", id: "x", type: "puzzle" }],
              },
            },
          ],
        },
      ],
    });
    expect(messages[0].type).toBe("unsupported");
  });

  it("parses delivery statuses", () => {
    const { statuses } = parseWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.out1", status: "delivered", timestamp: "1" },
                  { id: "wamid.out2", status: "failed", timestamp: "2" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(statuses).toEqual([
      { waMessageId: "wamid.out1", status: "delivered", timestamp: "1" },
      { waMessageId: "wamid.out2", status: "failed", timestamp: "2" },
    ]);
  });

  it("survives garbage payloads without throwing", () => {
    expect(parseWebhookPayload(null).messages).toEqual([]);
    expect(parseWebhookPayload({}).statuses).toEqual([]);
    expect(parseWebhookPayload("nope" as unknown).messages).toEqual([]);
    expect(parseWebhookPayload({ entry: "not-an-array" }).messages).toEqual([]);
  });
});

describe("outgoing message shaping", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkForWhatsApp("Hello owner")).toEqual(["Hello owner"]);
  });

  it("splits long responses at boundaries within the WhatsApp limit", () => {
    const para = "Sentence one. Sentence two. Sentence three. ";
    const long = Array(200).fill(para).join("\n\n");
    const chunks = chunkForWhatsApp(long, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toContain(
      "Sentence one.",
    );
  });

  it("hard-splits pathological no-boundary text rather than losing content", () => {
    const long = "x".repeat(WHATSAPP_TEXT_LIMIT + 500);
    const chunks = chunkForWhatsApp(long);
    expect(chunks.join("").length).toBe(WHATSAPP_TEXT_LIMIT + 500);
  });
});

describe("explicit owner command classification", () => {
  it("recognizes status / help commands (with or without ARCHIE prefix)", () => {
    expect(classifyOwnerCommand("status").kind).toBe("status");
    expect(classifyOwnerCommand("ARCHIE, status").kind).toBe("status");
    expect(classifyOwnerCommand("What's your status?").kind).toBe("status");
    expect(classifyOwnerCommand("help").kind).toBe("help");
  });

  it("recognizes forget-recent privacy commands", () => {
    expect(classifyOwnerCommand("forget what I just told you").kind).toBe(
      "forget_recent",
    );
    expect(classifyOwnerCommand("don't remember this").kind).toBe(
      "forget_recent",
    );
    expect(classifyOwnerCommand("ARCHIE: don't remember this.").kind).toBe(
      "forget_recent",
    );
  });

  it("recognizes topic forgets and memory queries with their topic", () => {
    const f = classifyOwnerCommand("forget screeding ratio");
    expect(f).toEqual({ kind: "forget_topic", topic: "screeding ratio" });
    const q = classifyOwnerCommand("what do you remember about granite?");
    expect(q).toEqual({ kind: "memory_query", topic: "granite" });
  });

  it("deliberately does NOT intercept teaching — 'remember' flows to the cognitive core", () => {
    // The communication layer must never own memory writes; the
    // core's teaching pipeline (redaction, extraction,
    // validation, conflicts) is the ONE writer path.
    expect(
      classifyOwnerCommand("remember this: screeding ratio is 1:4").kind,
    ).toBe("none");
    expect(classifyOwnerCommand("learn that granite is igneous").kind).toBe(
      "none",
    );
  });

  it("classifies ordinary conversation as none", () => {
    expect(classifyOwnerCommand("what is the price of cement").kind).toBe(
      "none",
    );
    expect(classifyOwnerCommand("hello").kind).toBe("none");
  });
});

describe("reminder parsing (deterministic times only)", () => {
  const NOW = new Date("2026-09-10T12:00:00Z");

  it("parses 'remind me in N minutes to X'", () => {
    const r = parseReminder("remind me in 20 minutes to water the plants", NOW);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("reminder");
    expect(r.note).toBe("water the plants");
    expect(r.needsTime).toBe(false);
    expect(new Date(r.dueAt!).getTime()).toBe(NOW.getTime() + 20 * 60_000);
  });

  it("parses absolute times 'remind me at DATE to X'", () => {
    const r = parseReminder(
      "remind me at 2026-09-15 09:00 to call the supplier",
      NOW,
    );
    expect(r.note).toBe("call the supplier");
    // Fix 40: 09:00 is wall-clock LAGOS time → 08:00 UTC.
    expect(r.dueAt).toBe("2026-09-15T08:00:00.000Z");
  });

  it("creates undated tasks from 'create a task to X'", () => {
    const r = parseReminder("create a task to fix the water pump", NOW);
    expect(r.kind).toBe("task");
    expect(r.note).toBe("fix the water pump");
    expect(r.dueAt).toBeNull();
    expect(r.needsTime).toBe(false);
  });

  it("refuses to guess a time — a reminder without a parsed time asks for one", () => {
    const r = parseReminder("remind me to call the bank", NOW);
    expect(r.note).toBe("call the bank");
    expect(r.needsTime).toBe(true);
    expect(r.dueAt).toBeNull();
  });

  it("returns an empty note for non-reminder text (routed to the core)", () => {
    const r = parseReminder("what is 2 + 2", NOW);
    expect(r.note).toBe("");
    expect(r.needsTime).toBe(true);
  });
});

describe("privacy utilities", () => {
  it("masks phone numbers to the last 4 digits", () => {
    expect(maskPhone("2348012345678")).toBe("***5678");
    expect(maskPhone("")).toBe("***");
  });

  it("detects secret-shaped content so it is never stored or echoed", () => {
    expect(containsSecret("my api key = abc123xyz")).toBe(true);
    expect(containsSecret("bearer: sometokenvalue")).toBe(true);
    expect(containsSecret("sk-ABCDEFGHIJKLMNOP123456")).toBe(true);
    expect(containsSecret("the screeding ratio is 1:4")).toBe(false);
    expect(containsSecret("normal construction question")).toBe(false);
  });
});

// ---------------------------------------------------------
// Batch 12 (Level 8) regressions — fixes 40, 41, 42
// ---------------------------------------------------------
describe("batch 12 — protocol fixes", () => {
  it("fix 40: absolute due times are interpreted in the owner's timezone (UTC+1), not UTC", () => {
    const r = parseReminder(
      "archie remind me to call the supplier due_at 2026-09-15 14:00",
    );
    expect(r.ok).toBe(true);
    expect(r.dueAt).toBe("2026-09-15T13:00:00.000Z"); // 14:00 Lagos = 13:00 UTC
  });

  it("fix 40: undated absolute reminders default to 09:00 Lagos", () => {
    const r = parseReminder(
      "archie remind me to inspect the slab due_at 2026-10-01",
    );
    expect(r.dueAt).toBe("2026-10-01T08:00:00.000Z");
  });

  it("fix 41: chunks never exceed the 4096 limit when a separator straddles it", () => {
    // ". " starting at limit-1 used to cut at limit+1 → a 4097-char chunk.
    const text = "a".repeat(4094) + ". " + "b".repeat(50);
    const chunks = chunkForWhatsApp(text);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4096);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("fix 42: 'FORGET THE LAST MESSAGE' (uppercase) routes to forget_recent", () => {
    expect(classifyOwnerCommand("FORGET THE LAST MESSAGE").kind).toBe(
      "forget_recent",
    );
  });
});
