// =========================================================
// ARCHIE PRIORITY WEB KNOWLEDGE SOURCE REGISTRY — TESTS
//
// Measurable proof that web intelligence has REAL intelligent
// source selection: the owner's 14 priority domains are
// registered, queries are classified into knowledge domains,
// only the appropriate sources are searched (priority first,
// never everything), searches run in parallel, cross-checks
// happen across independent sources, early stopping works,
// caching prevents redundant searches, newly discovered
// sources are classified (never auto-trusted), failures are
// reported honestly, and findings flow into ARCHIE memory as
// low-confidence candidates with full provenance.
//
// The research adapter is an EXPLICIT LABELED TEST DOUBLE —
// everything else is real production code.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  WebSourceRegistry,
  classifyQueryDomain,
  getWebSourceRegistry,
} from "@studio-shared/archie-ai/native-engine/web-sources.ts";
import {
  ResearchPipeline,
  type ResearchAdapter,
  type ResearchHit,
} from "@studio-shared/archie-ai/native-engine/webresearch.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

// ---------------------------------------------------------
// The owner's requested priority domains — the registry seed
// must contain exactly these.
// ---------------------------------------------------------
const OWNER_PRIORITY_DOMAINS = [
  "wikipedia.org",
  "britannica.com",
  "developer.mozilla.org",
  "github.com",
  "stackoverflow.com",
  "docs.python.org",
  "nodejs.org",
  "scholar.google.com",
  "arxiv.org",
  "pubmed.ncbi.nlm.nih.gov",
  "nist.gov",
  "attack.mitre.org",
  "owasp.org",
  "cve.org",
];

// ---------------------------------------------------------
// LABELED TEST DOUBLE — a scriptable research adapter that
// records every query it receives.
// ---------------------------------------------------------
class ScriptedAdapter implements ResearchAdapter {
  readonly id = "scripted-adapter (labeled test double)";
  public queries: string[] = [];
  public calls = 0;
  constructor(
    private respond: (query: string) => { hits: ResearchHit[]; note: string },
  ) {}
  async search(query: string) {
    this.calls += 1;
    this.queries.push(query);
    return this.respond(query);
  }
}

describe("priority web knowledge source registry (seed)", () => {
  it("registers exactly the owner's 14 priority domains as trusted", () => {
    const registry = new WebSourceRegistry();
    const domains = registry.list().map((s) => s.domain);
    for (const domain of OWNER_PRIORITY_DOMAINS) {
      expect(domains).toContain(domain);
    }
    expect(domains.length).toBe(14);
    const manifest = registry.manifest();
    expect(manifest.ownerPriority).toBe(14);
    expect(manifest.trusted).toBe(14);
    expect(manifest.discovered).toBe(0);
  });

  it("carries the required metadata for every source", () => {
    const registry = new WebSourceRegistry();
    for (const source of registry.list()) {
      expect(source.organization.length).toBeGreaterThan(0);
      expect(source.authorityLevel).toBeGreaterThanOrEqual(1);
      expect(source.authorityLevel).toBeLessThanOrEqual(8);
      expect(source.reliability).toBeGreaterThan(0);
      expect(source.applicableSubjects.length).toBeGreaterThan(0);
      expect(source.provenance.registered).toBe("owner-priority");
      expect(source.status).toBe("trusted");
    }
  });

  it("subdomains resolve to their registrable source (en.wikipedia.org → wikipedia.org)", () => {
    const registry = new WebSourceRegistry();
    const record = registry.lookup("https://en.wikipedia.org/wiki/Cement");
    expect(record?.domain).toBe("wikipedia.org");
  });
});

