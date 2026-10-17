// ============================================================
// ARCHIE GOAL ENGINE
// (full-agent audit 2026-10-17, gap 18 / suggested engine 7)
//
// Before this engine ARCHIE was reactive-only: every plan
// lived for the duration of one request. Long-horizon owner
// objectives — "get the office build finished", "learn Yoruba
// by December" — had no persistent representation, no
// progress tracking, and no honest status.
//
// This engine adds long-horizon intent, deterministically:
//
//   * DECLARATION: the owner declares a goal; the engine
//     extracts the title and an OPTIONAL target date from
//     real date language ("by March", "before Dec 25"). The
//     rest of the sentence is preserved verbatim — nothing
//     invented, nothing summarized away.
//   * HONEST DECOMPOSITION: the engine NEVER invents steps
//     (FINAL COMMAND — no invented values, and the native
//     boundary forbids generative planning). Steps are
//     accepted from three real sources only:
//       (a) explicit enumeration already in the declaration
//           ("first X, then Y, finally Z"),
//       (b) the owner teaching a step ("add step: ..."),
//       (c) the deterministic planner, when the goal matches
//           existing planning operators (delegated by the
//           caller — this module stays planner-agnostic).
//     A goal with no steps is honest about it: 0 steps,
//     progress unknown until steps exist.
//   * PROGRESS: explicit step completion only ("mark step 2
//     done"). Completion never auto-inferred from chatter.
//     A goal completes when its owner marks it complete or
//     every step is done AND the owner confirms — never
//     silently.
//   * STATUS: the honest report — steps done/total, the next
//     pending step, target-date distance in days computed
//     from the owner's timezone-free UTC instant, staleness
//     (days since last progress), and plain statements when
//     there is nothing to report.
//   * PERSISTENCE: a store port with an in-memory fallback
//     (per-isolate, honest about volatility) and a Supabase
//     adapter ready for the new database. A failed store
//     degrades honestly: tools surface the error, never a
//     fake success.
//
// Deterministic end to end. No external AI. No sub-agents.
// ============================================================

export type GoalStatus =
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

export interface GoalStep {
  id: string;
  goal_id: string;
  description: string;
  done: boolean;
  position: number;
  completed_at: string | null;
}

export interface Goal {
  id: string;
  title: string;
  status: GoalStatus;
  target_date: string | null;
  created_at: string;
  last_progress_at: string | null;
}

export interface GoalEvent {
  goal_id: string;
  event: string;
  detail: string;
  created_at: string;
}

export interface GoalStore {
  createGoal(
    title: string,
    targetDate: string | null,
  ): Promise<Goal>;
  addStep(goalId: string, description: string): Promise<GoalStep>;
  completeStep(goalId: string, position: number): Promise<
    { step: GoalStep; goal: Goal }
  >;
  listGoals(includeCompleted: boolean): Promise<
    Array<Goal & { steps: GoalStep[] }>
  >;
  updateStatus(goalId: string, status: GoalStatus): Promise<Goal>;
  recordEvent(goalId: string, event: string, detail: string): Promise<void>;
}

// ------------------------------------------------------------
// Deterministic declaration parsing
// ------------------------------------------------------------

const DATE_PATTERNS: Array<{ re: RegExp; month: number }> = [
  { re: /\bby (january|jan)\b/i, month: 1 },
  { re: /\bby (february|feb)\b/i, month: 2 },
  { re: /\bby (march|mar)\b/i, month: 3 },
  { re: /\bby (april|apr)\b/i, month: 4 },
  { re: /\bby (may)\b/i, month: 5 },
  { re: /\bby (june|jun)\b/i, month: 6 },
  { re: /\bby (july|jul)\b/i, month: 7 },
  { re: /\bby (august|aug)\b/i, month: 8 },
  { re: /\bby (september|sep|sept)\b/i, month: 9 },
  { re: /\bby (october|oct)\b/i, month: 10 },
  { re: /\bby (november|nov)\b/i, month: 11 },
  { re: /\bby (december|dec)\b/i, month: 12 },
  { re: /\bbefore (january|jan)\b/i, month: 1 },
  { re: /\bbefore (february|feb)\b/i, month: 2 },
  { re: /\bbefore (march|mar)\b/i, month: 3 },
  { re: /\bbefore (april|apr)\b/i, month: 4 },
  { re: /\bbefore (may)\b/i, month: 5 },
  { re: /\bbefore (june|jun)\b/i, month: 6 },
  { re: /\bbefore (july|jul)\b/i, month: 7 },
  { re: /\bbefore (august|aug)\b/i, month: 8 },
  { re: /\bbefore (september|sep|sept)\b/i, month: 9 },
  { re: /\bbefore (october|oct)\b/i, month: 10 },
  { re: /\bbefore (november|nov)\b/i, month: 11 },
  { re: /\bbefore (december|dec)\b/i, month: 12 },
];

