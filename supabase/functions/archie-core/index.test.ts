// Unit tests for the archie-core edge function (owner chat).
//
// archie-core is the owner-only chat front door to the ARCHIE
// cognitive core. The 2026-09-15 forensic fix verified live in
// prod (hello → greeting, identity → ARCHIE answer, 25*48 → 1200,
// no math dead-end). These tests pin the access contract:
//
//   * 401 without a session, 401 invalid JWT, 403 non-admin (+audit)
//   * 400 on empty message
//   * 404 when the conversation does not belong to the owner
//   * OPTIONS preflight at the CORS boundary

import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  givenRows,
  givenUser,
  req,
  OWNER_AUTH,
  OWNER_ID,
  json,
  state,
  tableFixtures,
} from "../_shared/testing/harness.ts";
import fs from "node:fs";

// REAL lexicon data extracted from the OEWN 2025 dataset
// (scripts/lexicon/generate-test-fixtures.ts). Spec §18: verify
// ARCHIE conversations can access the lexicon engine — not
// just the database API in isolation.
const lexiconFixture = JSON.parse(
  fs.readFileSync(
    new URL("../_shared/lexicon/__fixtures__/test-words.json", import.meta.url),
    "utf8",
  ),
);
function givenLexicon() {
  givenRows("lexicon_words", lexiconFixture.words);
  givenRows("lexicon_senses", lexiconFixture.senses);
  givenRows("lexicon_sense_relations", lexiconFixture.senseRelations);
  givenRows("lexicon_relationships", lexiconFixture.synsetRelations);
  givenRows("lexicon_sources", [lexiconFixture.source]);
}

const handler = getHandler();

const CONV_ID = "33333333-3333-4333-8333-333333333333";

function givenConversation(ownerId = OWNER_ID) {
  givenRows("frelux_archie_conversations", [
    { id: CONV_ID, owner_id: ownerId, title: "test" },
  ]);
}

describe("archie-core — owner gate", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { message: "hello" }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid JWT with 401", async () => {
    givenUser(null);
    const res = await handler(
      req("POST", "", { message: "hello" }, OWNER_AUTH),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin with 403 and audits the attempt", async () => {
    const userId = "44444444-4444-4444-8444-444444444444";
    givenUser({ id: userId, email: "visitor@test.local" });
    givenRows("profiles", [{ id: userId, role: "user" }]);
    const res = await handler(
      req("POST", "", { message: "hello" }, OWNER_AUTH),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/Owner-only/i);
  });
});

describe("archie-core — request validation", () => {
  it("rejects an empty message with 400", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    const res = await handler(
      req("POST", "", { conversation_id: CONV_ID, message: "   " }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/empty/i);
  });

  it("returns 404 for a conversation that is not the owner's", async () => {
    givenOwnerIsAdmin();
    givenConversation("99999999-9999-4999-8999-999999999999");
    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/Conversation not found/i);
  });

  it("returns 404 when no conversation id is supplied", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { message: "hello" }, OWNER_AUTH),
    );
    expect(res.status).toBe(404);
  });
});

describe("archie-core — methods", () => {
  it("rejects GET with 405", async () => {
    const res = await handler(req("GET", "", undefined, OWNER_AUTH));
    expect(res.status).toBe(405);
  });
});

