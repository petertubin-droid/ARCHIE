// =========================================================
// ARCHIE NATIVE ENGINE — PRIORITY WEB KNOWLEDGE SOURCE
// REGISTRY
//
// The real source-selection brain of ARCHIE Web Intelligence.
// ARCHIE must NOT blindly search every registered website for
// every question: this registry classifies the query's
// knowledge domain, selects the most appropriate priority
// sources, ranks them by relevance and authority, classifies
// NEW sources discovered during research (never auto-trusted),
// and encodes the source hierarchy for disagreement
// resolution.
//
// OWNER PRIORITY DOMAINS (registered 2026-09-10):
//   general    — wikipedia.org, britannica.com
//   programming— developer.mozilla.org, github.com,
//                stackoverflow.com, docs.python.org, nodejs.org
//   academic   — scholar.google.com, arxiv.org,
//                pubmed.ncbi.nlm.nih.gov
//   security   — nist.gov, attack.mitre.org, owasp.org, cve.org
//
// Beyond the seeds, authoritative sources discovered during
// research — official documentation, government agencies,
// standards organizations, universities, research
// institutions, manufacturers, reputable professional
// organizations — are classified by deterministic rules and
// held at "evaluating" status until evaluated. The registry is
// a live module, not a documentation list.
// =========================================================

export type SourceCategory =
  | "general-knowledge"
  | "programming"
  | "academic-scientific"
  | "cybersecurity"
  | "official-docs"
  | "government"
  | "standards"
  | "university-research"
  | "manufacturer"
  | "professional-institution"
  | "reputable-secondary"
  | "community";

export type SourceStatus = "trusted" | "evaluating" | "rejected";

/** Authority levels follow the OWNER-SPECIFIED hierarchy:
 *  1 primary-official · 2 government/regulatory · 3 official
 *  technical documentation · 4 standards organization ·
 *  5 peer-reviewed/research · 6 established professional
 *  institution · 7 reputable secondary · 8 community
 *  discussion / user-generated. */
export interface SourceRecord {
  domain: string;
  organization: string;
  category: SourceCategory;
  /** 1 (primary official) … 8 (community content). */
  authorityLevel: number;
  /** 0–1 observed reliability. */
  reliability: number;
  /** Lowercased subject keywords this source is applicable to. */
  applicableSubjects: string[];
  accessibility: "open" | "partial" | "restricted";
  lastChecked: string | null;
  status: SourceStatus;
  /** Where this record came from — always auditable. */
  provenance: {
    registered: "owner-priority" | "discovered";
    note: string;
    registeredAt: string;
  };
  /** Confidence in the source itself. */
  confidence: number;
}

interface SeedDef {
  domain: string;
  organization: string;
  category: SourceCategory;
  authorityLevel: number;
  reliability: number;
  subjects: string[];
}

