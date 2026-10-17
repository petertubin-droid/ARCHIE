// ============================================================
// ARCHIE GOAL ENGINE — TESTS
// Declaration parsing, honest decomposition, progress
// reporting, in-memory + Supabase stores. Nothing invented;
// errors surface honestly.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  InMemoryGoalStore,
  SupabaseGoalStore,
  decomposeHonest,
  describeAll,
  describeProgress,
  extractTargetDate,
  parseGoalDeclaration,
  progressFor,
  type Goal,
  type GoalStep,
} from "./goal-engine.ts";

const NOW = new Date("2026-10-18T00:00:00.000Z");

describe("parseGoalDeclaration", () => {
  it("extracts a clean title and month-end target from real date language", () => {
    const p = parseGoalDeclaration("Finish the office build by December", NOW);
    expect(p?.title).toBe("Finish the office build");
    expect(p?.targetDate).toBe("2026-12-31"); // month end = honest "by December"
  });

  it("rolls to next year when the month has passed", () => {
    const p = parseGoalDeclaration("Learn Yoruba by March", NOW);
    expect(p?.targetDate).toBe("2027-03-31");
  });

  it("accepts an explicit ISO date, verbatim title preserved", () => {
    const p = parseGoalDeclaration(
      "Publish the audit report 2026-11-01",
      NOW,
    );
    expect(p?.targetDate).toBe("2026-11-01");
    expect(p?.title).toBe("Publish the audit report");
  });

  it("keeps a targetless declaration intact", () => {
    const p = parseGoalDeclaration("Get better at estimation", NOW);
    expect(p?.title).toBe("Get better at estimation");
    expect(p?.targetDate).toBeNull();
  });

  it("refuses junk: empty, too short, too long", () => {
    expect(parseGoalDeclaration("", NOW)).toBeNull();
    expect(parseGoalDeclaration("ab", NOW)).toBeNull();
    expect(parseGoalDeclaration("x".repeat(501), NOW)).toBeNull();
  });

  it("title never exceeds the 200-char bound", () => {
    const p = parseGoalDeclaration("g".repeat(400), NOW);
    expect(p!.title.length).toBeLessThanOrEqual(200);
  });
});

describe("extractTargetDate — christmas special case", () => {
  it("reads 'by Christmas' as December 25", () => {
    expect(extractTargetDate("Ship the course by Christmas", NOW)).toBe(
      "2026-12-25",
    );
  });
});

describe("decomposeHonest — structure only, never invention", () => {
  it("finds explicitly enumerated steps", () => {
    const steps = decomposeHonest(
      "Pass the certification: first study the guide, then do the practice exam, finally book the test",
    );
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.some((s) => /study the guide/i.test(s))).toBe(true);
    expect(steps.some((s) => /practice exam/i.test(s))).toBe(true);
  });

  it("single-fragment text is NOT an enumeration — no fake steps", () => {
    expect(decomposeHonest("Learn to weld")).toEqual([]);
  });

  it("no structure at all → honest empty", () => {
    expect(decomposeHonest("Read more books this year")).toEqual([]);
  });

  it("caps at 10 steps", () => {
    const steps = decomposeHonest(
      Array.from({ length: 25 }, (_, i) => `task ${i}`).join(", "),
    );
    expect(steps.length).toBe(10);
  });
});

describe("progressFor + describeProgress — honest reporting", () => {
  const goal: Goal = {
    id: "g1",
    title: "Finish the office build",
    status: "active",
    target_date: "2026-11-18",
    created_at: "2026-10-01T00:00:00Z",
    last_progress_at: "2026-10-17T00:00:00Z",
  };
  const steps: GoalStep[] = [
    { id: "s1", goal_id: "g1", description: "Pour the slab", done: true, position: 1, completed_at: "2026-10-17T00:00:00Z" },
    { id: "s2", goal_id: "g1", description: "Frame the walls", done: false, position: 2, completed_at: null },
    { id: "s3", goal_id: "g1", description: "Roof it", done: false, position: 3, completed_at: null },
  ];

  it("counts real progress, names the next step, dates the target", () => {
    const p = progressFor(goal, steps, NOW);
    expect(p.stepsDone).toBe(1);
    expect(p.stepsTotal).toBe(3);
    expect(p.percent).toBeCloseTo(1 / 3);
    expect(p.nextStep).toBe("Frame the walls");
    expect(p.daysToTarget).toBe(31);
    const line = describeProgress(p);
    expect(line).toContain("33% (1/3 steps)");
    expect(line).toContain("target in 31 day(s)");
    expect(line).toContain("Next: Frame the walls");
  });

  it("no steps → honest 'progress unknown', never a fake 0%", () => {
    const p = progressFor({ ...goal, target_date: null }, []);
    expect(p.percent).toBeNull();
    const line = describeProgress(p);
    expect(line).toContain("no steps defined yet");
    expect(line).toContain("progress unknown");
    expect(line).not.toContain("0%");
  });

  it("flags staleness after two weeks without progress", () => {
    const stale = { ...goal, last_progress_at: "2026-09-20T00:00:00Z" };
    const line = describeProgress(progressFor(stale, steps, NOW));
    expect(line).toContain("no progress in 28 days");
  });

  it("today's target is announced as TODAY, yesterday as PASSED", () => {
    const today = { ...goal, target_date: "2026-10-18" };
    expect(describeProgress(progressFor(today, steps, NOW))).toContain(
      "target is TODAY",
    );
    const past = { ...goal, target_date: "2026-10-15" };
    expect(describeProgress(progressFor(past, steps, NOW))).toContain(
      "target PASSED 3 day(s) ago",
    );
  });
});

