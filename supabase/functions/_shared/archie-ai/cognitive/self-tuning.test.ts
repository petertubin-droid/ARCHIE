// ============================================================
// ARCHIE BOUNDED SELF-TUNING ENGINE — TESTS
// Envelope safety, deterministic proposals, rollback, honest
// degradation: a tuner that can never escape its bounds.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  TUNABLE_PARAMS,
  clampEnvelope,
  nextProposal,
  readTunedLimits,
  runTuningCycle,
  type TuningClient,
} from "./self-tuning.ts";
import { DEFAULT_REASONING_LIMITS } from "../../reasoning/types.ts";

const stepsParam = TUNABLE_PARAMS.find((p) => p.key === "maxSteps")!;

describe("envelope math", () => {
  it("keeps every proposal inside the envelope", () => {
    for (const rate of [0, 0.3, 0.5, 0.7, 0.9, 1]) {
      const p = nextProposal(stepsParam, 24, rate);
      expect(p).toBeGreaterThanOrEqual(stepsParam.min);
      expect(p).toBeLessThanOrEqual(stepsParam.max);
    }
  });

  it("high success widens capability, poor success narrows it", () => {
    expect(nextProposal(stepsParam, 24, 0.95)).toBe(28); // +4
    expect(nextProposal(stepsParam, 24, 0.4)).toBe(20); // -4
    expect(nextProposal(stepsParam, 24, 0.7)).toBe(24); // keep
  });

  it("no history means no change (nothing invented)", () => {
    expect(nextProposal(stepsParam, 24, null)).toBe(24);
  });

  it("clamps out-of-bounds stored values back into the envelope", () => {
    expect(clampEnvelope(stepsParam, 9999)).toBe(48);
    expect(clampEnvelope(stepsParam, -5)).toBe(8);
  });

  it("stays deterministic", () => {
    expect(nextProposal(stepsParam, 24, 0.9)).toBe(nextProposal(stepsParam, 24, 0.9));
  });
});

function mockTuningClient(opts: {
  params?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  calibration?: Record<string, { successes: number; failures: number }>;
  failReads?: boolean;
}) {
  const params = opts.params ?? [];
  const events = opts.events ?? [];
  const calibration = opts.calibration ?? {};
  const inserts: Record<string, Record<string, unknown>[]> = {
    [TUNABLE_PARAMS.length ? "archie_tuning_events" : "x"]: [],
    params: [],
  };
  const events_inserted: Record<string, unknown>[] = [];
  const upserts: Record<string, unknown>[] = [];
  const client: TuningClient = {
    from: (table: string) => {
      if (table === "archie_tuning_params") {
        return {
          select: () =>
            opts.failReads
              ? Promise.reject(new Error("db down"))
              : Promise.resolve({ data: params, error: null }),
          upsert: (row: Record<string, unknown>) => {
            upserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "archie_tuning_events") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: events, error: null }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            events_inserted.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      // calibration table reads
      return {
        select: () => ({
          eq: (_: string, key: string) => ({
            limit: () =>
              Promise.resolve({
                data: calibration[key] ? [calibration[key]] : [],
                error: null,
              }),
          }),
        }),
        upsert: () => Promise.resolve({ data: null, error: null }),
        selectCount: () => {},
      };
    },
  };
  void inserts;
  return { client, upserts, events_inserted };
}

describe("readTunedLimits — honest degradation", () => {
  it("returns code defaults when the DB read fails", async () => {
    const { client } = mockTuningClient({ failReads: true });
    expect(await readTunedLimits(client)).toEqual(DEFAULT_REASONING_LIMITS);
  });

  it("applies ONLY owner-approved rows, clamped into envelopes", async () => {
    const { client } = mockTuningClient({
      params: [
        { param_key: "maxSteps", current: 48, owner_approved: true },
        { param_key: "maxDepth", current: 99, owner_approved: true }, // out of bounds → clamped
        { param_key: "maxCandidates", current: 15, owner_approved: false }, // unapproved → ignored
      ],
    });
    const limits = await readTunedLimits(client);
    expect(limits.maxSteps).toBe(48);
    expect(limits.maxDepth).toBe(12); // clamped, not 99
    expect(limits.maxCandidates).toBe(DEFAULT_REASONING_LIMITS.maxCandidates);
  });

  it("ignores malformed values (never invents)", async () => {
    const { client } = mockTuningClient({
      params: [{ param_key: "maxSteps", current: "not-a-number", owner_approved: true }],
    });
    const limits = await readTunedLimits(client);
    expect(limits.maxSteps).toBe(DEFAULT_REASONING_LIMITS.maxSteps);
  });
});

describe("runTuningCycle — evidence-driven adjustment + rollback", () => {
  it("steps up on high success and records the event", async () => {
    const { client, upserts, events_inserted } = mockTuningClient({
      params: [
        { param_key: "maxSteps", current: 24, min: 8, max: 48, step: 4, owner_approved: true },
      ],
      calibration: { "tuning:maxSteps": { successes: 90, failures: 10 } }, // 0.9
    });
    const results = await runTuningCycle(client);
    expect(results).toHaveLength(1);
    expect(results[0].decision).toBe("applied");
    expect(results[0].after).toBe(28);
    expect(upserts[0].current).toBe(28);
    expect(events_inserted[0].outcome).toBe("applied");
  });

  it("keeps the parameter when history is neutral or absent", async () => {
    const { client, upserts } = mockTuningClient({
      params: [
        { param_key: "maxSteps", current: 24, min: 8, max: 48, step: 4, owner_approved: true },
      ],
      calibration: { "tuning:maxSteps": { successes: 6, failures: 4 } }, // 0.6 → keep
    });
    const results = await runTuningCycle(client);
    expect(results[0].decision).toBe("kept");
    expect(upserts).toHaveLength(0); // no DB move on "kept"
    expect(results[0].after).toBe(24);
  });

  it("ROLLS BACK when success regressed after the last adjustment", async () => {
    const { client, upserts, events_inserted } = mockTuningClient({
      params: [
        { param_key: "maxSteps", current: 32, min: 8, max: 48, step: 4, owner_approved: true },
      ],
      calibration: { "tuning:maxSteps": { successes: 3, failures: 9 } }, // 0.25 ≤ 0.5
      events: [{ from_value: 24, to_value: 32, outcome: "applied" }],
    });
    const results = await runTuningCycle(client);
    expect(results[0].decision).toBe("rolled_back");
    expect(results[0].after).toBe(24); // reverted to pre-adjustment value
    expect(upserts[0].current).toBe(24);
    expect(events_inserted[0].outcome).toBe("rolled_back");
  });

  it("refuses to tune unapproved parameters", async () => {
    const { client, upserts } = mockTuningClient({
      params: [
        { param_key: "maxSteps", current: 24, min: 8, max: 48, step: 4, owner_approved: false },
      ],
      calibration: { "tuning:maxSteps": { successes: 95, failures: 5 } },
    });
    const results = await runTuningCycle(client);
    expect(results[0].decision).toBe("skipped_unapproved");
    expect(upserts).toHaveLength(0);
  });

  it("refuses unknown parameter keys (never invents a tunable)", async () => {
    const { client } = mockTuningClient({
      params: [
        { param_key: "sentience_level", current: 99, min: 0, max: 100, step: 1, owner_approved: true },
      ],
    });
    const results = await runTuningCycle(client);
    expect(results).toHaveLength(0); // unknown key ignored entirely
  });

  it("degrades to an empty cycle when the DB read fails", async () => {
    const { client } = mockTuningClient({ failReads: true });
    expect(await runTuningCycle(client)).toEqual([]);
  });
});