// ---------------------------------------------------------
// OWNER-PRIORITY SEED — the requested high-trust domains
// ---------------------------------------------------------
const OWNER_PRIORITY_SEEDS: SeedDef[] = [
  // General knowledge
  {
    domain: "wikipedia.org",
    organization: "Wikimedia Foundation",
    category: "general-knowledge",
    authorityLevel: 7,
    reliability: 0.7,
    subjects: [
      "general",
      "overview",
      "history",
      "definition",
      "encyclopedia",
      "science",
      "art",
      "geography",
      "people",
      "concepts",
    ],
  },
  {
    domain: "britannica.com",
    organization: "Encyclopædia Britannica",
    category: "general-knowledge",
    authorityLevel: 6,
    reliability: 0.8,
    subjects: [
      "general",
      "overview",
      "history",
      "definition",
      "encyclopedia",
      "science",
      "art",
      "geography",
    ],
  },
  // Programming / software
  {
    domain: "developer.mozilla.org",
    organization: "Mozilla",
    category: "programming",
    authorityLevel: 3,
    reliability: 0.9,
    subjects: [
      "javascript",
      "css",
      "html",
      "web",
      "api",
      "browser",
      "typescript",
      "dom",
      "mdn",
    ],
  },
  {
    domain: "github.com",
    organization: "GitHub",
    category: "programming",
    authorityLevel: 3,
    reliability: 0.75,
    subjects: [
      "code",
      "repository",
      "open-source",
      "software",
      "library",
      "framework",
      "issues",
      "programming",
    ],
  },
  {
    domain: "stackoverflow.com",
    organization: "Stack Overflow",
    category: "programming",
    authorityLevel: 8,
    reliability: 0.65,
    subjects: [
      "programming",
      "error",
      "debugging",
      "code",
      "how-to",
      "development",
    ],
  },
  {
    domain: "docs.python.org",
    organization: "Python Software Foundation",
    category: "programming",
    authorityLevel: 1,
    reliability: 0.95,
    subjects: ["python", "stdlib", "pip", "programming", "language"],
  },
  {
    domain: "nodejs.org",
    organization: "OpenJS Foundation",
    category: "programming",
    authorityLevel: 1,
    reliability: 0.95,
    subjects: ["node", "nodejs", "javascript", "runtime", "npm", "server"],
  },
  // Academic / scientific
  {
    domain: "scholar.google.com",
    organization: "Google",
    category: "academic-scientific",
    authorityLevel: 5,
    reliability: 0.7,
    subjects: [
      "research",
      "papers",
      "citations",
      "studies",
      "academic",
      "science",
    ],
  },
  {
    domain: "arxiv.org",
    organization: "Cornell University",
    category: "academic-scientific",
    authorityLevel: 5,
    reliability: 0.7,
    subjects: [
      "research",
      "preprint",
      "physics",
      "mathematics",
      "computer-science",
      "papers",
      "academic",
    ],
  },
  {
    domain: "pubmed.ncbi.nlm.nih.gov",
    organization: "U.S. National Library of Medicine",
    category: "academic-scientific",
    authorityLevel: 5,
    reliability: 0.85,
    subjects: [
      "medicine",
      "biomedical",
      "health",
      "clinical",
      "research",
      "biology",
      "studies",
    ],
  },
  // Cybersecurity
  {
    domain: "nist.gov",
    organization: "U.S. National Institute of Standards and Technology",
    category: "cybersecurity",
    authorityLevel: 2,
    reliability: 0.95,
    subjects: [
      "security",
      "standards",
      "nist",
      "cybersecurity",
      "cryptography",
      "guidelines",
      "compliance",
    ],
  },
  {
    domain: "attack.mitre.org",
    organization: "MITRE Corporation",
    category: "cybersecurity",
    authorityLevel: 4,
    reliability: 0.9,
    subjects: [
      "security",
      "attack",
      "threats",
      "cybersecurity",
      "tactics",
      "techniques",
      "mitre",
    ],
  },
  {
    domain: "owasp.org",
    organization: "OWASP Foundation",
    category: "cybersecurity",
    authorityLevel: 4,
    reliability: 0.85,
    subjects: [
      "security",
      "web",
      "vulnerabilities",
      "cybersecurity",
      "application",
      "owasp",
      "top-ten",
    ],
  },
  {
    domain: "cve.org",
    organization: "CVE Program (MITRE)",
    category: "cybersecurity",
    authorityLevel: 4,
    reliability: 0.9,
    subjects: [
      "security",
      "vulnerability",
      "cve",
      "exploit",
      "cybersecurity",
      "advisory",
    ],
  },
];

