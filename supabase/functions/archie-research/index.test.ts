// Unit tests for archie-research (web-research panel API).
// Mirrors archie-engines/index.test.ts — REAL handler under
// the vitest Deno shim; only the network is faked.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  givenRows,
  givenUser,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

const FACT_ROW = {
  id: "fact_1",
  subject: "zustand persist middleware",
  predicate: "web-finding",
  object: {
    title: "Persist middleware docs",
    snippet: "Rehydrate state from storage",
    url: "https://example.com/docs",
  },
  confidence: 0.6,
  provenance: {
    source: "web-research",
    note: "candidate finding from example.com — pending validation",
  },
  status: "candidate",
  verified_by: [],
  updated_at: "2026-09-16T00:00:00Z",
};

describe("archie-research — owner gate", () => {
  it("rejects missing authorization with 401", async () => {
    const res = await handler(req("GET", "", undefined));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid session with 401", async () => {
    givenUser(null);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin with 403", async () => {
    const userId = "55555555-5555-4555-8555-555555555555";
    givenUser({ id: userId });
    givenRows("profiles", [{ id: userId, role: "user" }]);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(403);
  });
});

describe("archie-research — GET", () => {
  it("returns real findings with provenance and honest counts", async () => {
    givenOwnerIsAdmin();
    givenRows("frelux_archie_native_facts", [
      FACT_ROW,
      { ...FACT_ROW, id: "fact_2", status: "validated" },
      // A non-research fact must NEVER appear: predicate filter.
      { ...FACT_ROW, id: "fact_3", predicate: "means" },
    ]);
    givenRows("frelux_vocabulary", [
      {
        term: "obstreperous",
        source: "research",
        meaning: "noisy, unruly",
        provenance: "researched from dictionary sites",
        confidence: 0.6,
        times_seen: 3,
        updated_at: "2026-09-16T00:00:00Z",
      },
    ]);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.findings).toHaveLength(2);
    expect(body.findings[0].query).toBe("zustand persist middleware");
    expect(body.findings[0].url).toBe("https://example.com/docs");
    expect(body.findings[0].provenanceNote).toMatch(
      /pending validation/,
    );
    expect(body.counts.candidate).toBe(1);
    expect(body.counts.validated).toBe(1);
    expect(body.counts.total).toBe(2);
    expect(body.vocabulary).toHaveLength(1);
    expect(body.vocabulary[0].term).toBe("obstreperous");
  });

  it("reports an empty register honestly (no fabricated rows)", async () => {
    givenOwnerIsAdmin();
    givenRows("frelux_archie_native_facts", []);
    givenRows("frelux_vocabulary", []);
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.findings).toHaveLength(0);
    expect(body.counts.total).toBe(0);
  });
});

describe("archie-research — POST validation", () => {
  it("rejects invalid JSON with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      new Request("https://test-project.supabase.co/functions/v1/fn", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...OWNER_AUTH },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unknown action with 400", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        { fact_id: "fact_1", action: "delete" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/validate.*reject|action/i);
  });

  it("refuses facts outside the research register with 404", async () => {
    givenOwnerIsAdmin();
    // Only a NON-research fact exists — the predicate filter
    // must keep owner-taught/seed knowledge untouchable.
    givenRows("frelux_archie_native_facts", [
      { ...FACT_ROW, id: "taught_1", predicate: "means" },
    ]);
    const res = await handler(
      req("POST", "", { fact_id: "taught_1", action: "validate" }, OWNER_AUTH),
    );
    expect(res.status).toBe(404);
  });

  it("validates a research fact with an owner-confirm ledger stamp", async () => {
    givenOwnerIsAdmin();
    givenRows("frelux_archie_native_facts", [FACT_ROW]);
    const res = await handler(
      req("POST", "", { fact_id: "fact_1", action: "validate" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("validated");
  });

  it("rejects (parks as uncertain) a research fact", async () => {
    givenOwnerIsAdmin();
    givenRows("frelux_archie_native_facts", [FACT_ROW]);
    const res = await handler(
      req("POST", "", { fact_id: "fact_1", action: "reject" }, OWNER_AUTH),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("uncertain");
  });
});

describe("archie-research — method boundary", () => {
  it("refuses non-GET/POST methods with 405", async () => {
    givenOwnerIsAdmin();
    const res = await handler(req("DELETE", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(405);
  });
});
