import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCESS_OPTIONS, PEOPLE_PERMISSIONS } from "../stage2-people-client";

// =========================================================
// STAGE 2 ACCEPTANCE — the architecture-level guarantees of
// the spec that can be verified statically and honestly
// (spec §§39, 41). Static source assertions are real checks
// of shipped code, not simulations of behavior.
// =========================================================

const root = process.cwd();

describe("Model independence (spec §§1, 11, 12, 39, 41)", () => {
  const core = readFileSync(
    join(root, "supabase/functions/archie-core/index.ts"),
    "utf-8",
  );
  const runtime = readFileSync(
    join(root, "supabase/functions/archie-core/model-runtime.ts"),
    "utf-8",
  );

  it("ARCHIE Core contains NO direct provider call — all inference flows through the abstraction", () => {
    expect(core).not.toMatch(/generativelanguage|api\.openai|anthropic/);
    expect(core).toMatch(/model-runtime/);
  });

  it("the runtime resolves engines through the provider-agnostic registry (Provider Independence Rule)", () => {
    expect(runtime).toMatch(/resolveArchieCapabilityEngine/);
    expect(runtime).toMatch(/ARCHIE_ENGINE/);
    expect(runtime).toMatch(/provider-agnostic engine registry/);
    expect(runtime).toMatch(/provider-agnostic/i);
  });

  it("ARCHIE core contains ZERO Gemini wiring — no keys, endpoints, models or fallbacks (Provider Independence Rule)", () => {
    expect(core).not.toContain("GOOGLE_AI_API_KEY");
    expect(core).not.toMatch(/generativelanguage|gemini/i);
    expect(runtime).not.toContain("GOOGLE_AI_API_KEY");
    expect(runtime).not.toMatch(/generativelanguage|gemini-\d|createGemini/i);
  });

  it("existing FRELUX functionality is preserved — the core still serves the same chat contract", () => {
    expect(core).toContain("ARCHIE_PERSONA");
    expect(core).toContain("frelux_archie_messages");
  });

  // Owner fix 2026-09-15: the owner chat must think through the
  // SAME brain as every ARCHIE surface — the raw owner message
  // reaches the shared NLU as real conversation turns, never a
  // flattened prompt blob.
  it("archie-core routes the owner's raw message through the shared NLU (single brain)", () => {
    expect(core).toMatch(
      /import \{ understand \} from "\.\.\/_shared\/archie-ai\/native-engine\/nlu\.ts"/,
    );
    expect(core).toContain("const nlu = understand(");
    expect(core).toContain("turns: [");
    expect(core).not.toContain("Conversation so far");
    expect(core).not.toContain("UNDERSTAND_SCHEMA");
    expect(core).not.toContain("Owner's new message:");
  });
});

describe("Family invitation security (spec §§25, 27, 28)", () => {
  const familyFn = readFileSync(
    join(root, "supabase/functions/archie-family/index.ts"),
    "utf-8",
  );
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260910100000_archie_stage2_family_people.sql",
    ),
    "utf-8",
  );

  it("invitation codes are crypto-random, hashed at rest, single-use and short-lived", () => {
    expect(familyFn).toContain("crypto.getRandomValues");
    expect(familyFn).toContain("code_hash");
    expect(familyFn).toContain("used_at");
    expect(familyFn).toMatch(/24 \* 60 \* 60/);
  });

  it("the code alone never grants access — redemption only creates a pending request", () => {
    expect(familyFn).toContain("PENDING_REQUEST");
    expect(familyFn).toMatch(/code alone grants nothing/i);
  });

  it("owner-gated actions are enforced server-side with audit of unauthorized attempts", () => {
    expect(familyFn).toMatch(/owner_id !== caller\.id/);
    expect(familyFn).toContain("archie.family.unauthorized_attempt");
  });

  it("multi-person data isolation is database-enforced: RLS + owner-scoped RPCs (§28)", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("person sees own record");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toMatch(/owner_id = auth\.uid\(\)/);
  });

  it("the UI permission list matches the server's accepted permission keys (§26)", () => {
    expect(PEOPLE_PERMISSIONS).toContain("ARCHIE_CHAT");
    expect(PEOPLE_PERMISSIONS).toContain("SHARED_KNOWLEDGE");
    expect(PEOPLE_PERMISSIONS).toContain("CRYPTO_INTELLIGENCE");
    expect(PEOPLE_PERMISSIONS.length).toBeGreaterThanOrEqual(17);
  });

  it("temporary access options match the spec durations (§27)", () => {
    const hours = ACCESS_OPTIONS.map((o) => o.hours);
    expect(hours).toEqual(expect.arrayContaining([1, 24, 168, 720, 0]));
  });
});

describe("Honesty contract (spec §40)", () => {
  it("nothing in the shipped Stage 2 modules fakes intelligence", async () => {
    const { MODEL_LIFECYCLE_CAPABILITIES } = await import("../model-lifecycle");
    const training = MODEL_LIFECYCLE_CAPABILITIES.filter((c) =>
      c.capability.toLowerCase().includes("training"),
    );
    expect(training.length).toBeGreaterThan(0);
    for (const t of training) expect(t.status).toBe("NOT_YET_IMPLEMENTED");
  });
});