// ---------------------------------------------------------
// QUERY DOMAIN CLASSIFICATION — deterministic keyword
// signals over the registry's own subject vocabulary.
// ---------------------------------------------------------
const CATEGORY_SIGNALS: Array<{
  category: SourceCategory;
  keywords: string[];
}> = [
  {
    category: "cybersecurity",
    keywords: [
      "security",
      "vulnerability",
      "vulnerabilities",
      "cve",
      "exploit",
      "encryption",
      "cryptography",
      "threat",
      "owasp",
      "nist",
      "pentest",
      "firewall",
      "malware",
      "ransomware",
      "phishing",
      "hacker",
      "breach",
      "cvss",
      "patch",
      "zero-day",
      "attack",
      "mitm",
      "xss",
      "sqli",
      "hardening",
    ],
  },
  {
    category: "programming",
    keywords: [
      "code",
      "coding",
      "javascript",
      "typescript",
      "python",
      "node",
      "nodejs",
      "npm",
      "api",
      "function",
      "library",
      "framework",
      "react",
      "css",
      "html",
      "debug",
      "compiler",
      "runtime",
      "programming",
      "software",
      "repository",
      "github",
      "exception",
      "async",
      "class",
      "module",
      "package",
      "docker",
      "kubernetes",
      "sql",
      "database",
      "deno",
      "rust",
      "golang",
      "java",
      "kotlin",
      "npm",
      "stack",
    ],
  },
  {
    category: "academic-scientific",
    keywords: [
      "research",
      "study",
      "studies",
      "paper",
      "papers",
      "clinical",
      "trial",
      "journal",
      "peer",
      "medical",
      "medicine",
      "health",
      "biomedical",
      "physics",
      "chemistry",
      "biology",
      "experiment",
      "hypothesis",
      "preprint",
      "citation",
      "epidemiology",
      "scientific",
      "efficacy",
      "cohort",
    ],
  },
  {
    category: "general-knowledge",
    keywords: [
      "what",
      "who",
      "when",
      "where",
      "history",
      "definition",
      "meaning",
      "overview",
      "explained",
      "encyclopedia",
      "country",
      "city",
      "person",
      "famous",
      "art",
      "music",
      "literature",
      "geography",
      "culture",
      "invented",
      "discovered",
    ],
  },
];

/** Classify a research query into a knowledge domain. */
export function classifyQueryDomain(query: string): {
  category: SourceCategory;
  rationale: string;
  matched: string[];
} {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .filter(Boolean);
  const scores = new Map<
    SourceCategory,
    { score: number; matched: string[] }
  >();
  for (const { category, keywords } of CATEGORY_SIGNALS) {
    const matched: string[] = [];
    for (const token of tokens) {
      if (keywords.includes(token)) matched.push(token);
    }
    if (matched.length > 0) {
      const prev = scores.get(category);
      scores.set(category, {
        score: (prev?.score ?? 0) + matched.length,
        matched: [...(prev?.matched ?? []), ...matched],
      });
    }
  }
  // Cybersecurity outranks generic programming signals when
  // both appear (security-specific keywords are unambiguous).
  const security = scores.get("cybersecurity");
  const programming = scores.get("programming");
  if (security && programming && security.score >= programming.score) {
    return {
      category: "cybersecurity",
      rationale: `matched security signals: ${[...new Set(security.matched)].join(", ")}`,
      matched: security.matched,
    };
  }
  let best: {
    category: SourceCategory;
    score: number;
    matched: string[];
  } | null = null;
  for (const [category, s] of scores) {
    if (!best || s.score > best.score) best = { category, ...s };
  }
  if (best) {
    return {
      category: best.category,
      rationale: `matched ${best.category} signals: ${[...new Set(best.matched)].join(", ")}`,
      matched: best.matched,
    };
  }
  return {
    category: "general-knowledge",
    rationale: "no domain-specific signals — defaulting to general knowledge",
    matched: [],
  };
}

// ---------------------------------------------------------
// THE REGISTRY
// ---------------------------------------------------------
export interface SourceSelection {
  query: string;
  category: SourceCategory;
  rationale: string;
  /** Priority-ordered, relevance-ranked sources to search
   *  first. Never every registered site. */
  sources: SourceRecord[];
  /** True when an unclassified fallback search is warranted
   *  after the priority wave. */
  allowFallback: boolean;
}

