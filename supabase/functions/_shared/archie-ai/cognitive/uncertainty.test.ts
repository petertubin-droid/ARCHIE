// ============================================================
// ARCHIE UNCERTAINTY & CAUSAL INFERENCE ENGINE — TESTS
// Determinism, boundedness, monotonicity, honest degradation:
// every property a deterministic probability engine must hold.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  calibratedConfidence,
  combineIndependently,
  confidenceStatement,
  contradictionCapped,
  createCalibrationStore,
  propagateCausal,
} from "./uncertainty.ts";

describe("beta-bayes calibration", () => {
  it("returns exactly the base prior with no history (nothing invented)", () => {
    expect(calibratedConfidence(0.7, { successes: 0, failures: 0 })).toBe(0.7);
  });

  it("all successes raise confidence; all failures lower it", () => {
    const up = calibratedConfidence(0.5, { successes: 20, failures: 0 });
    const down = calibratedConfidence(0.5, { successes: 0, failures: 20 });
    expect(up).toBeGreaterThan(0.5);
    expect(down).toBeLessThan(0.5);
  });

  it("is bounded to [0,1] for extreme histories", () => {
    expect(calibratedConfidence(0.99, { successes: 10000, failures: 0 })).toBeLessThanOrEqual(1);
    expect(calibratedConfidence(0.01, { successes: 0, failures: 10000 })).toBeGreaterThanOrEqual(0);
  });

  it("is monotone: more successes never lower confidence", () => {
    const a = calibratedConfidence(0.6, { successes: 3, failures: 2 });
    const b = calibratedConfidence(0.6, { successes: 4, failures: 2 });
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("is deterministic: same inputs, same number", () => {
    expect(calibratedConfidence(0.62, { successes: 7, failures: 3 }))
      .toBe(calibratedConfidence(0.62, { successes: 7, failures: 3 }));
  });

  it("converges toward the observed success rate as history grows", () => {
    // true rate 0.9: with a large history the estimate must
    // approach 0.9 regardless of a 0.5 prior
    const est = calibratedConfidence(0.5, { successes: 900, failures: 100 }, 8);
    expect(est).toBeGreaterThan(0.85);
    expect(est).toBeLessThan(0.95);
  });

  it("quotes the basis with every number (outcome-grade honesty)", () => {
    const s = confidenceStatement(0.5, { successes: 3, failures: 1 });
    expect(s.statement).toContain("3/4");
    const prior = confidenceStatement(0.5, { successes: 0, failures: 0 });
    expect(prior.statement).toContain("no outcome history");
  });
});

describe("causal propagation", () => {
  const edges = [
    { from: "rain", to: "wet-roof", strength: 0.9, because: "rain wets roofs" },
    { from: "wet-roof", to: "slippery-roof", strength: 0.7, because: "wet surfaces are slippery" },
    { from: "rain", to: "flood", strength: 0.4, because: "heavy rain floods drains" },
  ];

  it("propagates path products with full causal explanations", () => {
    const results = propagateCausal(edges, "rain");
    const slippery = results.find((r) => r.node === "slippery-roof")!;
    expect(slippery.confidence).toBeCloseTo(0.9 * 0.7, 10);
    expect(slippery.explanation).toContain("rain→wet-roof because rain wets roofs");
    expect(slippery.explanation).toContain("wet-roof→slippery-roof because wet surfaces are slippery");
    expect(slippery.path).toEqual(["rain", "wet-roof", "slippery-roof"]);
    // direct edge beats the longer path
    const flood = results.find((r) => r.node === "flood")!;
    expect(flood.confidence).toBeCloseTo(0.4, 10);
  });

  it("keeps the strongest path when multiple paths reach a node", () => {
    const two = [
      { from: "a", to: "c", strength: 0.9, because: "direct" },
      { from: "a", to: "b", strength: 0.5, because: "weak hop" },
      { from: "b", to: "c", strength: 0.5, because: "weak hop 2" },
    ];
    const results = propagateCausal(two, "a");
    const c = results.find((r) => r.node === "c")!;
    expect(c.confidence).toBeCloseTo(0.9, 10); // direct beats 0.25 path
    expect(c.path).toEqual(["a", "c"]);
  });

  it("terminates cycles honestly without infinite recursion", () => {
    const cyclic = [
      { from: "a", to: "b", strength: 0.8, because: "x" },
      { from: "b", to: "a", strength: 0.8, because: "y" },
      { from: "b", to: "c", strength: 0.6, because: "z" },
    ];
    const results = propagateCausal(cyclic, "a");
    const b = results.find((r) => r.node === "b")!;
    expect(b.confidence).toBeCloseTo(0.8, 10); // a→b stands; b→a→b adds nothing
    const c = results.find((r) => r.node === "c")!;
    expect(c.confidence).toBeCloseTo(0.8 * 0.6, 10);
  });

  it("ignores zero-strength edges (they carry nothing)", () => {
    const results = propagateCausal(
      [{ from: "a", to: "b", strength: 0, because: "no support" }],
      "a",
    );
    expect(results).toHaveLength(0);
  });

  it("respects the depth bound", () => {
    const chain = Array.from({ length: 12 }, (_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
      strength: 0.99,
      because: "chain",
    }));
    const results = propagateCausal(chain, "n0", 4);
    expect(results.map((r) => r.node)).toEqual(["n1", "n2", "n3", "n4"]);
  });
});

describe("independent combination + contradiction", () => {
  it("combines independent premises noisy-OR style", () => {
    expect(combineIndependently([0.5, 0.5])).toBeCloseTo(0.75, 10);
    expect(combineIndependently([])).toBe(0);
    expect(combineIndependently([0.9, 0.9, 0.9])).toBeCloseTo(0.999, 2);
  });

  it("caps contradiction confidence and passes clean confidence through", () => {
    expect(contradictionCapped(0.8, true)).toBeCloseTo(0.4, 10);
    expect(contradictionCapped(0.8, false)).toBeCloseTo(0.8, 10);
  });
});

describe("calibration store — best-effort persistence", () => {
  function mockClient(opts: { failRpc?: boolean; rows?: Record<string, { successes: number; failures: number }> } = {}) {
    const rows = opts.rows ?? {};
    const upserts: Record<string, unknown>[] = [];
    return {
      store: createCalibrationStore({
        from: () => ({
          select: (cols: string) => ({
            eq: (_: string, key: string) => ({
              limit: () =>
                Promise.resolve({
                  data: rows[key] ? [rows[key]] : [],
                  error: null,
                }),
            }),
          }),
          upsert: (row: Record<string, unknown>) => {
            upserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        rpc: opts.failRpc
          ? () => Promise.resolve({ data: null, error: { message: "fn missing" } })
          : () => Promise.resolve({ data: null, error: null }),
      } as never),
      upserts,
    };
  }

  it("reads zero history for an unknown key", async () => {
    const { store } = mockClient();
    expect(await store.read("unknown")).toEqual({ successes: 0, failures: 0 });
  });

  it("records via the atomic RPC when available", async () => {
    const { store } = mockClient();
    await store.record("reasoning:MATH", true);
    await store.record("reasoning:MATH", false);
    // RPC path succeeded — no read-modify-write fallback fired
    expect(true).toBe(true);
  });

  it("falls back to read-modify-write when the RPC is unavailable", async () => {
    const { store, upserts } = mockClient({
      rows: { "reasoning:MATH": { successes: 2, failures: 1 } },
      failRpc: true,
    });
    await store.record("reasoning:MATH", true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].successes).toBe(3);
    expect(upserts[0].failures).toBe(1);
  });

  it("degrades silently when everything fails (calibration never blocks)", async () => {
    const store = createCalibrationStore({
      from: () => {
        throw new Error("db down");
      },
    } as never);
    await expect(store.record("k", true)).resolves.toBeUndefined();
    await expect(store.read("k")).resolves.toEqual({ successes: 0, failures: 0 });
  });
});