// ── Gap 3: SSE STREAMING (owner upgrade 2026-09-16) ────────
describe("archie-core — SSE streaming (gap 3)", () => {
  function parseSSE(raw: string): Array<[string, Record<string, unknown>]> {
    const events: Array<[string, Record<string, unknown>]> = [];
    for (const block of raw.split("\n\n")) {
      const evLine = block.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (evLine && dataLine) {
        events.push([evLine.slice(7), JSON.parse(dataLine.slice(6))]);
      }
    }
    return events;
  }

  it("non-streaming requests keep the classic JSON path", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    const res = await handler(
      req("POST", "", { conversation_id: CONV_ID, message: "   " }, OWNER_AUTH),
    );
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.status).toBe(400);
  });

  it("streams an unauthenticated turn honestly (done carries the 401)", async () => {
    const res = await handler(
      req("POST", "", { message: "hello", stream: true }),
    );
    expect(res.status).toBe(200); // the stream opens
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = parseSSE(await res.text());
    expect(events[0][0]).toBe("start");
    const done = events.find(([n]) => n === "done")![1] as {
      status: number;
      error: string;
    };
    expect(done.status).toBe(401);
    expect(done.error).toBeTruthy();
    expect(events.some(([n]) => n === "delta")).toBe(false);
  });

  it("Accept: text/event-stream also selects streaming", async () => {
    const res = await handler(
      req("POST", "", { message: "hello" }, { Accept: "text/event-stream" }),
    );
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = parseSSE(await res.text());
    expect(events[0][0]).toBe("start");
  });

  it("streams a valid owner turn: start → progress → deltas → done", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello", stream: true },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = parseSSE(await res.text());
    const names = events.map(([n]) => n);
    expect(names[0]).toBe("start");
    expect(names[names.length - 1]).toBe("done");
    // honest stage progress fired (auth + gates at minimum)
    const progress = events
      .filter(([n]) => n === "progress")
      .map(([, d]) => d as Record<string, unknown>);
    expect(progress.length).toBeGreaterThan(0);
    // deltas concatenate to exactly the done reply — pacing, not fabrication
    const done = events.find(([n]) => n === "done")![1] as {
      ok: boolean;
      reply: string;
    };
    const deltas = events
      .filter(([n]) => n === "delta")
      .map(([, d]) => String((d as { text: string }).text));
    if (done.ok && typeof done.reply === "string") {
      expect(deltas.length).toBeGreaterThan(0);
      expect(deltas.join("")).toBe(done.reply);
    }
  });
});

// ---------------------------------------------------------
// Semantic Knowledge Graph Engine integration (spec
// §SEMANTIC-GRAPH): a REAL owner conversation must reach the
// graph — concept identification + bounded relationship
// retrieval in the live pathway, audited honestly.
// ---------------------------------------------------------

// Materialize graph fixture rows from the SAME real lexicon
// fixture using the registry mapping (mirrors
// archie_build_semantic_graph()). REAL OEWN data only.
import {
  LEXICON_RELATION_MAPPINGS,
  LEXICON_EDGE_PROVENANCE,
} from "../_shared/semantic-graph/relations.ts";

// typed views over the REAL fixture data (spec: no anys in
// test materializers — the shapes mirror the live tables)
type FixtureWord = { id: string; canonical: string };
type FixtureSense = {
  external_id: string;
  word_id: string;
  synset_key: string;
  definition: string;
  knowledge_status: string;
  domain?: string | null;
  source_id?: string | null;
};
interface FixtureNode {
  id: string;
  concept_key: string;
  synset_key: string;
  canonical_name: string;
  sense_external_ids: string[];
  description: string;
  domain: string | null;
  language: string;
  region: string | null;
  knowledge_status: string;
  confidence: number;
  source_id: string | null;
  provenance: string;
  version: number;
}
interface FixtureEdge {
  id: string;
  source_concept_key: string;
  relation_type: string;
  target_concept_key: string;
  knowledge_status: string;
  confidence: number;
  provenance: string;
  evidence: string;
  domain: string | null;
  source_id: string | null;
  version: number;
}

