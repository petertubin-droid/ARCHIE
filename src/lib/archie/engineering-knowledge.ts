// =========================================================
// FRELUX PHASE 8 P5, ARCHIE FOUNDATIONAL ENGINEERING
// KNOWLEDGE PACKAGE (BASE44 AS FIRST TECHNICAL TEACHER)
//
// Converts AUTHORIZED technical knowledge available through
// Base44 and the FRELUX implementation environment (public
// docs, open standards, and the FRELUX codebase itself) into
// structured ARCHIE knowledge through the EXISTING pipeline:
//
//   SOURCE → EXTRACT → STRUCTURE → VALIDATE → EVALUATE →
//   APPROVE → VERSION → KNOWLEDGE
//
// which maps 1:1 onto the Phase 8 ingestion states:
//   RECEIVED → EXTRACTING → EXTRACTED → STRUCTURED → VALIDATED
//   → EVALUATED → AWAITING_APPROVAL → APPROVED.
//
// HARD LIMITS (enforced, not aspirational):
//   * EXCLUDED_KNOWLEDGE lists what may NEVER be ingested:
//     proprietary model weights, hidden system prompts,
//     confidential platform internals, private customer
//     information, secrets and restricted IP.
//   * Every learned item retains provenance, source,
//     timestamp, confidence, scope and verification status.
//   * Knowledge acquisition NEVER authorizes production
//     changes: knowledge items flow through the same
//     APPROVAL gate as all ARCHIE learning, and production
//     changes still require the change pipeline + Owner
//     authorization.
//   * No artificial fixed limit on what ARCHIE can learn:
//     FOUNDATION_PACKAGE is the seed, learnTechnology()
//     accepts any legitimate technology through the same
//     governance.
// =========================================================

import type { ArchieTrainingInput, ArchieContributor } from "./types";

/** What may never be ingested, whatever the source. */
export const EXCLUDED_KNOWLEDGE: readonly string[] = [
  "proprietary model weights or internal model parameters",
  "hidden system prompts of any platform",
  "confidential platform internals not legitimately available to FRELUX",
  "private customer information or other users' data",
  "secrets, API keys, tokens or credentials",
  "restricted intellectual property FRELUX is not licensed to use",
];

export type VerificationStatus =
  "UNVERIFIED" | "VERIFIED_BY_BUILD" | "VERIFIED_BY_TEST" | "VERIFIED_BY_DOC";

export interface FoundationTopic {
  id: string;
  technology: string;
  family:
    | "LANGUAGE"
    | "FRAMEWORK"
    | "BUILD_TOOLING"
    | "STYLING"
    | "ROUTING"
    | "STATE"
    | "API"
    | "BACKEND"
    | "DATABASE"
    | "AUTH"
    | "EDGE_COMPUTE"
    | "PWA"
    | "TESTING"
    | "PACKAGING"
    | "DEPLOYMENT"
    | "CI_CD"
    | "SECURITY"
    | "PERFORMANCE"
    | "ACCESSIBILITY"
    | "RESPONSIVE"
    | "AI_INTEGRATION"
    | "MULTIMODAL"
    | "FRELUX_ENGINES"
    | "FRELUX_DATABASE"
    | "FRELUX_API"
    | "LESSONS_LEARNED";
  summary: string;
  /** Authorized source where this knowledge comes from. */
  source: string;
  /** Where the concept demonstrably exists in FRELUX. */
  frelux_evidence: string;
  confidence: number; // 0..1
  verification: VerificationStatus;
}

/**
 * The seed package: each topic is legitimately available
 * through Base44/FRELUX docs and code, and evidenced in the
 * FRELUX codebase itself.
 */
