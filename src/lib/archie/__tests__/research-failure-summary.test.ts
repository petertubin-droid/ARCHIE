import { describe, expect, it } from "vitest";
import { summarizeSourceFailures } from "@studio-shared/archie-ai/native-engine/engine.ts";

describe("summarizeSourceFailures (batch 43 dedup)", () => {
  const note =
    "network unavailable after all adapters — duckduckgo-lite: refused; wikipedia-api: declined";
  it("collapses identical notes across sites into one grouped line", () => {
    const out = summarizeSourceFailures([
      { domain: "britannica.com", note },
      { domain: "wikipedia.org", note },
      { domain: "docs.python.org", note },
    ]);
    expect(out).toBe(`britannica.com, wikipedia.org, docs.python.org (${note})`);
    expect(out.match(new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")).length).toBe(1);
  });

  it("keeps distinct notes separate", () => {
    const out = summarizeSourceFailures([
      { domain: "a.com", note: "declined" },
      { domain: "b.com", note: "timeout" },
    ]);
    expect(out).toBe("a.com (declined); b.com (timeout)");
  });

  it("handles an empty failure list", () => {
    expect(summarizeSourceFailures([])).toBe("");
  });
});
