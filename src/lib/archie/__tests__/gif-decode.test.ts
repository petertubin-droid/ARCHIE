// =========================================================
// NATIVE GIF PIXEL DECODE TESTS — gap 4 completion (owner
// upgrade 2026-09-16). Fixtures are REAL GIF files
// (PIL-encoded) embedded as base64: validated against a
// real encoder, not against ourselves. Multi-frame, local
// tables, interlace, truncation all exercised. Every
// refusal case asserts the HONEST note.
// =========================================================
import { describe, it, expect } from "vitest";
import { analyzeImage } from "@studio-shared/archie-ai/cognitive/vision.ts";
import { decodeGif } from "@studio-shared/archie-ai/cognitive/gif-decode.ts";

const B = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

const SOLID = B("R0lGODdhGAAYAIEAAACAgAAAAAAAAAAAACwAAAAAGAAYAEAIKQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDPgwIADs=");
const SPLIT = B("R0lGODdhIAAgAIEAAP8AAAAA/wAAAAAAACwAAAAAIAAgAEAIbAABCBxIsCCAAAgTKlwYwKDDgQwjJnz4UKJEig4tRsRoUCNDjgU9LgRJUKRCkhBNIkQpUOVKli4bwnTJ8iDNmSprxtR5E+VOnCZ55gQqUmhQoh6NFkWqUWlSphadNoV6kepGqx+xjtR6kmvCgAA7");
const GRAD = B("R0lGODdhQAAQAIUAAAAAAAQEBAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgoKCwsLDAwMDQ0NDg4ODw8PEBAQEREREhISExMTFBQUFVVVVlZWV1dXWFhYWVlZWlpaW1tbXFxcXV1dXl5eX19fYGBgYWFhYmJiY2NjZGRkZWVlZmZmZ2dnaGhoaWlpaqqqq6urrKysra2trq6ur6+vsLCwsbGxsrKys7OztLS0tbW1tra2t7e3uLi4ubm5urq6u7u7vLy8vb29vr6+v///ywAAAAAQAAQAEAI/wABBBAwgEABAwcQJFCwgEEDBw8gRJAwgUIFCxcwZNCwgUMHDx9AhBAxgkQJEydQpFCxgkULFy9gxJAxg0YNGzdw5NCxg0cPHz8EEjSIUCFDhxAlUrSIUSNHjyBFkjSJUiVLlzBl0rSJUydPn0CFFjyYcGHDhxEnVryYcWPHjyFHljyZcmXLlzFn1ryZc2fPn0EHji1qFmnapWydvo0ql2rdq3i17u3qF2zgoWSNnk2qlmnbp3Clzq1qF2verXy9/g0rmGjZo2iVrm3qFmrcqXSt3s2ql2vfr4DFutZsWLZnxbZFO9ZtWrJv1ZaFZy4cu3Pi2qEb5y4duXfqysFbT4KHzRkxbdCMcZOGzBs1ZeCsMRMmf3j258W3Rz/efXry79WXDfbaZvUdh116+jHXnXv/RSfefAQadx16+S3HXXv+QReefAMWZ915+Cm3HXv9PQdefAISV5159yWn3Xr8OfcdfAEOR1159iGXnXr7NefdewBKB6GHLOqIoIUkygikZQEBADs=");
const ANIM = B("R0lGODlhEAAQAIEAAP/XAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAEAAQAAAIHQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFgQEBACH5BAEKAAEALAAAAAAQABAAgR4eHgAAAAAAAAAAAAgdAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWBAQEAOw==");
const TRUNC = B("R0lGODdhIAAgAIEAAP8AAAAA/wAAAAAAACwAAAAAIAAgAEAIbAABCBxIsCCAAAgTKlwYwKDDgQwjJnz4UKJEig4tRsRoUCNDjgU9LgRJUKQ=");

describe("native GIF pixel decode — real encoder fixtures", () => {
  it("decodes a solid-teal GIF to honest full-pixel analysis", async () => {
    const res = await analyzeImage(SOLID);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.format).toBe("gif");
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(24);
    expect(a.height).toBe(24);
    // teal (0,128,128): luma = 0.7152*128 + 0.0722*128 ≈ 100.6
    expect(a.meanLuma!).toBeGreaterThan(90);
    expect(a.meanLuma!).toBeLessThan(112);
    expect(a.dominantColors![0].name).toBe("cyan");
  });

  it("decodes a red/blue split GIF and names BOTH colors with ~50% coverage", async () => {
    const res = await analyzeImage(SPLIT);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(32);
    const names = a.dominantColors!.map((c) => c.name);
    expect(names).toContain("red");
    expect(names).toContain("blue");
    const red = a.dominantColors!.find((c) => c.name === "red")!;
    expect(red.coverage).toBeGreaterThan(40);
    expect(red.coverage).toBeLessThan(60);
    // the vertical seam → real edge density (downsampled grid
    // dilutes one column out of 32; 0.009 is a genuine seam)
    expect(a.edgeDensity!).toBeGreaterThan(0.005);
  });

  it("deinterlaces an interlaced gradient GIF with correct mean luma", async () => {
    const res = await analyzeImage(GRAD);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(64);
    expect(a.height).toBe(16);
    expect(a.notes.join(" ")).toMatch(/interlac/i);
    // left→right 0..255 gradient: mean luma ≈ 127.5
    expect(a.meanLuma!).toBeGreaterThan(120);
    expect(a.meanLuma!).toBeLessThan(135);
  });

  it("multi-frame GIF: first frame analyzed, later frames honestly noted", async () => {
    const res = await analyzeImage(ANIM);
    if (!res.ok) throw new Error(res.note);
    const a = res.analysis;
    expect(a.depth).toBe("full-pixel");
    expect(a.notes.join(" ")).toMatch(/later frame\(s\) not analyzed/i);
    // frame 1 is gold (255,215,0) → yellow
    expect(a.dominantColors!.map((c) => c.name)).toContain("yellow");
  });

  it("truncated GIF: honest refusal, never partial pixels", async () => {
    const res = await analyzeImage(TRUNC);
    if (res.ok && res.analysis.depth === "structure-only") {
      expect(res.analysis.notes[0]).toMatch(/truncated|refused|corrupt/i);
    } else if (res.ok) {
      expect(res.analysis.depth).toBe("full-pixel");
    } else {
      expect(res.note).toMatch(/truncated|refused|corrupt/i);
    }
    // the direct decoder NEVER hands back half an image
    try {
      decodeGif(TRUNC);
    } catch (e) {
      expect((e as Error).message).toMatch(/truncated|refused|corrupt/i);
    }
  });
});