/** Extract an explicit end-of-month target date from real
 *  date language in the declaration. Month-only targets are
 *  pinned to the LAST day of the month (an end-of-month
 *  deadline is the honest reading of "by March"). */
export function extractTargetDate(
  declaration: string,
  now = new Date(),
): string | null {
  // Special dated holidays: explicit calendar dates, not
  // month ends. "By Christmas" means December 25, and the
  // year rolls honestly once the day has passed.
  const christmas = declaration.match(
    /\b(by|before) (dec(?:ember)? ?25|christmas)\b/i,
  );
  if (christmas) {
    const dec25 = new Date(Date.UTC(now.getUTCFullYear(), 11, 25));
    const year =
      dec25.getTime() > now.getTime()
        ? now.getUTCFullYear()
        : now.getUTCFullYear() + 1;
    return `${year}-12-25`;
  }
  for (const { re, month } of DATE_PATTERNS) {
    const m = declaration.match(re);
    if (!m) continue;
    // next occurrence of that month end, strictly after now
    const year =
      month > now.getUTCMonth() + 1
        ? now.getUTCFullYear()
        : now.getUTCFullYear() + 1;
    const day = new Date(Date.UTC(year, month, 0)); // day 0 = last day of previous month
    return day.toISOString().slice(0, 10);
  }
  // explicit ISO date in the text
  const iso = declaration.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : null;
}

/** Strip the date clause from the title so it is not
 *  duplicated; keep the owner's words otherwise. */