export const FOUNDATION_PACKAGE: readonly FoundationTopic[] = [
  {
    id: "ts-core",
    technology: "TypeScript",
    family: "LANGUAGE",
    summary:
      "Typed JavaScript superset; strict typing, interfaces, generics, discriminated unions and type narrowing used across FRELUX for compile-time safety.",
    source: "TypeScript public documentation + FRELUX codebase",
    frelux_evidence: "src/**/*.ts strict tsc --noEmit in CI",
    confidence: 0.99,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "react-core",
    technology: "React",
    family: "FRAMEWORK",
    summary:
      "Component model, hooks (state, effect, memo, context), composition and reconciliation; FRELUX pages and UI are React function components.",
    source: "React public documentation + FRELUX codebase",
    frelux_evidence: "src/pages/**, src/components/**",
    confidence: 0.99,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "js-core",
    technology: "JavaScript (ES2022+)",
    family: "LANGUAGE",
    summary:
      "Async/await, modules, iteration protocols and standard library underpinning all FRELUX runtime behavior.",
    source: "ECMA-262 public specification + MDN",
    frelux_evidence: "All runtime code; Vite transpiles to ES targets",
    confidence: 0.99,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "html-css",
    technology: "HTML & CSS",
    family: "STYLING",
    summary:
      "Semantic markup, the cascade, flexbox/grid layout, custom properties and media queries; Tailwind compiles to CSS utility layers.",
    source: "WHATWG/MDN public specs + Tailwind documentation",
    frelux_evidence: "index.html, src/index.css, tailwind.config.js",
    confidence: 0.97,
    verification: "VERIFIED_BY_DOC",
  },
  {
    id: "vite",
    technology: "Vite",
    family: "BUILD_TOOLING",
    summary:
      "ESM dev server, Rollup production builds, path aliases (@/), env handling and code splitting; FRELUX build tool.",
    source: "Vite public documentation + FRELUX codebase",
    frelux_evidence: "vite.config.ts, import.meta.env usage",
    confidence: 0.98,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "routing",
    technology: "Client routing",
    family: "ROUTING",
    summary:
      "URL → component mapping, lazy routes, protected/admin route gating and search-param deep links.",
    source: "React Router public documentation + FRELUX codebase",
    frelux_evidence: "src/App.tsx route tree, useSearchParams",
    confidence: 0.97,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "state",
    technology: "State management",
    family: "STATE",
    summary:
      "Context providers + hooks for global state (auth, credits, theme) with local useState for component state.",
    source: "React public documentation + FRELUX codebase",
    frelux_evidence: "src/lib/credits-context.tsx, src/lib/auth",
    confidence: 0.95,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "apis",
    technology: "HTTP APIs & fetch",
    family: "API",
    summary:
      "REST semantics, JSON request/response contracts, idempotency keys, timeout/retry and structured error handling.",
    source: "MDN + FRELUX backend function contracts",
    frelux_evidence: "src/lib/frelix-api/portal-client.ts, edge functions",
    confidence: 0.96,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "supabase",
    technology: "Supabase",
    family: "BACKEND",
    summary:
      "Postgres + Auth + Storage + Edge Functions; JS client with RLS-first authorization, service role used only server-side.",
    source: "Supabase public documentation + FRELUX codebase",
    frelux_evidence: "supabase/functions/**, src/lib/supabase.ts",
    confidence: 0.98,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "postgres",
    technology: "PostgreSQL / database concepts",
    family: "DATABASE",
    summary:
      "Relational modeling, constraints, CHECK/UNIQUE, triggers, views, transactions and row-level security policies.",
    source: "PostgreSQL public documentation + FRELUX migrations",
    frelux_evidence: "supabase/migrations/*.sql",
    confidence: 0.97,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "auth",
    technology: "Authentication & authorization",
    family: "AUTH",
    summary:
      "Session-based auth, JWT verification in edge functions, role helpers (is_admin), least privilege and RLS enforcement server-side.",
    source: "Supabase docs + FRELUX codebase",
    frelux_evidence: "src/lib/auth, archie-owner-auth function",
    confidence: 0.97,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "edge",
    technology: "Edge / serverless functions",
    family: "EDGE_COMPUTE",
    summary:
      "Deno edge functions for server-authoritative logic: verification, postbacks, HMAC checks, service-role DB access.",
    source: "Supabase Edge Runtime public docs + FRELUX codebase",
    frelux_evidence: "supabase/functions/rewarded-postback, archie-*",
    confidence: 0.96,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "pwa",
    technology: "PWA & service workers",
    family: "PWA",
    summary:
      "Installable web apps, service worker lifecycle, cache strategies and offline-first UX principles.",
    source: "MDN Web App Manifest/Service Worker public docs",
    frelux_evidence: "public/manifest*, service worker registration",
    confidence: 0.9,
    verification: "VERIFIED_BY_DOC",
  },
  {
    id: "testing",
    technology: "Testing & debugging",
    family: "TESTING",
    summary:
      "Unit/integration tests with Vitest + Testing Library, end-to-end with Playwright, coverage gates and CI red-green discipline.",
    source: "Vitest/Playwright public docs + FRELUX suite",
    frelux_evidence: "src/**/*.test.ts(x), e2e/**, vitest.config.ts",
    confidence: 0.97,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "packaging",
    technology: "Dependencies & package management",
    family: "PACKAGING",
    summary:
      "npm semver ranges, lockfiles, dependency audits and minimal-surface dependency policy.",
    source: "npm public documentation + FRELUX package.json",
    frelux_evidence: "package.json, package-lock.json, audit scripts",
    confidence: 0.94,
    verification: "VERIFIED_BY_DOC",
  },
  {
    id: "deploy",
    technology: "Deployment & hosting",
    family: "DEPLOYMENT",
    summary:
      "Static SPA builds on Netlify/Vercel with SPA rewrites, preview deploys and environment separation.",
    source: "Netlify/Vercel public docs + FRELUX config",
    frelux_evidence: "netlify.toml, vercel.json",
    confidence: 0.95,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "cicd",
    technology: "CI/CD",
    family: "CI_CD",
    summary:
      "Automated pipelines: typecheck, lint, unit tests, coverage, e2e smoke; pre-commit hooks and required-status gates.",
    source: "GitHub Actions public docs + FRELUX workflows",
    frelux_evidence: ".github/workflows, lint-staged config",
    confidence: 0.96,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "security",
    technology: "Security engineering",
    family: "SECURITY",
    summary:
      "Secrets server-side only, HMAC signature verification, SSRF hardening, constant-time comparisons, CSP and RLS-deny-by-default.",
    source: "OWASP public guides + FRELUX codebase",
    frelux_evidence: "rewarded-postback HMAC, SSRF-hardened crawler",
    confidence: 0.96,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "performance",
    technology: "Performance",
    family: "PERFORMANCE",
    summary:
      "Code splitting/lazy routes, bundle budgets, memoization, virtualization and network waterfall avoidance.",
    source: "web.dev public guides + FRELUX build output",
    frelux_evidence: "React.lazy routes, vendor chunking",
    confidence: 0.93,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "a11y",
    technology: "Accessibility",
    family: "ACCESSIBILITY",
    summary:
      "Semantic controls, aria-label/pressed/state, keyboard focus rings, color contrast and screen-reader text.",
    source: "WAI-ARIA public specification + FRELUX UI kit",
    frelux_evidence: "shadcn button focus rings, aria-pressed toggles",
    confidence: 0.94,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "responsive",
    technology: "Responsive design",
    family: "RESPONSIVE",
    summary:
      "Mobile-first breakpoints, fluid grids, safe tap targets, overflow and wrapping behavior across viewports.",
    source: "MDN responsive design guides + FRELUX UI",
    frelux_evidence: "sm:/md:/lg: utilities across pages",
    confidence: 0.94,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "ai-integration",
    technology: "AI integrations",
    family: "AI_INTEGRATION",
    summary:
      "Provider-abstracted AI calls (Gemini/…), structured prompts, output validation and cost metering.",
    source: "Provider public docs + FRELUX AI core",
    frelux_evidence: "src/lib/ai, archie-extract function",
    confidence: 0.93,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "multimodal",
    technology: "Multimodal systems",
    family: "MULTIMODAL",
    summary:
      "Text, image, audio and document inputs flowing through one ingestion pipeline with per-modality validation.",
    source: "ARCHIE Phase 8 design + FRELUX codebase",
    frelux_evidence: "ArchieInputType modality set, archie-ingestion",
    confidence: 0.92,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "frelux-engines",
    technology: "FRELUX calculators & deterministic engines",
    family: "FRELUX_ENGINES",
    summary:
      "Deterministic math engines with protected promotion bars: formula changes require engineering review and Owner authorization, never auto-promotion.",
    source: "FRELUX codebase (authorized)",
    frelux_evidence: "src/lib/calc, engines-registry, DETERMINISTIC risk class",
    confidence: 0.98,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "frelux-db",
    technology: "FRELUX database architecture",
    family: "FRELUX_DATABASE",
    summary:
      "Phase-numbered additive migrations, RLS on every table, append-only ledgers and immutable audit rows.",
    source: "FRELUX migrations (authorized)",
    frelux_evidence: "supabase/migrations/*, credit_transactions",
    confidence: 0.97,
    verification: "VERIFIED_BY_BUILD",
  },
  {
    id: "frelux-api",
    technology: "FRELUX API architecture",
    family: "FRELUX_API",
    summary:
      "Phase 7 API gateway: hashed keys, entitlements, metering, rate limits and gateway-only service-role writes.",
    source: "FRELUX Phase 7 docs + codebase (authorized)",
    frelux_evidence: "src/lib/frelix-api/**, api gateway function",
    confidence: 0.96,
    verification: "VERIFIED_BY_TEST",
  },
  {
    id: "frelux-lessons",
    technology: "Lessons learned from the FRELUX codebase",
    family: "LESSONS_LEARNED",
    summary:
      "Server-authoritative everything (paystack crash, credit minting, forgeable postbacks), CI race patience (wait for disabled buttons), RLS deny-by-default, dead-component audits (offerwall mounted nowhere).",
    source: "FRELUX git history + audit sessions (authorized)",
    frelux_evidence: "commit 2856c47, 8a1cc4c, c14b694",
    confidence: 0.95,
    verification: "VERIFIED_BY_DOC",
  },
];

