// ============================================================
// ARCHIE OWNER MODEL — TESTS
// Direct-statement extraction with evidence, supersession
// history, inferred counters, determinism, verbosity drive.
// ============================================================

import { describe, expect, it } from "vitest";
import { OwnerModel } from "./user-model.ts";

describe("direct statement extraction — evidence always quoted", () => {
  it("extracts a preferred address name with verbatim evidence", () => {
    const m = new OwnerModel();
    const updates = m.observe("Hey, call me Felix from now on.");
    expect(updates.find((u) => u.key === "address_name")).toMatchObject({
      value: "Felix",
      evidence: "call me Felix",
    });
    expect(m.addressName()).toBe("Felix");
  });

  it("extracts brevity preference → concise", () => {
    const m = new OwnerModel();
    m.observe("Please keep answers short, I'm usually in a hurry.");
    expect(m.verbosityPreference()).toBe("concise");
  });

  it("extracts detail preference → detailed", () => {
    const m = new OwnerModel();
    m.observe("Actually I'd prefer detailed explanations from you.");
    expect(m.verbosityPreference()).toBe("detailed");
  });

  it("list style both directions", () => {
    const a = new OwnerModel();
    a.observe("No bullet points please.");
    expect(a.get("list_style")?.value).toBe("no-lists");
    const b = new OwnerModel();
    b.observe("Give me lists whenever you can.");
    expect(b.get("list_style")?.value).toBe("prefer-lists");
  });

  it("extracts a stated role with evidence", () => {
    const m = new OwnerModel();
    m.observe("I'm a screeding contractor, so speak freely about mix ratios.");
    expect(m.get("role")?.value).toBe("screeding contractor");
  });

  it("a message can set several DIFFERENT keys at once", () => {
    const m = new OwnerModel();
    const updates = m.observe("Call me Felix, and keep answers short.");
    expect(updates.map((u) => u.key).sort()).toEqual([
      "address_name",
      "brevity",
    ]);
  });

  it("neutral messages record nothing (no fabrication)", () => {
    const m = new OwnerModel();
    expect(m.observe("What's the price of cement today?")).toEqual([]);
    expect(m.observe("")).toEqual([]);
    expect(m.size()).toBe(0);
  });
});

describe("supersession — latest wins, history preserved", () => {
  it("a new brevity statement supersedes the old and keeps it", () => {
    const m = new OwnerModel();
    m.observe("Keep answers short.");
    const updates = m.observe("Actually, give me detailed explanations from now on.");
    expect(updates[0]).toMatchObject({ previous: "concise", value: "detailed" });
    expect(m.verbosityPreference()).toBe("detailed");
    const snap = m.snapshot();
    expect(snap.history.brevity?.[0].value).toBe("concise");
  });

  it("re-affirming the same value refreshes only the timestamp", () => {
    const m = new OwnerModel();
    m.observe("Keep answers short.");
    const before = m.get("brevity")!.updatedAt;
    const updates = m.observe("Still want short answers, thanks.", before + 5_000);
    expect(updates).toEqual([]);
    expect(m.get("brevity")!.updatedAt).toBe(before + 5_000);
  });
});

describe("inferred counters — labeled, never owner-stated", () => {
  it("corrections and thanks counted, marked inferred", () => {
    const m = new OwnerModel();
    m.observe("That's wrong, the price is 4500 not 5000.");
    m.observe("Thanks, that's what I needed.");
    m.observe("Hello there.");
    const snap = m.snapshot();
    expect(snap.inferred).toEqual([
      { key: "messages_observed", value: "3" },
      { key: "corrections_issued", value: "1" },
      { key: "thanks_received", value: "1" },
    ]);
    expect(snap.entries.length).toBe(0); // nothing owner-stated
  });
});

describe("determinism", () => {
  it("same message sequence → identical snapshots", () => {
    function run() {
      const m = new OwnerModel();
      m.observe("Call me Felix.", 1_000);
      m.observe("Keep answers short.", 2_000);
      m.observe("That's wrong.", 3_000);
      return m.snapshot();
    }
    expect(run()).toEqual(run());
  });
});

describe("verbosity drive — the real consumption", () => {
  it("no statement → null (engine default stands)", () => {
    expect(new OwnerModel().verbosityPreference()).toBeNull();
  });
  it("concise and detailed map exactly; junk never maps", () => {
    const m = new OwnerModel();
    m.observe("Keep it brief.");
    expect(m.verbosityPreference()).toBe("concise");
    m.observe("I want detailed answers.");
    expect(m.verbosityPreference()).toBe("detailed");
  });
});