function titleFromDeclaration(declaration: string): string {
  return declaration
    .replace(/\b(by|before) (dec(?:ember)? ?25|christmas)\b/i, "")
    .replace(/\b(by|before) (jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\b/i, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

export interface ParsedDeclaration {
  title: string;
  targetDate: string | null;
}

export function parseGoalDeclaration(
  declaration: string,
  now = new Date(),
): ParsedDeclaration | null {
  const raw = declaration.trim();
  if (raw.length < 3 || raw.length > 500) return null;
  const targetDate = extractTargetDate(raw, now);
  const title = titleFromDeclaration(raw) || raw;
  if (title.length < 3) return null;
  return { title: title.slice(0, 200), targetDate };
}

// ------------------------------------------------------------
// Honest decomposition — structure only, never invention
// ------------------------------------------------------------

const ENUM_SPLIT =
  /\s*(?:,|;| - |\band then\b|\bthen\b|\bfirst\b|\bnext\b|\bfinally\b)\s*/i;

/** Extract steps ONLY from explicit enumeration structure in
 *  the declaration. No structure → no steps, honestly. */
export function decomposeHonest(
  title: string,
): string[] {
  const hasStructure =
    /,|;|\bthen\b|\bfirst\b|\bnext\b|\bfinally\b|\bstep \d/i.test(title);
  if (!hasStructure) return [];
  const parts = title
    .split(ENUM_SPLIT)
    .map((p) => p.replace(/^[\s.:-]+/, "").trim())
    .filter((p) => p.length >= 3 && p.length <= 200);
  // A single fragment is not an enumeration.
  if (parts.length < 2) return [];
  return parts.slice(0, 10);
}

// ------------------------------------------------------------
// Honest progress reporting
// ------------------------------------------------------------

export interface GoalProgress {
  goal: Goal;
  stepsTotal: number;
  stepsDone: number;
  percent: number | null;
  nextStep: string | null;
  daysToTarget: number | null;
  daysStale: number | null;
}

export function progressFor(
  goal: Goal,
  steps: GoalStep[],
  now = new Date(),
): GoalProgress {
  const done = steps.filter((s) => s.done);
  const pending = [...steps]
    .filter((s) => !s.done)
    .sort((a, b) => a.position - b.position);
  const daysBetween = (iso: string) =>
    Math.round(
      (Date.parse(iso) - now.getTime()) / 86_400_000,
    );
  return {
    goal,
    stepsTotal: steps.length,
    stepsDone: done.length,
    percent: steps.length > 0 ? done.length / steps.length : null,
    nextStep: pending[0]?.description ?? null,
    daysToTarget: goal.target_date ? daysBetween(goal.target_date) : null,
    daysStale: goal.last_progress_at
      ? Math.abs(daysBetween(goal.last_progress_at))
      : null,
  };
}

/** Compose the honest one-line status for one goal. Plain
 *  statements, no invented optimism, no fake percentages
 *  when there are no steps. */
export function describeProgress(p: GoalProgress): string {
  const pct =
    p.percent === null
      ? "no steps defined yet — progress unknown until steps are added"
      : `${Math.round(p.percent * 100)}% (${p.stepsDone}/${p.stepsTotal} steps)`;
  const target =
    p.daysToTarget === null
      ? ""
      : p.daysToTarget > 0
        ? ` target in ${p.daysToTarget} day(s)`
        : p.daysToTarget === 0
          ? " target is TODAY"
          : ` target PASSED ${Math.abs(p.daysToTarget)} day(s) ago`;
  const next = p.nextStep ? `. Next: ${p.nextStep}` : "";
  const stale =
    p.daysStale !== null && p.daysStale >= 14
      ? ` (no progress in ${p.daysStale} days)`
      : "";
  return `Goal "${p.goal.title}" [${p.goal.status}] — ${p.percent === null ? pct : `step-complete ${pct}`}${target}${next}${stale}`;
}

export function describeAll(
  goals: Array<Goal & { steps: GoalStep[] }>,
  now = new Date(),
): string {
  const live = goals.filter((g) => g.status !== "abandoned");
  if (live.length === 0) return "No goals on record.";
  return live
    .map((g) => describeProgress(progressFor(g, g.steps, now)))
    .join("\n");
}

// ------------------------------------------------------------
// In-memory store — per-isolate fallback, honest about
// volatility. IDs are monotonic; deterministic given the
// call sequence.
// ------------------------------------------------------------

export class InMemoryGoalStore implements GoalStore {
  private goals = new Map<string, Goal>();
  private steps = new Map<string, GoalStep[]>();
  private events: GoalEvent[] = [];
  private seq = 0;

  async createGoal(
    title: string,
    targetDate: string | null,
  ): Promise<Goal> {
    const id = `goal-${++this.seq}`;
    const goal: Goal = {
      id,
      title,
      status: "active",
      target_date: targetDate,
      created_at: new Date().toISOString(),
      last_progress_at: null,
    };
    this.goals.set(id, goal);
    this.steps.set(id, []);
    await this.recordEvent(id, "goal_declared", title);
    return { ...goal };
  }

  async addStep(goalId: string, description: string): Promise<GoalStep> {
    const list = this.steps.get(goalId);
    if (!list) throw new Error(`unknown goal: ${goalId}`);
    const step: GoalStep = {
      id: `${goalId}-step-${list.length + 1}`,
      goal_id: goalId,
      description,
      done: false,
      position: list.length + 1,
      completed_at: null,
    };
    list.push(step);
    await this.recordEvent(goalId, "step_added", description);
    return { ...step };
  }

  async completeStep(
    goalId: string,
    position: number,
  ): Promise<{ step: GoalStep; goal: Goal }> {
    const list = this.steps.get(goalId);
    const goal = this.goals.get(goalId);
    if (!list || !goal) throw new Error(`unknown goal: ${goalId}`);
    const step = list.find((s) => s.position === position);
    if (!step) {
      throw new Error(
        `goal ${goalId} has no step ${position} (it has ${list.length})`,
      );
    }
    if (step.done) {
      return { step: { ...step }, goal: { ...goal } };
    }
    step.done = true;
    step.completed_at = new Date().toISOString();
    goal.last_progress_at = step.completed_at;
    await this.recordEvent(
      goalId,
      "step_completed",
      `${position}: ${step.description}`,
    );
    return { step: { ...step }, goal: { ...goal } };
  }

  async listGoals(
    includeCompleted: boolean,
  ): Promise<Array<Goal & { steps: GoalStep[] }>> {
    const all = [...this.goals.values()]
      .filter((g) => includeCompleted || (g.status !== "completed" && g.status !== "abandoned"))
      .map((g) => ({
        ...g,
        steps: [...(this.steps.get(g.id) ?? [])],
      }));
    return all;
  }

  async updateStatus(goalId: string, status: GoalStatus): Promise<Goal> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error(`unknown goal: ${goalId}`);
    goal.status = status;
    await this.recordEvent(goalId, "status_changed", status);
    return { ...goal };
  }

  async recordEvent(
    goalId: string,
    event: string,
    detail: string,
  ): Promise<void> {
    this.events.push({
      goal_id: goalId,
      event,
      detail,
      created_at: new Date().toISOString(),
    });
  }

  /** Test/inspection access — the real audit trail. */
  eventLog(): GoalEvent[] {
    return [...this.events];
  }
}

// ------------------------------------------------------------
// Supabase adapter — ready for the new database, RLS
// lockdown expected (service-role only). Errors surface
// honestly; nothing is faked.
// ------------------------------------------------------------

export interface SupabaseLikeClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const GOALS_TABLE = "archie_goals";
export const GOAL_STEPS_TABLE = "archie_goal_steps";
export const GOAL_EVENTS_TABLE = "archie_goal_events";

type DbResult<T> = { data: T | null; error: { message: string } | null };

export class SupabaseGoalStore implements GoalStore {
  constructor(private client: SupabaseLikeClient) {}

  private err(r: DbResult<unknown>): never | null {
    if (r && r.error) throw new Error(r.error.message);
    return null;
  }

  async createGoal(
    title: string,
    targetDate: string | null,
  ): Promise<Goal> {
    const r = (await this.client.from(GOALS_TABLE).insert({
      title,
      target_date: targetDate,
      status: "active",
    }).select().limit(1)) as DbResult<Goal[]>;
    this.err(r);
    await this.recordEvent(r.data![0].id, "goal_declared", title);
    return r.data![0];
  }

  async addStep(goalId: string, description: string): Promise<GoalStep> {
    const r = (await this.client.from(GOAL_STEPS_TABLE).insert({
      goal_id: goalId,
      description,
      done: false,
      position: 0, // assigned by trigger: max+1
    }).select().limit(1)) as DbResult<GoalStep[]>;
    this.err(r);
    return r.data![0];
  }

  async completeStep(
    goalId: string,
    position: number,
  ): Promise<{ step: GoalStep; goal: Goal }> {
    const rs = (await this.client.from(GOAL_STEPS_TABLE)
      .select()
      .eq("goal_id", goalId)
      .eq("position", position)
      .limit(1)) as DbResult<GoalStep[]>;
    this.err(rs);
    if (!rs.data || rs.data.length === 0) {
      throw new Error(`goal ${goalId} has no step ${position}`);
    }
    const step = rs.data[0];
    if (!step.done) {
      const ru = (await this.client.from(GOAL_STEPS_TABLE)
        .update({ done: true, completed_at: new Date().toISOString() })
        .eq("id", step.id)
        .select()) as DbResult<GoalStep[]>;
      this.err(ru);
    }
    const rg = (await this.client.from(GOALS_TABLE)
      .select()
      .eq("id", goalId)
      .limit(1)) as DbResult<Goal[]>;
    this.err(rg);
    await this.recordEvent(
      goalId,
      "step_completed",
      `${position}: ${step.description}`,
    );
    return { step, goal: rg.data![0] };
  }

  async listGoals(
    includeCompleted: boolean,
  ): Promise<Array<Goal & { steps: GoalStep[] }>> {
    let q = this.client.from(GOALS_TABLE).select(
      "id,title,status,target_date,created_at,last_progress_at",
    );
    if (!includeCompleted) {
      q = q.eq("status", "active");
    }
    const rg = (await q.order("created_at", { ascending: true })) as DbResult<
      Goal[]
    >;
    this.err(rg);
    const goals = rg.data ?? [];
    const rs = (await this.client.from(GOAL_STEPS_TABLE)
      .select("id,goal_id,description,done,position,completed_at")
      .order("position", { ascending: true })) as DbResult<GoalStep[]>;
    this.err(rs);
    const byGoal = new Map<string, GoalStep[]>();
    for (const s of rs.data ?? []) {
      const list = byGoal.get(s.goal_id) ?? [];
      list.push(s);
      byGoal.set(s.goal_id, list);
    }
    return goals.map((g) => ({ ...g, steps: byGoal.get(g.id) ?? [] }));
  }

  async updateStatus(goalId: string, status: GoalStatus): Promise<Goal> {
    const r = (await this.client.from(GOALS_TABLE)
      .update({ status })
      .eq("id", goalId)
      .select()
      .limit(1)) as DbResult<Goal[]>;
    this.err(r);
    await this.recordEvent(goalId, "status_changed", status);
    return r.data![0];
  }

  async recordEvent(
    goalId: string,
    event: string,
    detail: string,
  ): Promise<void> {
    const r = (await this.client.from(GOAL_EVENTS_TABLE).insert({
      goal_id: goalId,
      event,
      detail,
    })) as DbResult<unknown>;
    this.err(r);
  }
}
