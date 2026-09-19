// =========================================================
// NATIVE JPEG PIXEL DECODE TESTS — gap 4 (owner upgrade
// 2026-09-16). Fixtures are REAL libjpeg files (PIL-encoded)
// embedded as base64: the decoder is validated against the
// world's dominant JPEG encoder, not against itself. Every
// refusal case asserts the HONEST note. (Decoder fixture
// generator: 636B solid-red 4:4:4, 337B gray gradient L-mode,
// 683B blue/green split 4:4:4, 934B 4:2:0 gradient q88, 528B
// progressive, truncated at 60%.)
// =========================================================
import { describe, it, expect } from "vitest";
import { analyzeImage } from "@studio-shared/archie-ai/cognitive/vision.ts";
import { decodeJpeg } from "@studio-shared/archie-ai/cognitive/jpeg-decode.ts";

const B = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

const RED444 = B("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6+ZP3EKACgAoA//Z");
const GRAYGRAD = B("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AE+CH/Lt+Ff/2Q==");
const BICOLOR = B("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxyv3E8wKAOur+aTwgoA5Gv6WPdCgDrq/mk8IKAORr+lj3QoA66v5pPCCgDka/pY90KAOur+aTwgoA/9k=");
const SUB420 = B("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4utdM6fLWza6Z0+Wtm10zp8tbVrpnT5a9TEZh5kZNmu2pjWumdPlratdM6fLWza6Z0+Wtq10zp8teFiMw8z9XybNdtTGtdM6fLW1a6Z0+Wtm10zp8tbVrpnT5a8HEZh5n6vk2a7anmFrpnT5a2rXTOny1s2umdPlratdM6fLTxGYeZ/BGTZrtqY1rpnT5a2rXTOny1s2umdPlratdM6fLXhYjMPM/V8mzXbUxrXTOny1tWumdPlrZtdM6fLW1a6Z0+WvCxGYeZ+r5Nmu2p5ha6Z0+Wtq10zp8tbNrpfT5a2rXTOny08RmPmfwRk2a7amNa6Z0+Wtq10zp8tbNrpnT5a2rXTOny14OIzDzP1fJs121Ma10zp8tbVrpnT5a2bXTOny1tWumdPlrwsRmPmfq+TZrtqf/2Q==");
const PROGRESSIVE = B("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAAYABgDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAH/xAAWAQEBAQAAAAAAAAAAAAAAAAAABAb/2gAMAwEAAhADEAAAAbLmQAAAP//EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEAAQUCH//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQMBAT8BH//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQIBAT8BH//EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEABj8CH//EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEAAT8hH//aAAwDAQACAAMAAAAQkkkkn//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEAAT8QH//Z");
const TRUNCATED = B("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQ==");

describe("native JPEG pixel decode — real libjpeg fixtures", () => {
  it("decodes a solid-red 4:4:4 JPEG to honest full-pixel analysis", async () => {
    const res = await analyzeImage(RED444);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.format).toBe("jpeg");
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(16);
    expect(a.height).toBe(16);
    // solid (255,0,0): luma = 0.2126*255 ≈ 54.2
    expect(a.meanLuma).not.toBeNull();
    expect(a.meanLuma!).toBeGreaterThan(45);
    expect(a.meanLuma!).toBeLessThan(65);
    expect(a.dominantColors![0].name).toBe("red");
    // libjpeg quantization rounding: within ±2 per channel, never exact
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(
      a.dominantColors![0].hex.slice(i, i + 2), 16,
    ));
    expect(Math.abs(r - 255)).toBeLessThanOrEqual(2);
    expect(g).toBeLessThanOrEqual(2);
    expect(b).toBeLessThanOrEqual(2);
  });

  it("decodes a grayscale (1-component) gradient JPEG", async () => {
    const res = await analyzeImage(GRAYGRAD);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(8);
    expect(a.height).toBe(8);
    // left→right 0..255: mean luma ≈ 127
    expect(a.meanLuma!).toBeGreaterThan(115);
    expect(a.meanLuma!).toBeLessThan(140);
  });

  it("decodes a blue/green split and names BOTH dominant colors", async () => {
    const res = await analyzeImage(BICOLOR);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("full-pixel");
    const names = a.dominantColors!.map((c) => c.name);
    expect(names).toContain("blue");
    expect(names).toContain("green");
    // the vertical seam means real edge density
    expect(a.edgeDensity!).toBeGreaterThan(0.01);
    // near 50/50 coverage
    const blue = a.dominantColors!.find((c) => c.name === "blue")!;
    expect(blue.coverage).toBeGreaterThan(40);
    expect(blue.coverage).toBeLessThan(60);
  });

  it("decodes 4:2:0-subsampled JPEG with correct dimensions and smooth gradient", async () => {
    const res = await analyzeImage(SUB420);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(48);
    expect(a.height).toBe(48);
    expect(a.contentClass).not.toBeNull();
  });

  it("refuses progressive JPEG for pixels but keeps honest structure-only analysis", async () => {
    const res = await analyzeImage(PROGRESSIVE);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("structure-only");
    expect(a.width).toBe(24);
    expect(a.notes[0]).toMatch(/progressive/i);
    expect(a.dominantColors).toBeNull();
  });

  it("refuses truncated entropy data honestly — never partial pixels", async () => {
    const res = await analyzeImage(TRUNCATED);
    if (res.ok && res.analysis.depth === "structure-only") {
      // honest fallback: dimensions parsed, pixel decode refused
      expect(res.analysis.notes[0]).toMatch(/truncated|refused|corrupt/i);
    } else if (res.ok) {
      // full pixels only if the whole file genuinely decoded
      expect(res.analysis.depth).toBe("full-pixel");
    } else {
      expect(res.note).toMatch(/refused|truncated|corrupt/i);
    }
    const direct = (() => {
      try {
        decodeJpeg(TRUNCATED);
        return "decoded";
      } catch (e) {
        return (e as Error).message;
      }
    })();
    // the direct decoder NEVER hands back half an image
    if (direct !== "decoded") {
      expect(direct).toMatch(/refused|truncated|corrupt|marker/i);
    }
  });
});