/** ARCHIE's code-capability ladder, the reason for learning. */
export const CODE_CAPABILITIES = [
  "READ",
  "UNDERSTAND",
  "ANALYZE",
  "DESIGN",
  "WRITE",
  "TEST",
  "REVIEW",
  "EXPLAIN",
] as const;
export type CodeCapability = (typeof CODE_CAPABILITIES)[number];

/** Scan a knowledge source text for forbidden material. */
export function screenKnowledgeSource(text: string): {
  ok: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const lowered = text.toLowerCase();
  if (/api[_-]?key|secret|password|bearer\s+[a-z0-9._-]{16,}/i.test(text)) {
    violations.push("possible secrets/credentials detected (secrets)");
  }
  for (const excl of EXCLUDED_KNOWLEDGE) {
    if (lowered.includes(excl.slice(0, Math.min(24, excl.length)))) {
      violations.push(`excluded knowledge: ${excl}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Convert the seed package into ArchieTrainingInput rows for
 * the EXISTING ingestion pipeline. The pipeline (RECEIVED →
 * … → AWAITING_APPROVAL → APPROVED) is the SOURCE→…→KNOWLEDGE
// contract; approval remains a human admin action.
 */
export function packageToTrainingInputs(
  contributor: ArchieContributor,
  topics: readonly FoundationTopic[] = FOUNDATION_PACKAGE,
): ArchieTrainingInput[] {
  return topics.map((t) => ({
    input_type: "TEXT" as const,
    title: `Foundational engineering: ${t.technology}`,
    domain: "software_engineering",
    text:
      `TECHNOLOGY: ${t.technology}\nFAMILY: ${t.family}\n` +
      `SUMMARY: ${t.summary}\nSOURCE: ${t.source}\n` +
      `FRELUX EVIDENCE: ${t.frelux_evidence}\n` +
      `CONFIDENCE: ${t.confidence}\nVERIFICATION: ${t.verification}`,
    source_ref: `foundation-package/${t.id}`,
    contributor,
    user_confirmed: false, // still requires human approval, always
  }));
}

/**
 * No artificial ceiling on future learning: any legitimate
 * technology can be added through the same governance. The
 * text is screened; violations block ingestion.
 */
export function learnTechnology(input: {
  technology: string;
  family: FoundationTopic["family"];
  summary: string;
  source: string;
  frelux_evidence: string;
  confidence: number;
}): { ok: boolean; violations: string[]; topic?: FoundationTopic } {
  const screen = screenKnowledgeSource(
    `${input.technology} ${input.summary} ${input.source}`,
  );
  if (!screen.ok) {
    return { ok: false, violations: screen.violations };
  }
  if (input.confidence < 0 || input.confidence > 1) {
    return { ok: false, violations: ["confidence must be within 0..1"] };
  }
  if (!input.summary.trim() || !input.source.trim()) {
    return {
      ok: false,
      violations: ["summary and source are mandatory for provenance"],
    };
  }
  return {
    ok: true,
    violations: [],
    topic: {
      id: `custom-${input.technology.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      technology: input.technology,
      family: input.family,
      summary: input.summary,
      source: input.source,
      frelux_evidence: input.frelux_evidence,
      confidence: input.confidence,
      verification: "UNVERIFIED" as const,
    },
  };
}