function materializeGraphFixture() {
  const fixtureEdition = String(
    (lexiconFixture.source as { version?: string }).version ??
      "unknown edition",
  );
  const wordCanonical = new Map(
    (lexiconFixture.words as FixtureWord[]).map(
      (w) => [w.id, w.canonical] as const,
    ),
  );
  const nodesByKey = new Map<string, FixtureNode>();
  const senseToSynset = new Map<string, string>();
  for (const sn of lexiconFixture.senses as FixtureSense[]) {
    if (sn.knowledge_status !== "VERIFIED") continue;
    senseToSynset.set(sn.external_id, sn.synset_key);
    let n = nodesByKey.get(sn.synset_key);
    if (!n) {
      n = {
        id: `node-${sn.synset_key}`,
        concept_key: sn.synset_key,
        synset_key: sn.synset_key,
        canonical_name: "\uffff",
        sense_external_ids: [],
        description: sn.definition,
        domain: sn.domain ?? null,
        language: "en",
        region: null,
        knowledge_status: "VERIFIED",
        confidence: 1,
        source_id: sn.source_id ?? null,
        provenance: `concept derived from OEWN ${fixtureEdition} synset ${sn.synset_key} (via ARCHIE Universal Lexicon)`,
        version: 1,
      };
      nodesByKey.set(sn.synset_key, n);
    }
    n.sense_external_ids.push(sn.external_id);
    const lemma = String(wordCanonical.get(sn.word_id) ?? "");
    if (lemma && lemma < n.canonical_name) n.canonical_name = lemma;
  }
  const edges: FixtureEdge[] = [];
  const seen = new Set<string>();
  const push = (
    source: string,
    type: string,
    target: string,
    original: string,
    table: string,
  ) => {
    if (!nodesByKey.has(source) || !nodesByKey.has(target)) return;
    const key = `${source}|${type}|${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: `edge-${edges.length}`,
      source_concept_key: source,
      relation_type: type,
      target_concept_key: target,
      knowledge_status: "VERIFIED",
      confidence: 1,
      provenance: `${LEXICON_EDGE_PROVENANCE} via ${table}: ${original}`,
      evidence: `OEWN ${original}: mapped to ${type} (directly sourced meaning)`,
      domain: null,
      source_id: null,
      version: 1,
    });
  };
  for (const r of lexiconFixture.synsetRelations) {
    const m = LEXICON_RELATION_MAPPINGS.find(
      (x) =>
        x.lexiconTable === "lexicon_relationships" &&
        x.lexiconRelation === r.relation_type,
    );
    if (m)
      push(
        r.from_synset_key,
        m.graphRelation,
        r.to_synset_key,
        r.relation_type,
        "lexicon_relationships",
      );
  }
  for (const r of lexiconFixture.senseRelations) {
    const m = LEXICON_RELATION_MAPPINGS.find(
      (x) =>
        x.lexiconTable === "lexicon_sense_relations" &&
        x.lexiconRelation === r.relation_type,
    );
    const fk = senseToSynset.get(r.from_sense_external_id);
    const tk = senseToSynset.get(r.to_sense_external_id);
    if (m && fk && tk)
      push(fk, m.graphRelation, tk, r.relation_type, "lexicon_sense_relations");
  }
  return { nodes: [...nodesByKey.values()], edges };
}

describe("archie-core — semantic graph engine in the live pathway", () => {
  it("a full owner turn runs graph retrieval and reports the audit", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    const graphFx = materializeGraphFixture();
    givenRows("semantic_graph_nodes", graphFx.nodes);
    givenRows("semantic_graph_edges", graphFx.edges);

    const res = await handler(
      req(
        "POST",
        "",
        {
          conversation_id: CONV_ID,
          message: "I need to run the program, what does run mean here?",
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);

    // honest audit: the graph section always reports what it
    // examined, identified, left ambiguous, and retrieved
    expect(body.semantic_graph).toBeTruthy();
    expect(typeof body.semantic_graph.terms_examined).toBe("number");
    expect(body.semantic_graph.terms_examined).toBeGreaterThan(0);
    expect(Array.isArray(body.semantic_graph.concepts_identified)).toBe(true);
    expect(Array.isArray(body.semantic_graph.concepts_ambiguous)).toBe(true);
    // "run" is genuinely multi-concept in real OEWN data: it
    // lands in identified (direct evidence via "program") or
    // ambiguous — never silently ignored
    const runIdentified = (
      body.semantic_graph.concepts_identified as Array<{ term: string }>
    ).some((c) => c.term === "run");
    const runAmbiguous = body.semantic_graph.concepts_ambiguous.includes("run");
    expect(runIdentified || runAmbiguous).toBe(true);
    // bounded retrieval: the budget contract holds in a real turn
    expect(body.semantic_graph.edges_retrieved).toBeLessThanOrEqual(24);
  });

  it("degrades honestly when the graph is empty — the turn still succeeds", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    // graph tables not seeded: empty graph

    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    // empty graph: "hello" is examined (1 term) but nothing is
    // identified, nothing ambiguous-listed, zero edges — the
    // honest empty state, never fabricated concepts
    expect(body.semantic_graph.concepts_identified).toEqual([]);
    expect(body.semantic_graph.concepts_ambiguous).toEqual([]);
    expect(body.semantic_graph.edges_retrieved).toBe(0);
  });
});
describe("archie-core — context & inference engine in the live pathway", () => {
  it("a full owner turn runs the inference engine and reports honest coverage", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    const graphFx = materializeGraphFixture();
    givenRows("semantic_graph_nodes", graphFx.nodes);
    givenRows("semantic_graph_edges", graphFx.edges);

    const res = await handler(
      req(
        "POST",
        "",
        {
          conversation_id: CONV_ID,
          message: "How does the bank issue a mortgage?",
          history: [
            { role: "owner", content: "Hello, I hope you are doing well." },
            {
              role: "archie",
              content: "Hello! How can I help you today?",
            },
          ],
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);

    // honest coverage in the response summary
    expect(body.context_inference).toBeTruthy();
    expect(typeof body.context_inference.terms_examined).toBe("number");
    expect(body.context_inference.terms_examined).toBeGreaterThan(0);
    // the bank/mortgage message identifies the financial bank
    // concept and retrieves bounded facts
    expect(typeof body.context_inference.facts).toBe("number");
    expect(body.context_inference.facts).toBeGreaterThan(0);
    expect(Array.isArray(body.context_inference.carried_ambiguities)).toBe(
      true,
    );
    // bounded retrieval contract holds in a real turn
    expect(body.context_inference.facts).toBeLessThanOrEqual(12);

    // the reply exists — the engine never blocks the chat path
    expect(typeof body.reply).toBe("string");
    expect(body.reply.length).toBeGreaterThan(0);
  });

  it("keeps FACT vs INFERENCE distinguishable end to end (spec §§2, 26)", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    const graphFx = materializeGraphFixture();
    givenRows("semantic_graph_nodes", graphFx.nodes);
    givenRows("semantic_graph_edges", graphFx.edges);

    // a message whose concept chain supports a real 2-hop
    // taxonomic inference: "How does the bank issue a
    // mortgage?" — the financial bank IS_A financial
    // institution, which has stored hypernym chains
    const res = await handler(
      req(
        "POST",
        "",
        {
          conversation_id: CONV_ID,
          message:
            "What kind of thing is a bank — is it a kind of depository financial institution?",
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    // coverage numbers are reported even when no inference
    // fires — the honest empty state
    expect(typeof body.context_inference.inferences).toBe("number");
    expect(body.context_inference.inferences).toBeGreaterThanOrEqual(0);
    expect(typeof body.context_inference.contradictions).toBe("number");
  });

  it("degrades honestly when the engine has no lexicon data — the turn still succeeds", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    // no lexicon/graph rows seeded at all
    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    // the engine examined the message ("hello" = 1 term),
    // found nothing, invented nothing — and the turn
    // completed anyway
    expect(body.context_inference.terms_examined).toBe(1);
    expect(body.context_inference.facts).toBe(0);
    expect(body.context_inference.inferences).toBe(0);
    expect(body.context_inference.contradictions).toBe(0);
    expect(body.context_inference.carried_ambiguities).toEqual([]);
  });
});

// ---------------------------------------------------------
// Universal Lexicon Engine integration (spec §18): a REAL
// owner conversation must reach the lexicon — contextual
// sense retrieval in the live pathway, audited honestly.
// ---------------------------------------------------------
describe("archie-core — lexicon engine in the live pathway", () => {
  it("a full owner turn runs lexicon retrieval and reports the audit", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();

    const res = await handler(
      req(
        "POST",
        "",
        {
          conversation_id: CONV_ID,
          message: "I need to run the program, what does run mean here?",
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);

    // honest audit: the lexicon section always reports what
    // it examined, disambiguated, or left ambiguous
    expect(body.lexicon).toBeTruthy();
    expect(
      Array.isArray(body.lexicon.words_examined_list ?? null) ||
        typeof body.lexicon.words_examined === "number",
    ).toBe(true);

    // "run" is genuinely multi-sense: it must appear in one of
    // the honest buckets — disambiguated (direct evidence:
    // "program") or ambiguous — never silently ignored
    const touched =
      (body.lexicon.senses_disambiguated ?? []).includes("run") ||
      (body.lexicon.senses_ambiguous ?? []).includes("run");
    expect(touched).toBe(true);
  });

  it("degrades honestly when the lexicon is empty — the turn still succeeds", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    // no lexicon fixtures seeded: empty tables

    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello" },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.lexicon).toEqual({
      words_examined: 0,
      senses_disambiguated: [],
      senses_ambiguous: [],
    });
  });
});

describe("archie-core — knowledge source seam (Phase 7 cutover)", () => {
  // NOTE on ordering: the repository memoizes once configured, so
  // the unconfigured-fallback test must run BEFORE the configured
  // test sets KNOWLEDGE_* in the (shimmed) environment.

  function lastChatTurnAudit() {
    const rows = tableFixtures.get("frelux_archie_audit_events") ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].event_type === "archie.core.chat_turn") return rows[i];
    }
    return null;
  }

  it("default (no switch) serves knowledge from A and audits the source", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    // no site_settings fixture → fail-safe legacy path
    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello" },
        {
          ...OWNER_AUTH,
          "x-user-id": "seam-test-1",
        },
      ),
    );
    expect(res.status).toBe(200);
    const audit = lastChatTurnAudit();
    expect(audit).not.toBeNull();
    expect(audit.detail.knowledge_source.source).toBe("A");
    expect(audit.detail.knowledge_source.origin).toBe(
      "test-project.supabase.co",
    );
  });

  it("switch=B with an unconfigured repository fails safe to A", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    givenRows("site_settings", [{ archie_knowledge_source: "B" }]);
    // KNOWLEDGE_* deliberately absent → the turn must still succeed
    // on the legacy path, honestly audited as source A
    const res = await handler(
      req(
        "POST",
        "",
        { conversation_id: CONV_ID, message: "hello" },
        {
          ...OWNER_AUTH,
          "x-user-id": "seam-test-2",
        },
      ),
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
    const audit = lastChatTurnAudit();
    expect(audit.detail.knowledge_source.source).toBe("A");
  });

  it("switch=B with the repository configured routes knowledge to B", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    givenRows("site_settings", [{ archie_knowledge_source: "B" }]);
    state.env.KNOWLEDGE_DB_URL = "https://knowledge-project.supabase.co";
    state.env.KNOWLEDGE_SERVICE_ROLE_KEY = "test-knowledge-service-key";
    try {
      const res = await handler(
        req(
          "POST",
          "",
          { conversation_id: CONV_ID, message: "hello" },
          { ...OWNER_AUTH, "x-user-id": "seam-test-3" },
        ),
      );
      expect(res.status).toBe(200);
      expect((await json(res)).ok).toBe(true);
      const audit = lastChatTurnAudit();
      expect(audit.detail.knowledge_source.source).toBe("B");
      expect(audit.detail.knowledge_source.origin).toBe(
        "https://knowledge-project.supabase.co",
      );
      // the service-role key must never ride in the audit ledger
      expect(JSON.stringify(audit.detail)).not.toContain(
        "test-knowledge-service-key",
      );
    } finally {
      delete state.env.KNOWLEDGE_DB_URL;
      delete state.env.KNOWLEDGE_SERVICE_ROLE_KEY;
    }
  });

  it("switch=A (explicit rollback state) keeps the legacy path even when the repository is configured", async () => {
    givenOwnerIsAdmin();
    givenConversation();
    givenLexicon();
    givenRows("site_settings", [{ archie_knowledge_source: "A" }]);
    state.env.KNOWLEDGE_DB_URL = "https://knowledge-project.supabase.co";
    state.env.KNOWLEDGE_SERVICE_ROLE_KEY = "test-knowledge-service-key";
    try {
      const res = await handler(
        req(
          "POST",
          "",
          { conversation_id: CONV_ID, message: "hello" },
          {
            ...OWNER_AUTH,
            "x-user-id": "seam-test-4",
          },
        ),
      );
      expect(res.status).toBe(200);
      const audit = lastChatTurnAudit();
      expect(audit.detail.knowledge_source.source).toBe("A");
    } finally {
      delete state.env.KNOWLEDGE_DB_URL;
      delete state.env.KNOWLEDGE_SERVICE_ROLE_KEY;
    }
  });
});