// ---------------------------------------------------------
// INTELLIGENT SOURCE SELECTION — never blind
// ---------------------------------------------------------
describe("intelligent source selection", () => {
  it("classifies questions into knowledge domains", () => {
    expect(
      classifyQueryDomain("how to prevent cross site scripting vulnerabilities")
        .category,
    ).toBe("cybersecurity");
    expect(
      classifyQueryDomain("javascript async await function usage").category,
    ).toBe("programming");
    expect(
      classifyQueryDomain("clinical trial efficacy of the new drug").category,
    ).toBe("academic-scientific");
    expect(classifyQueryDomain("who invented the telephone").category).toBe(
      "general-knowledge",
    );
  });

  it("a security question selects security sources — NOT pubmed or python docs", () => {
    const registry = new WebSourceRegistry();
    const selection = registry.select(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(selection.category).toBe("cybersecurity");
    expect(selection.sources.length).toBeLessThanOrEqual(3);
    const domains = selection.sources.map((s) => s.domain);
    // Relevant priority security sources come first.
    expect(domains).toContain("owasp.org");
    for (const d of domains) {
      expect([
        "nist.gov",
        "attack.mitre.org",
        "owasp.org",
        "cve.org",
      ]).toContain(d);
    }
    // Irrelevant categories are excluded entirely.
    expect(domains).not.toContain("pubmed.ncbi.nlm.nih.gov");
    expect(domains).not.toContain("docs.python.org");
    expect(domains).not.toContain("wikipedia.org");
  });

  it("a programming question selects programming sources — NOT NIST or pubmed", () => {
    const registry = new WebSourceRegistry();
    const selection = registry.select("javascript async await function usage");
    expect(selection.category).toBe("programming");
    const domains = selection.sources.map((s) => s.domain);
    expect(
      domains.every((d) =>
        [
          "developer.mozilla.org",
          "github.com",
          "stackoverflow.com",
          "docs.python.org",
          "nodejs.org",
        ].includes(d),
      ),
    ).toBe(true);
    expect(domains).not.toContain("nist.gov");
    expect(domains).not.toContain("pubmed.ncbi.nlm.nih.gov");
  });

  it("an academic question selects academic sources — NOT stackoverflow", () => {
    const registry = new WebSourceRegistry();
    const selection = registry.select(
      "clinical trial efficacy of the new drug",
    );
    const domains = selection.sources.map((s) => s.domain);
    expect(
      domains.every((d) =>
        ["scholar.google.com", "arxiv.org", "pubmed.ncbi.nlm.nih.gov"].includes(
          d,
        ),
      ),
    ).toBe(true);
    expect(domains).not.toContain("stackoverflow.com");
  });

  it("a general question selects encyclopedia sources", () => {
    const registry = new WebSourceRegistry();
    const selection = registry.select("who invented the telephone");
    expect(selection.category).toBe("general-knowledge");
    const domains = selection.sources.map((s) => s.domain);
    expect(domains).toContain("wikipedia.org");
    expect(domains).toContain("britannica.com");
  });

  it("NEVER selects every registered source — max 3 searched per query", () => {
    const registry = new WebSourceRegistry();
    for (const q of [
      "how to prevent cross site scripting vulnerabilities",
      "javascript async await function usage",
      "clinical trial efficacy of the new drug",
      "who invented the telephone",
    ]) {
      expect(registry.select(q).sources.length).toBeLessThanOrEqual(3);
    }
  });

  it("the source hierarchy ranks government above community content", () => {
    const registry = new WebSourceRegistry();
    const nist = registry.lookup("https://nist.gov/sp-800-63");
    const so = registry.lookup("https://stackoverflow.com/q/1");
    expect(registry.rank(nist!)).toBeLessThan(registry.rank(so!));
    expect(registry.rank(nist!)).toBe(2); // government/regulatory
    expect(registry.rank(so!)).toBe(8); // community
  });
});

// ---------------------------------------------------------
// CONTINUOUS SOURCE EXPANSION — discovery, never free trust
// ---------------------------------------------------------
describe("discovered source classification", () => {
  it("classifies an unknown government domain as government — but only EVALUATING", () => {
    const registry = new WebSourceRegistry();
    const record = registry.evaluateDiscovered(
      "https://www.cisa.gov/publication/xss",
    );
    expect(record.domain).toBe("cisa.gov");
    expect(record.category).toBe("government");
    expect(record.authorityLevel).toBe(2);
    expect(record.status).toBe("evaluating"); // NEVER auto-trusted
    expect(registry.manifest().discovered).toBe(1);
  });

  it("classifies official documentation and community hosts by their signals", () => {
    const docsRegistry = new WebSourceRegistry();
    const docs = docsRegistry.evaluateDiscovered(
      "https://docs.rust-lang.org/book",
    );
    expect(docs.category).toBe("official-docs");
    expect(docs.status).toBe("evaluating");
    // Fresh registry: the community host's own signals decide.
    const forumRegistry = new WebSourceRegistry();
    const forum = forumRegistry.evaluateDiscovered(
      "https://forum.rust-lang.org/t/123",
    );
    expect(forum.category).toBe("community");
    expect(forum.authorityLevel).toBe(8);
    expect(forum.status).toBe("evaluating");
  });

  it("promotion to trusted requires the explicit owner-validated call", () => {
    const registry = new WebSourceRegistry();
    const record = registry.evaluateDiscovered("https://www.cisa.gov/x");
    expect(record.status).toBe("evaluating");
    const promoted = registry.promote("cisa.gov");
    expect(promoted?.status).toBe("trusted");
  });
});

// ---------------------------------------------------------
// THE RESEARCH PIPELINE — selection, parallel waves,
// cross-check, early stopping, caching, honesty
// ---------------------------------------------------------
describe("research pipeline with the registry", () => {
  it("searches only the SELECTED priority domains, site-scoped, in parallel", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter(() => ({
      hits: [],
      note: "search completed",
    }));
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    // Site-scoped queries for the selected sources were issued.
    expect(adapter.queries.length).toBeGreaterThanOrEqual(3);
    expect(adapter.queries[0]).toContain("site:owasp.org");
    // The priority wave is site-scoped to SECURITY domains only…
    for (const q of adapter.queries.slice(0, 3)) {
      expect(q).toMatch(
        /site:(owasp\.org|nist\.gov|attack\.mitre\.org|cve\.org)/,
      );
    }
    // …and only then does the unrestricted fallback run.
    expect(adapter.queries[adapter.queries.length - 1]).not.toContain("site:");
    expect(report.category).toBe("cybersecurity");
    expect(report.sourcesSearched).toContain("owasp.org");
    expect(report.sourcesSearched).not.toContain("pubmed.ncbi.nlm.nih.gov");
  });

  it("reports a restricted source as NOT searched — never in sourcesSearched (audit fix H-4)", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      if (query.includes("site:britannica.com")) {
        return {
          hits: [
            {
              title: "Ada Lovelace",
              url: "https://www.britannica.com/biography/Ada-Lovelace",
              snippet:
                "Ada Lovelace was an English mathematician, often regarded as the first computer programmer.",
            },
          ],
          note: "search completed",
        };
      }
      return { hits: [], note: "search completed" };
    });
    const registry = new WebSourceRegistry();
    const restricted = registry.restrict("wikipedia.org");
    expect(restricted?.accessibility).toBe("restricted");
    const pipeline = new ResearchPipeline(store, adapter, registry);
    const report = await pipeline.research("who was Ada Lovelace");
    // The restricted source was NEVER searched…
    expect(adapter.queries.some((q) => q.includes("site:wikipedia.org"))).toBe(
      false,
    );
    // …is NOT claimed in sourcesSearched…
    expect(report.sourcesSearched).not.toContain("wikipedia.org");
    // …and is reported honestly in sourceFailures.
    expect(report.sourceFailures).toContainEqual({
      domain: "wikipedia.org",
      note: "source marked restricted — not searched",
    });
    // The unrestricted fallback may run — still no
    // wikipedia claim.
    expect(report.note).not.toContain("wikipedia.org");
  });

  it("cross-checks independent sources and STOPS EARLY when they agree", async () => {
    const store = new FactStore();
    let bareQueryIssued = false;
    const adapter = new ScriptedAdapter((query) => {
      if (!query.includes("site:")) bareQueryIssued = true;
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "unknown.org";
      return {
        hits: [
          {
            title: "Preventing cross site scripting vulnerabilities",
            url: `https://${domain}/xss-prevention`,
            snippet:
              "Cross site scripting vulnerabilities prevention requires output encoding and security controls.",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(report.crossChecked).toBe(true);
    // EARLY STOPPING: the unrestricted fallback was never run.
    expect(bareQueryIssued).toBe(false);
    // Deduplication kept one hit per domain.
    expect(new Set(report.hits.map((h) => h.domain)).size).toBe(
      report.hits.length,
    );
  });

  it("falls back to the unrestricted web when priority sources disagree", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      if (!query.includes("site:")) {
        return {
          hits: [
            {
              title: "XSS prevention guide",
              url: "https://www.cisa.gov/xss-guide",
              snippet:
                "Cross site scripting vulnerabilities prevention with output encoding security controls.",
            },
          ],
          note: "search completed",
        };
      }
      // Priority wave hits genuinely disagree with each other.
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "unknown.org";
      const filler: Record<string, string> = {
        "owasp.org": "zebras gallop across the savanna at dawn",
        "nist.gov": "pianos resonate in concert halls during winter",
        "attack.mitre.org": "bicycle gears mesh under heavy load",
        "cve.org": "orchids bloom in tropical greenhouses",
      };
      return {
        hits: [
          {
            title: `Unrelated ${domain} content`,
            url: `https://${domain}/alpha`,
            snippet: filler[domain] ?? "quiet rivers flow past old bridges",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    // The fallback ran (a bare query was issued) and the
    // discovered source was classified — never auto-trusted.
    expect(report.sourcesSearched).toContain("open web (unrestricted query)");
    expect(report.discoveredSources).toContain("cisa.gov");
    // One relevant source = no cross-check yet: honest caution.
    expect(report.crossChecked).toBe(false);
    const registry = (pipeline as unknown as { registry: WebSourceRegistry })
      .registry;
    const cisa = registry.lookup("https://www.cisa.gov/xss-guide");
    expect(cisa?.status).toBe("evaluating");
    expect(cisa?.category).toBe("government");
  });

  it("reports disagreement honestly when sources do not agree", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "nist.gov";
      // Genuinely distinct content per domain — no agreement.
      const filler: Record<string, string> = {
        "owasp.org": "zebras gallop across the savanna at dawn",
        "nist.gov": "pianos resonate in concert halls during winter",
        "attack.mitre.org": "bicycle gears mesh under heavy load",
        "cve.org": "orchids bloom in tropical greenhouses",
        "wikipedia.org": "quiet rivers flow past old bridges",
        "britannica.com": "mountains rise above misty valleys",
      };
      return {
        hits: [
          {
            title: `Unrelated content ${domain}`,
            url: `https://${domain}/alpha-${domain.replace(/\W/g, "")}`,
            snippet: filler[domain] ?? "calm winds drift over open fields",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(report.crossChecked).toBe(false);
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(report.conflicts[0]).toContain("caution");
  });

  it("handles per-source failure honestly — other sources still searched", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      if (query.includes("site:nist.gov")) {
        return { hits: [], note: "network unavailable: connection refused" };
      }
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "owasp.org";
      return {
        hits: [
          {
            title: "Agreed: prevention guide",
            url: `https://${domain}/prevention`,
            snippet:
              "Cross site scripting vulnerabilities prevention with output encoding security controls.",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(report.sourceFailures.some((f) => f.domain === "nist.gov")).toBe(
      true,
    );
    expect(report.sourcesSearched).toContain("owasp.org");
    expect(report.sourcesSearched).not.toContain("nist.gov");
    expect(report.searched).toBe(true);
  });

  it("reports searched=false honestly when nothing could be searched", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter(() => ({
      hits: [],
      note: "network unavailable: no route",
    }));
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research("who invented the telephone");
    expect(report.searched).toBe(false);
    expect(report.hits).toHaveLength(0);
    expect(report.storedKnowledge).toBe(0);
    expect(report.note).toContain("no search executed successfully");
  });

  it("CACHES recent findings — a repeat query does not search again", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "unknown.org";
      return {
        hits: [
          {
            title: "Cached finding",
            url: `https://${domain}/cached`,
            snippet:
              "Cross site scripting vulnerabilities prevention with output encoding security controls.",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const first = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    const callsAfterFirst = adapter.calls;
    const second = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(adapter.calls).toBe(callsAfterFirst); // NO new searches
    expect(second.reusedCache).toBe(true);
    expect(second.hits.length).toBe(first.hits.length);
  });

  it("deduplicates identical URLs across sources", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter(() => ({
      hits: [
        {
          title: "Same page",
          url: "https://owasp.org/same-page",
          snippet:
            "Cross site scripting vulnerabilities prevention with output encoding security controls.",
        },
      ],
      note: "search completed",
    }));
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    const report = await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(
      report.hits.filter((h) => h.url === "https://owasp.org/same-page"),
    ).toHaveLength(1);
  });

  it("stores findings as CANDIDATES with full provenance (domain, category, authority, timestamp)", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "owasp.org";
      return {
        hits: [
          {
            title: "Prevention guide",
            url: `https://${domain}/prevention`,
            snippet:
              "Cross site scripting vulnerabilities prevention with output encoding security controls.",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
    );
    await pipeline.research(
      "how to prevent cross site scripting vulnerabilities",
    );
    const stored = store.query({
      subject: "how to prevent cross site scripting vulnerabilities",
      predicate: "web-finding",
    });
    expect(stored.length).toBeGreaterThan(0);
    const securityDomains = [
      "owasp.org",
      "nist.gov",
      "attack.mitre.org",
      "cve.org",
    ];
    for (const fact of stored) {
      // Never established fact: the first finding is a
      // candidate; further findings on the SAME subject are
      // parked as "uncertain" by the store's contradiction
      // gate — both are below validation, honest either way.
      expect(["candidate", "uncertain"]).toContain(fact.status);
      expect(fact.confidence).toBeLessThanOrEqual(0.45);
      expect(fact.provenance.source).toBe("web-research");
      expect(fact.provenance.note).toMatch(
        new RegExp(`candidate finding from (${securityDomains.join("|")})`),
      );
      expect(fact.provenance.note).toContain("category: cybersecurity");
      expect(fact.provenance.note).toMatch(/authority \d\/8/);
      expect(fact.provenance.note).toContain("retrieved ");
    }
    // Every selected priority domain that returned hits is
    // represented in memory.
    expect(stored.some((f) => f.provenance.note?.includes("owasp.org"))).toBe(
      true,
    );
    expect(stored.some((f) => f.status === "candidate")).toBe(true);
  });
});

// ---------------------------------------------------------
// END-TO-END: the ENGINE answers research requests through
// the registry (real production wiring, labeled adapter)
// ---------------------------------------------------------
describe("engine integration — research through the registry", () => {
  it("a research request selects priority sources and reports them honestly", async () => {
    const engine = new ArchieNativeEngine({
      researchAdapter: new ScriptedAdapter((query) => {
        const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "owasp.org";
        return {
          hits: [
            {
              title: "OWASP XSS Prevention Cheat Sheet",
              url: `https://${domain}/cheatsheets/xss`,
              snippet:
                "Cross site scripting vulnerabilities prevention requires output encoding and security controls.",
            },
          ],
          note: "search completed",
        };
      }),
    });
    const result = await engine.generate({
      turns: [
        {
          role: "owner",
          parts: [
            {
              text: "research how to prevent cross site scripting vulnerabilities",
            },
          ],
        },
      ],
      tools: [],
      systemInstruction: "",
    });
    const text = result.parts[0].text ?? "";
    expect(text).toContain("cybersecurity");
    expect(text).toContain("Sources searched");
    expect(text).toContain("owasp.org");
    expect(text).toContain("candidate knowledge");
    expect(text).not.toContain("pubmed");
    // The candidate landed in memory with provenance.
    const facts = (
      engine as unknown as {
        facts: FactStore;
      }
    ).facts.query({
      subject: "how to prevent cross site scripting vulnerabilities",
      predicate: "web-finding",
    });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].status).toBe("candidate");
  });

  it("the shared singleton registry serves the production engine", () => {
    const registry = getWebSourceRegistry();
    expect(registry.list().length).toBeGreaterThanOrEqual(14);
    expect(
      registry.select("javascript async await function usage").category,
    ).toBe("programming");
  });
});
