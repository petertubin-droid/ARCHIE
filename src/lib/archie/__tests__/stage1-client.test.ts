import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateAttachment,
  MAX_ATTACHMENT_BYTES,
  getDeviceKey,
  devicePlatformLabel,
} from "../stage1-client";

// supabase-lazy is not needed for pure helpers, but the module
// imports it at top level — mock it to keep tests hermetic.
vi.mock("@/lib/supabase-lazy", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: true,
}));

beforeEach(() => {
  localStorage.clear();
});

describe("validateAttachment", () => {
  const image = new File(["x"], "photo.png", { type: "image/png" });
  const pdf = new File(["x"], "plan.pdf", { type: "application/pdf" });
  const audio = new File(["x"], "note.webm", { type: "audio/webm" });

  it("accepts supported images, PDFs and audio", () => {
    expect(validateAttachment(image).ok).toBe(true);
    expect(validateAttachment(pdf).ok).toBe(true);
    expect(validateAttachment(audio).ok).toBe(true);
  });

  it("rejects files over the size limit", () => {
    const big = new File([new ArrayBuffer(0)], "huge.png", {
      type: "image/png",
    });
    Object.defineProperty(big, "size", { value: MAX_ATTACHMENT_BYTES + 1 });
    const res = validateAttachment(big);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("20 MB");
  });

  it("rejects unsupported mime types (no silent device access)", () => {
    const exe = new File(["x"], "tool.exe", {
      type: "application/x-msdownload",
    });
    const res = validateAttachment(exe);
    expect(res.ok).toBe(false);
  });

  it("rejects unknown mime types", () => {
    const unknown = new File(["x"], "file", { type: "" });
    expect(validateAttachment(unknown).ok).toBe(false);
  });
});

describe("getDeviceKey", () => {
  it("generates a stable 32-char hex key (never IMEI)", () => {
    const key1 = getDeviceKey();
    const key2 = getDeviceKey();
    expect(key2).toBe(key1);
    expect(key1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("stores the key in localStorage so it survives reloads", () => {
    getDeviceKey();
    expect(localStorage.getItem("frelux_archie_device_key")).toMatch(
      /^[0-9a-f]{32}$/,
    );
  });
});

describe("devicePlatformLabel", () => {
  it("labels mobile vs desktop browsers", () => {
    const label = devicePlatformLabel();
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});
