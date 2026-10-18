// =========================================================
// ARCHIE TELEGRAM CHANNEL — PROTOCOL TESTS (engine 13, E-3)
// Deterministic fixtures only, mirroring whatsapp protocol
// tests.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  chunkForTelegram,
  maskChatId,
  parseTelegramUpdate,
  TELEGRAM_SECRET_HEADER,
  TELEGRAM_TEXT_LIMIT,
  verifyTelegramSecret,
} from "./protocol.ts";

describe("telegram protocol — webhook secret", () => {
  it("correct secret accepted", () => {
    expect(verifyTelegramSecret("s3cret-token-abc", "s3cret-token-abc")).toBe(true);
  });
  it("wrong secret refused", () => {
    expect(verifyTelegramSecret("wrong", "s3cret-token-abc")).toBe(false);
  });
  it("missing header refused", () => {
    expect(verifyTelegramSecret(null, "s3cret-token-abc")).toBe(false);
  });
  it("unconfigured secret refuses EVERYTHING (open webhook would let anyone inject)", () => {
    expect(verifyTelegramSecret("anything", "")).toBe(false);
    expect(verifyTelegramSecret("", "")).toBe(false);
  });
  it("header name is Telegram's documented one", () => {
    expect(TELEGRAM_SECRET_HEADER).toBe("x-telegram-bot-api-secret-token");
  });
});

describe("telegram protocol — update parsing", () => {
  const textUpdate = {
    update_id: 987654,
    message: {
      message_id: 42,
      from: { id: 111, first_name: "Felix" },
      chat: { id: 222333 },
      date: 1760000000,
      text: "status",
    },
  };

  it("text message parsed fully", () => {
    const r = parseTelegramUpdate(textUpdate);
    expect(r.messages.length).toBe(1);
    expect(r.ignoredKinds).toEqual([]);
    const m = r.messages[0];
    expect(m.updateId).toBe(987654);
    expect(m.chatId).toBe("222333");
    expect(m.messageId).toBe(42);
    expect(m.text).toBe("status");
    expect(m.type).toBe("text");
    expect(m.fromUserId).toBe("111");
    expect(m.fileId).toBeNull();
  });

  it("photo message: honest media type + file id, no text", () => {
    const r = parseTelegramUpdate({
      update_id: 2,
      message: {
        message_id: 43,
        chat: { id: 5 },
        photo: [{ file_id: "small" }, { file_id: "big" }],
      },
    });
    const m = r.messages[0];
    expect(m.type).toBe("photo");
    expect(m.fileId).toBe("big"); // largest variant
    expect(m.text).toBeNull();
  });

  it("voice message classified voice", () => {
    const r = parseTelegramUpdate({
      update_id: 3,
      message: { message_id: 44, chat: { id: 5 }, voice: { file_id: "v1" } },
    });
    expect(r.messages[0].type).toBe("voice");
    expect(r.messages[0].fileId).toBe("v1");
  });

  it("edited message honestly ignored, never silently processed", () => {
    const r = parseTelegramUpdate({ update_id: 4, edited_message: { chat: { id: 5 }, text: "sneaky edit" } });
    expect(r.messages.length).toBe(0);
    expect(r.ignoredKinds).toContain("edited_message");
  });

  it("callback query honestly ignored", () => {
    const r = parseTelegramUpdate({ update_id: 5, callback_query: { id: "cq" } });
    expect(r.messages.length).toBe(0);
    expect(r.ignoredKinds).toContain("callback_query");
  });

  it("garbage payload → nothing parsed, nothing invented", () => {
    expect(parseTelegramUpdate(null).messages).toEqual([]);
    expect(parseTelegramUpdate("a string").messages).toEqual([]);
    expect(parseTelegramUpdate({}).messages).toEqual([]);
    expect(parseTelegramUpdate({ update_id: "not-a-number", message: { chat: { id: 1 }, text: "x" } }).messages).toEqual([]);
  });

  it("missing chat id → not a processable message", () => {
    const r = parseTelegramUpdate({ update_id: 7, message: { text: "no chat" } });
    expect(r.messages.length).toBe(0);
  });
});

describe("telegram protocol — chunking", () => {
  it("short text stays one chunk, never truncated", () => {
    expect(chunkForTelegram("hello")).toEqual(["hello"]);
  });
  it("limit text stays one chunk", () => {
    const t = "x".repeat(TELEGRAM_TEXT_LIMIT);
    expect(chunkForTelegram(t)).toEqual([t]);
  });
  it("over-limit text split exactly at the limit, no loss", () => {
    const t = `${"a".repeat(TELEGRAM_TEXT_LIMIT)}${"b".repeat(10)}`;
    const chunks = chunkForTelegram(t);
    expect(chunks.length).toBe(2);
    expect(chunks.join("")).toBe(t);
  });
  it("empty text → single empty chunk (send path shape)", () => {
    expect(chunkForTelegram("")).toEqual([""]);
  });
});

describe("telegram protocol — privacy masking", () => {
  it("chat id masked to last 4", () => {
    expect(maskChatId("222333444")).toBe("…3444");
  });
  it("short ids fully masked", () => {
    expect(maskChatId("1234")).toBe("****");
    expect(maskChatId("123")).toBe("***");
  });
});