export class WebSourceRegistry {
  private sources = new Map<string, SourceRecord>();

  constructor() {
    for (const seed of OWNER_PRIORITY_SEEDS) {
      this.sources.set(seed.domain, {
        domain: seed.domain,
        organization: seed.organization,
        category: seed.category,
        authorityLevel: seed.authorityLevel,
        reliability: seed.reliability,
        applicableSubjects: seed.subjects,
        accessibility: "open",
        lastChecked: null,
        status: "trusted",
        provenance: {
          registered: "owner-priority",
          note: "owner-registered priority web knowledge source (2026-09-10 directive)",
          registeredAt: "2026-09-10T00:00:00.000Z",
        },
        confidence: 0.9,
      });
    }
  }

  /** All registered sources (registry manifest). */
  list(): SourceRecord[] {
    return [...this.sources.values()];
  }

  /** Find the registered source for a URL host — subdomains
   *  match their registrable domain (en.wikipedia.org →
   *  wikipedia.org). */
  lookup(url: string): SourceRecord | null {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    for (const [domain, record] of this.sources) {
      if (host === domain || host.endsWith(`.${domain}`)) return record;
    }
    return null;
  }

  /**
   * SOURCE SELECTION — understand the question, determine the
   * knowledge domain, choose the most appropriate sources.
   * Ranking: domain-category match, subject-keyword overlap,
   * then authority and reliability. Sources whose category is
   * unrelated to the question are excluded — ARCHIE does not
   * blindly search every registered website.
   */
  select(query: string, maxSources = 3): SourceSelection {
    const { category, rationale, matched } = classifyQueryDomain(query);
    const queryTokens = new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9+#.-]+/)
        .filter(Boolean),
    );
    const scored = this.list()
      .filter((s) => s.status !== "rejected")
      .map((s) => {
        let score = 0;
        if (s.category === category) score += 2;
        const subjectOverlap = s.applicableSubjects.filter((k) =>
          queryTokens.has(k),
        ).length;
        score += subjectOverlap * 0.5;
        // Authority + reliability break ties.
        score += (9 - s.authorityLevel) * 0.05 + s.reliability * 0.1;
        // A priority category never leaks into unrelated
        // queries (e.g. pubmed is NOT searched for a CSS
        // question) unless nothing matched at all.
        const related =
          s.category === category ||
          s.category === "general-knowledge" ||
          matched.length === 0;
        return { source: s, score, related };
      })
      .filter((x) => x.related);
    scored.sort((a, b) => b.score - a.score);
    const sources = scored.slice(0, maxSources).map((x) => x.source);
    return {
      query,
      category,
      rationale,
      sources,
      allowFallback: true,
    };
  }

  /** Hierarchy rank for disagreement resolution — lower is
   *  more authoritative (1 = primary official, 8 = community). */
  rank(source: SourceRecord): number {
    return source.authorityLevel;
  }

  /**
   * CONTINUOUS SOURCE EXPANSION — classify a newly discovered
   * domain with deterministic rules. Discovered sources are
   * registered as "evaluating" with moderate confidence and
   * are NEVER auto-promoted to trusted: evaluation (or owner
   * validation) has to happen first. No artificial knowledge
   * ceiling, and no free trust.
   */
  evaluateDiscovered(url: string): SourceRecord {
    const existing = this.lookup(url);
    if (existing) return existing;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      host = url
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0];
    }
    // Registrable domain (crude but real: last two labels, or
    // three for the common multi-part TLDs).
    const labels = host.split(".");
    const multiPartTlds = ["gov", "ac", "co", "org", "com", "edu"];
    const registrable =
      labels.length >= 3 && multiPartTlds.includes(labels[labels.length - 2])
        ? labels.slice(-3).join(".")
        : labels.slice(-2).join(".");

    // Deterministic classification rules.
    let category: SourceCategory = "reputable-secondary";
    let authorityLevel = 7;
    let reliability = 0.5;
    let note =
      "no classification signal matched — held at secondary until evaluated";

    if (
      registrable.endsWith(".gov") ||
      registrable.endsWith(".mil") ||
      /\.gov(\.[a-z]{2})?$/.test(registrable)
    ) {
      category = "government";
      authorityLevel = 2;
      reliability = 0.85;
      note = "government/regulatory domain (TLD signal)";
    } else if (
      registrable.endsWith(".edu") ||
      registrable.endsWith(".ac.uk") ||
      /\.edu(\.[a-z]{2})?$/.test(registrable) ||
      registrable.endsWith(".ac.ng")
    ) {
      category = "university-research";
      authorityLevel = 5;
      reliability = 0.8;
      note = "university/research domain (TLD signal)";
    } else if (registrable.endsWith(".int")) {
      category = "standards";
      authorityLevel = 2;
      reliability = 0.85;
      note = "international organization domain (TLD signal)";
    } else if (
      /^docs?\./.test(host) ||
      labels[0] === "docs" ||
      labels[0] === "developer"
    ) {
      category = "official-docs";
      authorityLevel = 3;
      reliability = 0.8;
      note = "official documentation host signal";
    } else if (/forum|discuss|community|answers/.test(host)) {
      category = "community";
      authorityLevel = 8;
      reliability = 0.45;
      note = "community discussion host signal";
    }

    const record: SourceRecord = {
      domain: registrable,
      organization: `discovered during research: ${registrable}`,
      category,
      authorityLevel,
      reliability,
      applicableSubjects: [],
      accessibility: "open",
      lastChecked: new Date().toISOString(),
      status: "evaluating",
      provenance: {
        registered: "discovered",
        note: `${note} — evaluating, not yet trusted`,
        registeredAt: new Date().toISOString(),
      },
      confidence: 0.5,
    };
    this.sources.set(registrable, record);
    return record;
  }

  /** Owner-validated promotion of a discovered source. */
  /** Audit fix H-4 (2026-09-11): owner action — mark a source
   *  RESTRICTED. The pipeline then NEVER issues a search for
   *  it and reports it in sourceFailures ("source marked
   *  restricted — not searched"), never in sourcesSearched.
   *  Honest refusal, honest reporting. */
  restrict(domain: string): SourceRecord | null {
    const record = this.sources.get(domain);
    if (!record) return null;
    record.accessibility = "restricted";
    record.provenance = {
      ...record.provenance,
      note: `${record.provenance.note} — marked restricted by owner (never searched)`,
    };
    return record;
  }

  promote(domain: string): SourceRecord | null {
    const record = this.sources.get(domain);
    if (!record) return null;
    record.status = "trusted";
    record.confidence = 0.85;
    record.reliability = Math.max(record.reliability, 0.7);
    record.provenance = {
      ...record.provenance,
      note: `${record.provenance.note} — promoted to trusted by owner validation`,
    };
    return record;
  }

  /** Honest registry manifest for diagnostics. */
  manifest(): {
    total: number;
    trusted: number;
    evaluating: number;
    ownerPriority: number;
    discovered: number;
    byCategory: Record<string, number>;
  } {
    const all = this.list();
    const byCategory: Record<string, number> = {};
    for (const s of all) {
      byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    }
    return {
      total: all.length,
      trusted: all.filter((s) => s.status === "trusted").length,
      evaluating: all.filter((s) => s.status === "evaluating").length,
      ownerPriority: all.filter(
        (s) => s.provenance.registered === "owner-priority",
      ).length,
      discovered: all.filter((s) => s.provenance.registered === "discovered")
        .length,
      byCategory,
    };
  }
}

/** Singleton for engine + kernel access (same pattern as the
 *  native engine singleton). */
let registrySingleton: WebSourceRegistry | null = null;
export function getWebSourceRegistry(): WebSourceRegistry {
  registrySingleton ??= new WebSourceRegistry();
  return registrySingleton;
}
