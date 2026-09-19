// =========================================================
// ARCHIE PHASE 4.3 — FRONTEND/BACKEND MIRROR-DRIFT CONTRACT
//
// The repo has three places where a frontend surface and a
// backend surface are maintained in PARALLEL and can drift
// apart silently — this test pins all three, CI-red on drift:
//
//   CONTRACT A — EDGE-FUNCTION REFERENCES ↔ DEPLOYED CODE
//     Every edge-function slug the frontend references
//     statically (functions.invoke(...) / functions/v1/<slug>)
//     must exist as supabase/functions/<slug>/index.ts on
//     disk. This is the exact drift class that broke the
//     sitemap path (a function removed while callers still
//     referenced it). Known-missing slugs live in
//     KNOWN_MISSING below — with reasons, loudly.
//
//   CONTRACT B — ANATOMY SEEDS ↔ REGISTRY PROBES ↔ COUNT
//     The archie_subsystems seeds in migrations, the probe
//     subsystem_keys in the registry, and the
//     ANATOMY_SUBSYSTEM_COUNT constant are three mirrors of
//     the same skeleton. A new subsystem seeded without a
//     probe (or with a stale count) must fail here.
//
//   CONTRACT C — CORE REGISTRY ↔ DISK
//     Every module specifier in the FRELUX_CORE_SYSTEMS
//     registry must resolve to a real file. The runtime
//     health check verifies exports dynamically in the
//     browser; this is the CI-time static floor.
//
// Honest limitation: DYNAMIC invoke call sites (slug built
// from a variable, e.g. the AdminAiSettings template map) are
// not statically scan-able — those are covered by the Phase
// 4.1 deployed-functions inventory, not this test.
// =========================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { ANATOMY_SUBSYSTEM_COUNT } from "@studio-shared/archie-ai/anatomy/registry.ts";

const ROOT = resolve(__dirname, "../../../..");

// ---------------------------------------------------------
// helpers
// ---------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------
// CONTRACT A — frontend edge-function references
// ---------------------------------------------------------

/** Edge-function slugs known to be referenced but not (yet)
 *  deployed — each with the reason and the owner decision
 *  pending. If one of these starts existing on disk the test
 *  FAILS ON PURPOSE: the entry is stale, remove it. */
const KNOWN_MISSING: Record<string, string> = {
  // roof-view-imagery was removed from this allowlist
  // (2026-09-19): the edge function now EXISTS and is
  // deployed (audit F3 fix, 54794e18) with its admin page at
  // /admin/roof-view. Contract satisfied, entry retired.
  // JSDoc usage example in src/lib/supabase-monitor.ts — a
  // documentation sample, not a real call site.
  "my-function": "doc-comment example only, never invoked",
};

function frontendEdgeReferences(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const add = (slug: string, file: string) => {
    const list = refs.get(slug) ?? [];
    list.push(file);
    refs.set(slug, list);
  };
  // Production call sites only: *.test.* files mock invoke()
  // with fixture slugs on purpose and are not contract-bound.
  // Consolidation note (2026-09-13): ARCHIE is back on the
  // app's own project (Freluxtools) — Frelukx is disconnected
  // and left intact. These two files are still ROUTING
  // infrastructure, not call sites; the target slugs now map
  // to THIS repo's supabase/functions directory again.
  // Frontend call sites (chat-client etc.) remain fully
  // contract-bound to THIS repo's deployed functions.
  const ROUTING_LAYER = new Set([
    join(ROOT, "src/lib/supabase.ts"),
    join(ROOT, "src/lib/archie/remote-bridge.ts"),
  ]);
  const files = [
    ...walk(join(ROOT, "src")).filter(
      (f) =>
        /\.(ts|tsx)$/.test(f) &&
        !/\.test\.(ts|tsx)$/.test(f) &&
        !ROUTING_LAYER.has(f),
    ),
    ...walk(join(ROOT, "public")).filter((f) => /\.(js|html)$/.test(f)),
  ];
  const INVOKE = /functions\.invoke[\s\S]{0,300}?['"]([a-z0-9-]{3,})['"]/g;
  const ROUTE = /functions\/v1\/([a-z0-9-]+)/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(INVOKE)) add(m[1], file);
    for (const m of text.matchAll(ROUTE)) add(m[1], file);
  }
  return refs;
}