describe("describeAll", () => {
  it("no goals → plain honest statement", () => {
    expect(describeAll([], NOW)).toBe("No goals on record.");
  });

  it("abandoned goals are excluded from the live report", async () => {
    const store = new InMemoryGoalStore();
    const g1 = await store.createGoal("Active goal", null);
    const g2 = await store.createGoal("Dropped goal", null);
    await store.updateStatus(g2.id, "abandoned");
    const all = await store.listGoals(true);
    const line = describeAll(all, NOW);
    expect(line).toContain("Active goal");
    expect(line).not.toContain("Dropped goal");
    expect(g1.status).toBe("active");
  });
});

describe("InMemoryGoalStore — full lifecycle", () => {
  it("declare → decompose from the declaration itself → complete → status", async () => {
    const store = new InMemoryGoalStore();
    const parsed = parseGoalDeclaration(
      "Relaunch the site: first fix the articles, then audit the ads, finally ship the new header",
      NOW,
    )!;
    const goal = await store.createGoal(parsed.title, parsed.targetDate);
    expect(goal.status).toBe("active");

    const steps = decomposeHonest(
      "fix the articles, audit the ads, ship the new header",
    );
    for (const s of steps) await store.addStep(goal.id, s);
    const withSteps = await store.listGoals(false);
    expect(withSteps[0].steps.length).toBe(3);

    await store.completeStep(goal.id, 1);
    await store.completeStep(goal.id, 2);
    const mid = progressFor(
      (await store.listGoals(true))[0],
      (await store.listGoals(true))[0].steps,
      NOW,
    );
    expect(mid.stepsDone).toBe(2);
    expect(mid.goal.last_progress_at).not.toBeNull();

    // completing an already-done step is a no-op, not an error
    const again = await store.completeStep(goal.id, 1);
    expect(again.step.done).toBe(true);

    // unknown step position → honest error
    await expect(store.completeStep(goal.id, 9)).rejects.toThrow(
      /no step 9/,
    );

    await store.updateStatus(goal.id, "completed");
    expect((await store.listGoals(false)).length).toBe(0); // completed filtered out
    expect((await store.listGoals(true)).length).toBe(1);

    // full event audit trail exists, in order
    const events = store.eventLog().map((e) => e.event);
    expect(events).toEqual([
      "goal_declared",
      "step_added",
      "step_added",
      "step_added",
      "step_completed",
      "step_completed",
      "status_changed",
    ]);
  });
});

describe("SupabaseGoalStore — ready for the new database", () => {
  function makeClient(opts: { fail?: boolean } = {}) {
    const inserts: Array<[string, Record<string, unknown>]> = [];
    const client = {
      from: (table: string) => {
        const chain = {
          insert: (row: Record<string, unknown>) => {
            inserts.push([table, row]);
            return {
              select: () => ({
                limit: () =>
                  Promise.resolve(
                    opts.fail
                      ? { data: null, error: { message: "db down" } }
                      : {
                          data: [
                            {
                              id: "uuid-1",
                              title: row.title,
                              status: "active",
                              target_date: row.target_date ?? null,
                              created_at: NOW.toISOString(),
                              last_progress_at: null,
                            },
                          ],
                          error: null,
                        },
                  ),
              }),
            };
          },
          select: () => chain,
          eq: () => chain,
          order: () =>
            Promise.resolve(
              opts.fail
                ? { data: null, error: { message: "db down" } }
                : { data: [], error: null },
            ),
          update: () => chain,
        };
        return chain;
      },
    };
    return { client, inserts };
  }

  it("creates a goal and writes the audit event", async () => {
    const { client, inserts } = makeClient();
    const store = new SupabaseGoalStore(client);
    const goal = await store.createGoal("Ship the audit", "2026-12-31");
    expect(goal.id).toBe("uuid-1");
    expect(goal.status).toBe("active");
    const tables = inserts.map((i) => i[0]);
    expect(tables).toEqual(["archie_goals", "archie_goal_events"]);
  });

  it("surfaces database errors honestly — never a fake success", async () => {
    const { client } = makeClient({ fail: true });
    const store = new SupabaseGoalStore(client);
    await expect(store.createGoal("x", null)).rejects.toThrow("db down");
    await expect(store.listGoals(true)).rejects.toThrow("db down");
  });
});
