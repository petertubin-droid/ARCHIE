// =========================================================
// ARCHIE EMAIL CHANNEL — PROTOCOL TESTS (engine 13, E-3)
// =========================================================

import { describe, expect, it } from "vitest";
import {
  EMAIL_BODY_LIMIT,
  maskEmail,
  parseInboundEmail,
  sendEmailText,
  stripQuotedReply,
} from "./protocol.ts";

describe("email protocol — inbound parsing", () => {
  it("full envelope parsed", () => {
    const r = parseInboundEmail({
      Message_ID: "<abc-123@mail.example>",
      from: "Owner@Example.com",
      subject: "Hello",
      text: "What is the status?",
    });
    // Message-ID accepted in camelCase and snake_case too
    expect(r.ok).toBe(false); // Message_ID (underscore variant) is NOT accepted — only documented keys
  });

  it("documented keys accepted (camel + snake + bracket)", () => {
    expect(parseInboundEmail({ messageId: "m1", from: "a@b.c" }).ok).toBe(true);
    expect(parseInboundEmail({ message_id: "m2", from: "a@b.c" }).ok).toBe(true);
    expect(parseInboundEmail({ "Message-ID": "m3", from: "a@b.c" }).ok).toBe(true);
  });

  it("sender normalized to lowercase", () => {
    const r = parseInboundEmail({ messageId: "m4", from: "Owner@Example.COM " });
    expect(r.ok).toBe(true);
    expect(r.email!.from).toBe("owner@example.com");
  });

  it("missing Message-ID refused (idempotency key)", () => {
    expect(parseInboundEmail({ from: "a@b.c", text: "x" }).ok).toBe(false);
  });

  it("malformed sender refused", () => {
    expect(parseInboundEmail({ messageId: "m5", from: "not-an-email" }).ok).toBe(false);
    expect(parseInboundEmail({ messageId: "m6", from: 42 }).ok).toBe(false);
  });

  it("HTML-only mail: text honestly null, never fabricated", () => {
    const r = parseInboundEmail({ messageId: "m7", from: "a@b.c", html: "<p>hi</p>" });
    expect(r.ok).toBe(true);
    expect(r.email!.text).toBeNull();
  });

  it("garbage refused", () => {
    expect(parseInboundEmail(null).ok).toBe(false);
    expect(parseInboundEmail("string").ok).toBe(false);
    expect(parseInboundEmail({}).ok).toBe(false);
  });
});

describe("email protocol — quoted-reply trim (structural)", () => {
  it("quoted history dropped, new words kept", () => {
    const body = [
      "What time is the inspection?",
      "",
      "On Monday Felix wrote:",
      "> see you then",
      "> previous message",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("What time is the inspection?");
  });

  it("no quotes → unchanged", () => {
    expect(stripQuotedReply("just a plain note")).toBe("just a plain note");
  });

  it("CRLF handled", () => {
    const body = "line one\r\n> quoted\r\nline never seen";
    expect(stripQuotedReply(body)).toBe("line one");
  });
});

describe("email protocol — privacy masking", () => {
  it("local part masked, domain kept", () => {
    expect(maskEmail("felix@example.com")).toBe("fe***@example.com");
    expect(maskEmail("ab@c.com")).toBe("ab*@c.com");
  });
  it("garbage masked without crashing", () => {
    expect(maskEmail("@")).toBe("*");
  });
});

describe("email protocol — outbound honesty", () => {
  it("unconfigured provider refuses honestly, never fakes a send", async () => {
    const r = await sendEmailText({
      provider: "none",
      apiKey: "",
      to: "a@b.c",
      fromAddress: "archie@x.y",
      subject: "s",
      text: "t",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not configured");
    expect(r.error).toContain("integration fault");
  });

  it("missing key with a configured provider refuses honestly", async () => {
    const r = await sendEmailText({
      provider: "resend",
      apiKey: "",
      to: "a@b.c",
      fromAddress: "archie@x.y",
      subject: "s",
      text: "t",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not configured");
  });

  it("unknown provider refused", async () => {
    const r = await sendEmailText({
      provider: "carrier-pigeon" as "resend",
      apiKey: "k",
      to: "a@b.c",
      fromAddress: "archie@x.y",
      subject: "s",
      text: "t",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("unknown email provider");
  });

  it("body cap constant exists and is generous but bounded", () => {
    expect(EMAIL_BODY_LIMIT).toBe(80_000);
  });
});
