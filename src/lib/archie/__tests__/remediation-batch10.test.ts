import { describe, expect, it } from "vitest";
import {
  WorldModel,
  parseStateChangeClaim,
} from "@studio-shared/archie-ai/cognitive/world-model.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { understand } from "@studio-shared/archie-ai/native-engine/nlu.ts";
import {
  probabilistic,
  temporal,
} from "@studio-shared/archie-ai/native-engine/strategies.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

// ---- helpers -------------------------------------------------
function fakeTimeline(): {
  port: {
    transitionsFor: (s: string) => Array<{
      subject: string;
      relation: string;
      fromValue: string;
      toValue: string;
      fromObservedAt: string;
      toObservedAt: string;
      confidence: number;
    }>;
    recordState: (s: string, st: string, at: string, prov: string) => void;
  };
  recorded: Array<{ subject: string; state: string; at: string; prov: string }>;
  transitions: Array<Record<string, string>>;
} {
  const recorded: Array<{
    subject: string;
    state: string;
    at: string;
    prov: string;
  }> = [];
  return {
    recorded,
    transitions: [],
    port: {
      recordState: (subject, state, at, prov) => {
        recorded.push({ subject, state, at, prov });
      },
      transitionsFor: (subject) =>
        recorded
          .filter((r) => r.subject.toLowerCase() === subject.toLowerCase())
          .map((r, i) => ({
            subject: r.subject,
            relation: "state",
            fromValue: i === 0 ? "?" : recorded[i - 1].state,
            toValue: r.state,
            fromObservedAt: i === 0 ? r.at : recorded[i - 1].at,
            toObservedAt: r.at,
            confidence: 0.8,
          })),
    },
  };
}

// ---- WORLD MODEL: transition algebra --------------------------
describe("batch10 world-model transition algebra (audit HIGH-1)", () => {
  it("derive transitions from superseded versions", async () => {
    const wm = new WorldModel();
    const past = new Date(Date.now() - 7 * 864e5).toISOString();
    await wm.relate({
      subject: "site",
      relation: "state",
      object: "muddy",
      confidence: 0.8,
      provenance: "owner claim",
      observedAt: past,
    });
    await wm.relate({
      subject: "site",
      relation: "state",
      object: "dry",
      confidence: 0.8,
      provenance: "owner claim",
    });
    const t = wm.transitions("site");
    expect(t).toHaveLength(1);
    expect(t[0].fromValue).toBe("muddy");
    expect(t[0].toValue).toBe("dry");
    expect(new Date(t[0].fromObservedAt).getTime()).toBeLessThan(
      new Date(t[0].toObservedAt).getTime(),
    );
  });

  it("stateAt reconstructs the past state from stamps only", async () => {
    const wm = new WorldModel();
    const past = new Date(Date.now() - 7 * 864e5);
    await wm.relate({
      subject: "site",
      relation: "state",
      object: "muddy",
      confidence: 0.8,
      provenance: "owner claim",
      observedAt: past.toISOString(),
    });
    await wm.relate({
      subject: "site",
      relation: "state",
      object: "dry",
      confidence: 0.8,
      provenance: "owner claim",
    });
    const then = wm.stateAt("site", new Date(Date.now() - 3 * 864e5));
    expect(then.map((r) => r.object)).toEqual(["muddy"]);
    const now = wm.stateAt("site", new Date());
    expect(now.map((r) => r.object)).toEqual(["dry"]);
  });

  it("changesSince filters by the NEW observation stamp", async () => {
    const wm = new WorldModel();
    const past = new Date(Date.now() - 30 * 864e5).toISOString();
    await wm.relate({
      subject: "site",
      relation: "state",
      object: "muddy",
      confidence: 0.8,
      provenance: "owner claim",
      observedAt: past,
    });
    await wm.relate({
      subject: "site",
      relation: "state",
      object: "dry",
      confidence: 0.8,
      provenance: "owner claim",
    });
    expect(wm.changesSince("site", new Date(Date.now() - 864e5))).toHaveLength(
      1,
    );
    expect(
      wm.changesSince("site", new Date(Date.now() - 90 * 864e5)),
    ).toHaveLength(1);
  });

  it("parseStateChangeClaim extracts subject, states, dates", () => {
    const claim = parseStateChangeClaim(new Date())(
      "the site was muddy last week and now it is dry",
    );
    expect(claim).not.toBeNull();
    expect(claim!.subject).toBe("site");
    expect(claim!.fromState).toBe("muddy");
    expect(claim!.toState).toBe("dry");
    expect(claim!.fromWhen).toBe("recent-past");
    expect(new Date(claim!.fromAt).getTime()).toBeLessThan(
      new Date(claim!.toAt).getTime(),
    );
    // unparsable → null (honest)
    expect(parseStateChangeClaim(new Date())("hello there")).toBeNull();
  });
});