describe("contract A: frontend ↔ edge functions", () => {
  const refs = frontendEdgeReferences();

  it("the scan actually found references (scanner not broken)", () => {
    expect(refs.size).toBeGreaterThan(10);
  });

  it("every statically referenced slug is deployed on disk", () => {
    const missing: string[] = [];
    for (const [slug, files] of refs) {
      if (KNOWN_MISSING[slug]) continue;
      if (!existsSync(join(ROOT, "supabase/functions", slug, "index.ts"))) {
        missing.push(`${slug} (referenced from ${files.join(", ")})`);
      }
    }
    expect(
      missing,
      `edge functions referenced but not deployed:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("KNOWN_MISSING entries are still missing (no stale allowlist)", () => {
    const stale = Object.keys(KNOWN_MISSING).filter((slug) =>
      existsSync(join(ROOT, "supabase/functions", slug, "index.ts")),
    );
    expect(
      stale,
      `these allowlisted slugs now EXIST on disk — remove them from KNOWN_MISSING: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("every KNOWN_MISSING slug is actually still referenced", () => {
    const orphan = Object.keys(KNOWN_MISSING).filter((slug) => !refs.has(slug));
    expect(
      orphan,
      `allowlisted slugs no longer referenced — remove from KNOWN_MISSING: ${orphan.join(", ")}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------
// CONTRACT B — anatomy seeds ↔ probes ↔ count
// ---------------------------------------------------------

interface SeedRow {
  key: string;
  ordinal: number;
}

/** Line-based parser for archie_subsystems INSERT seeds across
 *  all migrations — handles both multi-row blocks and
 *  single-line inserts (ON CONFLICT included). */
function anatomySeeds(): SeedRow[] {
  const migrationsDir = join(ROOT, "supabase/migrations");
  const rows: SeedRow[] = [];
  const seen = new Set<string>();
  const record = (line: string) => {
    for (const m of line.matchAll(/\('([a-z0-9-]+)'/g)) {
      const key = m[1];
      // (key) in "ON CONFLICT (key)" has no quote — safe above.
      const ordinalMatches = [...line.matchAll(/,\s*(\d+)\)/g)];
      const ordinal = ordinalMatches.length
        ? Number(ordinalMatches[ordinalMatches.length - 1][1])
        : NaN;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ key, ordinal });
      }
    }
  };
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith(".sql")) continue;
    const lines = readFileSync(join(migrationsDir, file), "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/INSERT INTO (?:public\.)?archie_subsystems/i.test(line)) {
        // single-row inserts carry the key on the INSERT line
        record(line);
        // multi-row blocks carry keys on indented ('key',… lines
        i++;
        while (i < lines.length && /^\s*\('/.test(lines[i])) {
          record(lines[i]);
          i++;
        }
      }
    }
  }
  return rows;
}

function anatomyProbes(): string[] {
  const registry = readFileSync(
    join(ROOT, "supabase/functions/_shared/archie-ai/anatomy/registry.ts"),
    "utf8",
  );
  // The same subsystem_key string appears once per code path
  // (try/catch probes push it twice) — the runtime emits ONE
  // ProbeResult per subsystem, so the contract uses DISTINCT keys.
  return [
    ...new Set(
      [...registry.matchAll(/subsystem_key:\s*"([a-z0-9-]+)"/g)].map(
        (m) => m[1],
      ),
    ),
  ];
}

describe("contract B: anatomy seeds ↔ registry probes ↔ count", () => {
  const seeds = anatomySeeds();
  const probes = anatomyProbes();
  const seedKeys = seeds.map((s) => s.key);

  it("migration seeds match the registry constant", () => {
    expect(seeds.length).toBe(ANATOMY_SUBSYSTEM_COUNT);
  });

  it("probe count matches the registry constant", () => {
    expect(probes.length).toBe(ANATOMY_SUBSYSTEM_COUNT);
  });

  it("every seed has a probe (no unprobed subsystem)", () => {
    const probeSet = new Set(probes);
    const unprobed = seedKeys.filter((k) => !probeSet.has(k));
    expect(
      unprobed,
      `seeded subsystems with no health probe: ${unprobed.join(", ")}`,
    ).toEqual([]);
  });

  it("every probe has a seed (no probe for a ghost subsystem)", () => {
    const seedSet = new Set(seedKeys);
    const ghosts = probes.filter((k) => !seedSet.has(k));
    expect(
      ghosts,
      `probes for subsystems that are not seeded: ${ghosts.join(", ")}`,
    ).toEqual([]);
  });

  it("seed ordinals are distinct and complete 1..N", () => {
    const ordinals = seeds.map((s) => s.ordinal).sort((a, b) => a - b);
    ordinals.forEach((o, idx) => {
      expect(o, `ordinal ${o} (position ${idx + 1}) is NaN or misplaced`).toBe(
        idx + 1,
      );
    });
  });
});

// ---------------------------------------------------------
// CONTRACT C — core registry modules ↔ disk
// ---------------------------------------------------------

describe("contract C: FRELUX_CORE_SYSTEMS modules exist on disk", () => {
  const registry = readFileSync(
    join(ROOT, "src/lib/archie/core-capabilities.ts"),
    "utf8",
  );
  const modules = [...registry.matchAll(/module:\s*"(@\/lib\/[^"]+)"/g)].map(
    (m) => m[1],
  );

  it("the scan found module bindings (scanner not broken)", () => {
    expect(modules.length).toBeGreaterThan(10);
  });

  it("every module specifier resolves to a real file", () => {
    const broken: string[] = [];
    for (const spec of modules) {
      const rel = spec.replace("@/", "src/").replace(/\?.*$/, "");
      const candidates = [
        join(ROOT, `${rel}.ts`),
        join(ROOT, `${rel}.tsx`),
        join(ROOT, rel, "index.ts"),
        join(ROOT, rel, "index.tsx"),
      ];
      if (!candidates.some((c) => existsSync(c))) broken.push(spec);
    }
    expect(
      broken,
      `core registry points at modules that do not exist: ${broken.join(", ")}`,
    ).toEqual([]);
  });
});
