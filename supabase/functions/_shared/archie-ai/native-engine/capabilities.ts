// =========================================================
// ARCHIE NATIVE ENGINE — HONEST CAPABILITY MANIFEST
//
// The owner's rule: "If a capability is not yet implemented,
// clearly report it rather than pretending it exists." This
// manifest is the single source of truth for what ARCHIE's
// native engine can actually do — OPERATIONAL entries are
// backed by passing tests named in measuredBy. The engine
// surfaces this manifest in responses and diagnostics.
// =========================================================

import type { CapabilityReport } from "./types.ts";

export const NATIVE_ENGINE_ID = "archie-native-engine";

/** ARCHIE's capability manifest — every entry mapped to a
 *  REAL subsystem or platform module with its honest maturity
 *  and the test suite that measures it (owner directive
 *  2026-09-14: the manifest must list the trading, offensive
 *  security, passphrase recovery and platform engines that
 *  already exist and are test-covered — no theater, no
 *  invention). */
export function nativeEngineCapabilityManifest(): CapabilityReport[] {
  return [
    {
      id: "natural-conversation",
      description:
        "Natural conversation and language understanding: TF-IDF context vectors, entity extraction, Naive Bayes intent classification (trained at boot from the embedded corpus)",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine.test.ts (NLU + accuracy fixture), native-engine-runtime.test.ts",
    },
    {
      id: "reasoning",
      description:
        "Reasoning and problem solving: bounded forward-chaining rule inference over the knowledge store with confidence propagation, full derivation traces, and backward goal checking",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (reasoning cases)",
    },
    {
      id: "context-management",
      description:
        "Context management: working memory with salience-ranked retrieval (relevance × recency) over vectorized conversation turns",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (memory salience case)",
    },
    {
      id: "persistent-memory-retrieval",
      description:
        "Persistent-memory retrieval via a pluggable persistence adapter (Supabase-backed in edge/app deployments: frelux_archie_native_facts / frelux_archie_native_outcomes); in-memory fallback when unwired",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine.test.ts (persistence round-trip), native-engine-runtime.test.ts",
    },
    {
      id: "knowledge-acquisition",
      description:
        "Knowledge acquisition and consolidation: SPO fact store with contradiction detection, confidence arbitration, duplicate merge, decay, and promotion — uncertain information is never stored as established fact",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (knowledge cases)",
    },
    {
      id: "planning",
      description:
        "Planning and decision-making: means-ends analysis over a registered operator library with cost-ranked plans and honest gap reports for missing prerequisites",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (planner cases)",
    },
    {
      id: "evidence-truth-engine",
      description:
        "Evidence & Truth: structured claims with explicit verification states (VERIFIED / SUPPORTED / USER_PROVIDED / INFERRED / CONFLICTED / OUTDATED / UNVERIFIED / UNKNOWN), provenance chains preserved through every transformation, independent-source corroboration, temporal validity, contradiction records (never silently resolved), deterministic dedup keys, hallucinated-source refusal and strict no-false-verification guarantees. Connects the lexicon, semantic graph and context & inference layers on the live chat path (archie-core) and surfaces measured health through the admin Evidence & Truth page",
      maturity: "OPERATIONAL",
      measuredBy:
        "evidence-truth-mirror.test.ts (state-contract drift mirror) + edge evidence suite (evaluate / service / engine tests — 58 tests)",
    },
    {
      id: "coding-intelligence-analysis",
      description:
        "Coding intelligence (analysis): deterministic static analysis — imports/exports/functions/classes extraction, cyclomatic-complexity estimate, risk flags",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (code analysis cases)",
    },
    {
      id: "coding-intelligence-generation",
      description:
        "Code analysis and generation: deterministic unit-test scaffold generation derived from analysis output. Open-ended generative coding is NOT_IMPLEMENTED and always reported honestly",
      maturity: "DEVELOPING",
      measuredBy: "native-engine.test.ts (scaffold generation case)",
    },
    {
      id: "coding-intelligence-project",
      description:
        "Multi-file project analysis: internal dependency graph (relative + @/ alias + extensionless + index resolution, exact file beats index), broken-import detection, DFS import-cycle detection, entry-candidate discovery, project complexity metrics",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine project-analysis: coding-project.test.ts (graph, cycles, broken imports, metrics)",
    },
    {
      id: "coding-intelligence-scaffold-dependency-aware",
      description:
        "Dependency-aware unit-test scaffold generation: vi.mock() lines derived from the project graph so modules are tested in isolation",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine scaffold-generation: coding-project.test.ts (dependency-aware scaffold cases)",
    },
    {
      id: "tool-orchestration",
      description:
        "Tool orchestration: typed tool registry with contract validation, honest failure reporting, a deterministic arithmetic evaluator (shunting-yard), descriptive statistics (mean/median/mode/variance), an in-engine sandboxed JavaScript interpreter (whitelisted subset — no I/O, no network, no Date/random; step-, depth-, output- and size-capped), and a robots-checked page reader (owner upgrade 2026-09-16, gap 2)",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine.test.ts + sandbox.test.ts + reasoning-loop.test.ts (tool, arithmetic, statistics, sandbox and loop-budget cases)",
    },
    {
      id: "web-research",
      description:
        "Web research pipeline with PRIORITY SOURCE SELECTION: question → domain classification → appropriate priority sources first (wikipedia/britannica, MDN/github/stackoverflow/python/node docs, scholar/arxiv/pubmed, NIST/MITRE ATT&CK/OWASP/CVE per the owner registry) → parallel site-scoped searches → cross-source check → early stopping → discovered-source classification (never auto-trusted) → storage as low-confidence candidate knowledge with full provenance. Speed optimizations: parallel searches, result caching with TTL, deduplication, relevance ranking. Network-dependent; the DuckDuckGo Lite adapter operates without keys or auth bypass; priority sources and hierarchy per the owner's web knowledge source registry",
      maturity: "DEVELOPING",
      measuredBy:
        "native-engine.test.ts (research pipeline case with labeled test adapter) + archie-web-source-registry.test.ts (source selection, cross-check, caching, discovery)",
    },
    {
      id: "self-evaluation",
      description:
        "Self-evaluation and verification: contradiction scans, inference stability re-derivation, plan validity checks, response-integrity checks, calibration statistics",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (self-eval cases)",
    },
    {
      id: "outcome-learning",
      description:
        "Learning from validated outcomes: outcome recording with credit assignment, confidence reinforcement (success strengthens, failure/correction weakens), consolidation passes",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine.test.ts (learning cases)",
    },
    {
      id: "market-intelligence-price-lookup",
      description:
        "Market intelligence price lookup: price queries resolve through a pluggable lookup adapter over real observed market data (approved prices first, raw observations labeled honestly); no data or no wired adapter produces an honest refusal — ARCHIE never guesses prices",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine-runtime.test.ts (market price cases)",
    },
    {
      id: "system-adapters-documents-images-voice-social-family",
      description:
        "System adapters for documents, images, voice bank, social accounts and the trusted-people roster: status questions resolve through pluggable lookups over real deployed tables; no data or no wired adapter produces an honest refusal — system state is never invented",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine-runtime.test.ts (system adapter cases)",
    },
    {
      id: "construction-calculators",
      description:
        "Deterministic construction calculators in chat: blocks for a wall, paint litres for an area, cement bags for a concrete volume — pure arithmetic with stated assumptions (450x225mm block, 10 m2/litre/coat, 1:2:4 mix); missing parameters get an honest request, never guessed numbers",
      maturity: "OPERATIONAL",
      measuredBy:
        "native-engine-runtime.test.ts (construction calculator cases)",
    },
    {
      id: "trading-market-data",
      description:
        "Global markets intelligence: live market price observation and data ingestion persisted to archie_global_market_observations — platform module, client-tested",
      maturity: "OPERATIONAL",
      measuredBy: "market-data.test.ts, global-intelligence.test.ts",
    },
    {
      id: "trading-exchange-execution",
      description:
        "Exchange execution intelligence: order routing to authorized exchanges with honest fill/skip reporting — never a simulated fill",
      maturity: "OPERATIONAL",
      measuredBy: "exchange-execution.test.ts",
    },
    {
      id: "trading-order-lifecycle",
      description:
        "Order lifecycle state machine: created, routed, filled, cancelled — every transition auditable, no silent state jumps",
      maturity: "OPERATIONAL",
      measuredBy: "order-lifecycle.test.ts",
    },
    {
      id: "trading-portfolio",
      description:
        "Portfolio intelligence: positions, exposure and realized/unrealized outcome tracking from real order records",
      maturity: "OPERATIONAL",
      measuredBy: "portfolio.test.ts",
    },
    {
      id: "trading-slippage",
      description:
        "Slippage estimation on execution: honest expected-vs-actual spread reporting on every routed order",
      maturity: "OPERATIONAL",
      measuredBy: "slippage.test.ts",
    },
    {
      id: "trading-gate",
      description:
        "Trade gate: trading actions are owner-authorized only — knowledge never grants trade authority; subscriber/private-data boundaries are enforced server-side",
      maturity: "OPERATIONAL",
      measuredBy: "trade-gate.test.ts",
    },
    {
      id: "blockchain-ledger",
      description:
        "Blockchain intelligence: on-chain record semantics and ledger verification for trading and escrow flows",
      maturity: "OPERATIONAL",
      measuredBy: "blockchain.test.ts",
    },
    {
      id: "crypto-intelligence",
      description:
        "Cryptocurrency intelligence: market intelligence for crypto assets feeding the same gated trading pipeline",
      maturity: "OPERATIONAL",
      measuredBy: "crypto-intelligence.test.ts",
    },
    {
      id: "passphrase-vault-recovery",
      description:
        "Passphrase and recovery-phrase intelligence: HD-wallet / BIP39 recovery phrase handling and Stage-2 vault recovery — deterministic recovery paths, never invented mnemonics",
      maturity: "OPERATIONAL",
      measuredBy:
        "hd-crypto.test.ts, recovery-engine.test.ts, stage2-vault-recovery.test.ts",
    },
    {
      id: "offensive-security",
      description:
        "Offensive security (authorized hacking only): engagements, findings and targets recorded in archie_offensive_* tables; every engagement requires explicit owner authorization — never autonomous targeting",
      maturity: "OPERATIONAL",
      measuredBy: "offensive-security.test.ts",
    },
    {
      id: "api-credential-security",
      description:
        "API credential security: enrollment, rotation and scoped grants for third-party credentials — secrets never stored in plaintext",
      maturity: "OPERATIONAL",
      measuredBy: "api-credentials.test.ts",
    },
    {
      id: "cross-project-authentication",
      description:
        "Cross-project authority authentication: signed authority JWTs let only whitelisted projects call ARCHIE actions",
      maturity: "OPERATIONAL",
      measuredBy: "cross-project-auth.test.ts",
    },
    {
      id: "trusted-device-enrollment",
      description:
        "Trusted device enrollment: devices require explicit enrollment with session-specific tokens and granular permission sets — never unified global access",
      maturity: "OPERATIONAL",
      measuredBy: "trusted-devices-forensic.test.ts",
    },
    {
      id: "engineering-objective",
      description:
        "Engineering objective reasoning: goal decomposition into measurable engineering objectives with honest completion states",
      maturity: "OPERATIONAL",
      measuredBy: "engineering-objective.test.ts",
    },
    {
      id: "vision-perception",
      description:
        "Vision/perception: image analysis adapters feeding document and site inspection intelligence",
      maturity: "OPERATIONAL",
      measuredBy: "vision.test.ts",
    },
    {
      id: "voiceprint-identity",
      description:
        "Voiceprint identity: voice enrollment and verification for trusted voice sessions",
      maturity: "OPERATIONAL",
      measuredBy:
        "voice-enrollment.test.ts, voiceprint.test.ts, voice-session.test.ts",
    },
    {
      id: "whatsapp-integration",
      description:
        "WhatsApp intelligence: protocol-compliant messaging, reminders and message history via the WhatsApp client",
      maturity: "OPERATIONAL",
      measuredBy: "whatsapp-integration.test.ts, whatsapp-protocol.test.ts",
    },
    {
      id: "web-source-registry",
      description:
        "Priority web source registry: domain-classified source selection for research (construction, finance, news and more)",
      maturity: "OPERATIONAL",
      measuredBy: "archie-web-source-registry.test.ts",
    },
    {
      id: "deep-page-verification",
      description:
        "Deep page verification: robots-checked, timeout-guarded page fetching so research findings are content-verified, not snippet-only",
      maturity: "OPERATIONAL",
      measuredBy: "page-fetch.test.ts, webresearch-adapter.test.ts",
    },
    {
      id: "generative-language-model",
      description:
        "Open-ended natural-language generation comparable to a large language model. The base engine's own generative-LM capability remains NOT implemented — the ONLY generative path is the owner-gated LOCAL model gateway (generative.ts, gap A-1): the owner's own Ollama/llama.cpp server, opt-in via ARCHIE_LOCAL_MODEL_URL/ARCHIE_LOCAL_MODEL_NAME secrets, output appended with the [GENERATED - NOT validated knowledge] label, never stored as knowledge. NO EXTERNAL AI provider is wired into ARCHIE (owner directive 2026-09-16) — the pluggable LLM router scaffold (native-engine/llm-router.ts) ships with ZERO providers; a future provider would be labeled, inert (never authority-bearing), budgeted and honestly reported. The base engine composes structured responses from real retrieved knowledge, reasoning outputs, and tool results, and states clearly when knowledge is insufficient rather than imitating generative prose",
      maturity: "NOT_IMPLEMENTED",
      measuredBy:
        "honest disclosure — enforced by native-engine-runtime.test.ts (honesty cases)",
    },
  ];
}

/** Honest counts for diagnostics. */
export function manifestSummary(manifest: CapabilityReport[]): {
  operational: number;
  developing: number;
  notImplemented: number;
} {
  return {
    operational: manifest.filter((c) => c.maturity === "OPERATIONAL").length,
    developing: manifest.filter((c) => c.maturity === "DEVELOPING").length,
    notImplemented: manifest.filter((c) => c.maturity === "NOT_IMPLEMENTED")
      .length,
  };
}