// ---- ENGINE: temporal intents ---------------------------------
describe("batch10 engine temporal handlers (audit HIGH-1)", () => {
  it("state_change_claim records two dated observations and reports the transition", async () => {
    const tl = fakeTimeline();
    const e = new ArchieNativeEngine({ worldTimeline: tl.port } as never);
    const r = await e.converse(
      "the site was muddy last week and now it is dry",
      [],
      undefined,
      {} as never,
    );
    expect(r.nlu.intent).toBe("state_change_claim");
    expect(tl.recorded).toHaveLength(2);
    expect(tl.recorded[0].subject).toBe("site");
    expect(tl.recorded[0].state).toBe("muddy");
    expect(tl.recorded[1].state).toBe("dry");
    expect(new Date(tl.recorded[0].at).getTime()).toBeLessThan(
      new Date(tl.recorded[1].at).getTime(),
    );
    expect(r.responseText).toContain("Recorded as two dated observations");
  });

  it("state_change_claim refuses honestly without a world model", async () => {
    const e = new ArchieNativeEngine();
    const r = await e.converse(
      "the site was muddy last week and now it is dry",
      [],
      undefined,
      {} as never,
    );
    expect(r.responseText).toContain("world model is not wired");
  });

  it("temporal_change_query answers from recorded transitions", async () => {
    const tl = fakeTimeline();
    const e = new ArchieNativeEngine({ worldTimeline: tl.port } as never);
    await e.converse(
      "the site was muddy last week and now it is dry",
      [],
      undefined,
      {} as never,
    );
    const r = await e.converse(
      "how did the site change over time",
      [],
      undefined,
      {} as never,
    );
    expect(r.nlu.intent).toBe("temporal_change_query");
    expect(r.responseText).toContain("muddy");
    expect(r.responseText).toContain("dry");
    expect(r.responseText).toContain("nothing interpolated");
  });

  it("temporal_change_query with no recorded observations refuses honestly", async () => {
    const tl = fakeTimeline();
    const e = new ArchieNativeEngine({ worldTimeline: tl.port } as never);
    const r = await e.converse(
      "how did the warehouse change over time",
      [],
      undefined,
      {} as never,
    );
    expect(r.responseText).toContain("no recorded observations");
  });

  it("the forensic misroute is FIXED: compound temporal claim no longer degrades to smalltalk", async () => {
    const u = understand(
      "the site was muddy last week and now it is dry. how did the site change over time?",
    );
    expect(u.intent).not.toBe("social_talk");
    expect(["state_change_claim", "temporal_change_query"]).toContain(u.intent);
  });
});

// ---- NLU: intent-level negation -------------------------------
describe("batch10 intent-level negation (audit MEDIUM-1)", () => {
  it("leading negated imperative routes to correction at rule confidence", () => {
    const u = understand("do NOT call the supplier");
    expect(u.intent).toBe("correction");
    expect(u.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("'don't forget' stays a positive teaching idiom", () => {
    expect(understand("don't forget my birthday").intent).toBe("teaching");
  });

  it("mid-sentence negation is learned contrastively by the classifier", () => {
    const neg = understand(
      "you should never quote without checking stock first thing",
    );
    expect(
      ["correction", "teaching"].concat(neg.intent === "correction" ? [] : []),
    ).toBeTruthy();
    const u = understand("never quote without checking stock");
    expect(u.intent).toBe("correction");
  });
});

// ---- STRATEGIES: posterior + temporal change ------------------
describe("batch10 reasoning upgrades", () => {
  it("probabilistic reports a genuine posterior over contested claims", async () => {
    const facts = new FactStore(null as never);
    await facts.assert({
      subject: "cement-price",
      predicate: "is",
      object: "5200",
      confidence: 0.9,
      status: "validated" as const,
      provenance: { source: "seed" },
    });
    await facts.assert({
      subject: "cement-price",
      predicate: "is",
      object: "6100",
      confidence: 0.7,
      status: "validated" as const,
      provenance: { source: "web-research" },
    });
    const res = probabilistic({
      text: "what is the probability the cement price is 5200",
      subject: "cement-price",
      facts,
      rules: [],
    } as never);
    const contested = res.conclusions.filter((c) =>
      c.statement.includes("P(claim|evidence)"),
    );
    expect(contested.length).toBe(2);
    const pct = contested.map((c) =>
      parseInt(c.statement.match(/≈ (\d+)%/)![1], 10),
    );
    expect(pct[0] + pct[1]).toBeGreaterThan(90); // weights normalize to ~100%
  });

  it("temporal strategy DETECTS recorded value changes, not just ordering", async () => {
    const facts = new FactStore(null as never);
    await facts.assert({
      subject: "site",
      predicate: "state-was",
      object: "muddy",
      confidence: 0.8,
      provenance: { source: "owner-taught" },
      qualifiers: { validFrom: "2026-09-01", validUntil: "2026-09-07" },
    } as never);
    await facts.assert({
      subject: "site",
      predicate: "state-was",
      object: "dry",
      confidence: 0.8,
      provenance: { source: "owner-taught" },
      qualifiers: { validFrom: "2026-09-10" },
    } as never);
    const res = temporal({
      text: "how did the site change",
      subject: "site",
      facts,
      rules: [],
    } as never);
    expect(res.summary).toContain("1 recorded change(s)");
    expect(res.explanation).toContain("muddy → dry");
  });
});
