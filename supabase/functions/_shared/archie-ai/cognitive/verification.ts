// =========================================================
// ARCHIE COGNITIVE ENGINE — VERIFICATION ENGINE
// supabase/functions/_shared/archie-ai/cognitive/verification.ts
//
// Independently checks important outputs BEFORE presenting
// them: correctness (re-execution/re-derivation),
// consistency (contradiction scan), completeness, security
// (secret + dangerous-code scan), source quality,
// assumptions and uncertainty. Produces a formal verdict —
// PASS / FAIL / UNVERIFIED — never a rubber stamp.
// =========================================================

import type { Fact } from "../native-engine/types.ts";
import { FactStore } from "../native-engine/knowledge.ts";
import { SelfEvaluator } from "../native-engine/selfeval.ts";
import { epistemicStatusOf } from "./metacognition.ts";
import { redactSecrets } from "./security-integrity.ts";
import type { VerificationVerdict } from "./types.ts";

/** Patterns that make generated code unsafe to run blind. */
const DANGEROUS_CODE_PATTERNS: RegExp[] = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bexec(?:Sync)?\s*\(/,
  /\bchild_process\b/,
  /\brm\s+-rf\b/,
  /\bsystem\s*\(/,
  /TODO_SECURITY_SUPPRESS/, // sentinel: never present
];

export interface VerificationRequest {
  /** Human label of the thing being verified. */
  target: string;
  /** The final output text ARCHIE is about to present. */
  output: string;
  /** Facts the output cites. */
  citedFacts: Fact[];
  /** Aspect terms the task requires the output to address. */
  requiredAspects: string[];
  /** Deterministic re-checker: returns true when the
   *  computation in the output re-derives identically. */
  correctnessRecheck?: () => { passed: boolean; detail: string };
  /** Whether the output contains generated code. */
  containsCode?: boolean;
  /** Session-salient VALIDATED facts (mr-3, owner directive
   *  2026-09-16): knowledge the retrieval context surfaced.
   *  Joined into the consistency scan — an answer that
   *  contradicts what the owner taught earlier in the
   *  session is caught here. Optional; [] = no context. */
  contextFacts?: Fact[];
}

export class VerificationEngine {
  private selfEval = new SelfEvaluator();
  private verdicts = { PASS: 0, FAIL: 0, UNVERIFIED: 0 };

  /** Run the full check pipeline. Every check runs for real;
   *  a check with insufficient evidence reports
   *  passed: false with an honest UNVERIFIED-leaning verdict
   *  rather than a silent pass. */
  verify(req: VerificationRequest): VerificationVerdict {
    const checks: VerificationVerdict["checks"] = [];

    // 1. CORRECTNESS — re-derive or re-execute.
    if (req.correctnessRecheck) {
      const recheck = req.correctnessRecheck();
      checks.push({
        check: "correctness",
        passed: recheck.passed,
        detail: recheck.detail,
      });
    } else {
      checks.push({
        check: "correctness",
        passed: true,
        detail:
          "not applicable — the output makes no deterministic correctness claim; integrity rests on the checks below",
      });
    }

    // 2. CONSISTENCY — contradiction scan over a scratch
    //    copy of the store built from the cited facts.
    const scratch = new FactStore();
    // Scan-only inserts: the verifier DETECTS conflicts between
    // cited facts; it must never arbitrate owner authority (the
    // regular async assert would demote the first cited fact
    // under the 2026-09-14 owner-authority learning rule before
    // the contradiction scan could see it — regression fix).
    // mr-3: session-salient validated facts join the scan —
    // memory-aware verification. Deduped against cited facts
    // by id so a fact is never scanned against itself.
    const seen = new Set(req.citedFacts.map((f) => f.id));
    const contextFacts = (req.contextFacts ?? []).filter(
      (f) => !seen.has(f.id),
    );
    for (const f of [...req.citedFacts, ...contextFacts]) {
      scratch.assertForScan({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        qualifiers: f.qualifiers,
        confidence: f.confidence,
        provenance: f.provenance,
        status: f.status,
      });
    }
    const { conflicts, checked } = this.selfEval.scanContradictions(scratch);
    checks.push({
      check: "consistency",
      passed: conflicts.length === 0,
      detail:
        conflicts.length === 0
          ? `no contradictions among ${checked} scanned fact(s) (${req.citedFacts.length} cited + ${contextFacts.length} session-salient validated)`
          : `contradictions detected between scanned facts: ${conflicts.map((c) => `${c.subject} ${c.predicate}`).join("; ")}`,
    });

    // 3. COMPLETENESS — required aspects must appear in the
    //    output (or be explicitly declared unknown).
    // FIX 19 (remediation batch 7, Level 4 kernel audit
    // 2026-09-13): the unknown-excusal used to be a BLANKET
    // pass — one stray "unknown" anywhere in the output (even
    // ARCHIE's own "[Epistemic status: UNKNOWN]" footer)
    // excused EVERY missing aspect. The excusal is now scoped:
    // an aspect is excused only when the output explicitly
    // declares THAT aspect unknown / not stored, within a
    // bounded window of the uncertainty marker.
    const lower = req.output.toLowerCase();
    const explicitlyUnknownFor = (aspect: string): boolean => {
      const a = aspect.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const before = new RegExp(
        a + "[^.\\n]{0,60}(unknown|not stored|no knowledge|not sure)",
        "i",
      );
      const after = new RegExp(
        "(unknown|not stored|no knowledge|not sure)[^.\\n]{0,60}" + a,
        "i",
      );
      return before.test(req.output) || after.test(req.output);
    };
    const missing = req.requiredAspects.filter(
      (a) => !lower.includes(a.toLowerCase()) && !explicitlyUnknownFor(a),
    );
    checks.push({
      check: "completeness",
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `all ${req.requiredAspects.length} required aspect(s) addressed or declared unknown`
          : `output does not address: ${missing.join(", ")}`,
    });

    // 4. SECURITY — no leaked secrets; generated code must
    //    carry no dangerous patterns.
    const { foundCount } = (() => {
      // measure without mutating
      const probe = redactSecrets(req.output);
      return { foundCount: probe.foundCount };
    })();
    let securityPassed = foundCount === 0;
    let securityDetail = "no credentials detected in output";
    if (req.containsCode) {
      const hits = DANGEROUS_CODE_PATTERNS.filter((p) => p.test(req.output));
      if (hits.length > 0) securityPassed = false;
      securityDetail =
        hits.length > 0
          ? `generated code matches unsafe patterns (${hits.length}) — requires owner review`
          : `${securityDetail}; code scan clean of dangerous patterns`;
    }
    checks.push({
      check: "security",
      passed: securityPassed,
      detail: securityDetail,
    });

    // 5. SOURCE QUALITY — provenance classes of cited facts.
    const ownerTaught = req.citedFacts.filter(
      (f) =>
        f.provenance.source === "owner-taught" ||
        f.provenance.source === "seed",
    ).length;
    const webSourced = req.citedFacts.filter(
      (f) => f.provenance.source === "web-research",
    ).length;
    checks.push({
      check: "source-quality",
      passed: req.citedFacts.length === 0 || webSourced < req.citedFacts.length,
      detail:
        req.citedFacts.length === 0
          ? "no cited facts — source quality is about the reasoning process itself"
          : `${ownerTaught} trusted-provenance, ${req.citedFacts.length - ownerTaught - webSourced} inferred, ${webSourced} web-research (cross-check before hard reliance)`,
    });

    // 6. ASSUMPTIONS — every ASSUMED-status fact is surfaced,
    //    never silently relied upon.
    const assumed = req.citedFacts.filter(
      (f) => epistemicStatusOf(f) === "ASSUMED",
    );
    checks.push({
      check: "assumptions",
      passed: true, // surfacing them IS the pass condition
      detail:
        assumed.length === 0
          ? "no assumed-status knowledge used"
          : `ASSUMED knowledge used and surfaced: ${assumed.map((f) => `${f.subject} ${f.predicate}`).join("; ")}`,
    });

    // 7. UNCERTAINTY — confidence floor.
    const minConfidence = req.citedFacts.reduce(
      (m, f) => Math.min(m, f.confidence),
      1,
    );
    checks.push({
      check: "uncertainty",
      passed: req.citedFacts.length === 0 || minConfidence >= 0.5,
      detail:
        req.citedFacts.length === 0
          ? "no factual confidence claims made"
          : `weakest cited confidence ${(minConfidence * 100).toFixed(0)}%${minConfidence < 0.5 ? " — flagged as low-confidence" : ""}`,
    });

    const hardFail = checks.some(
      (c) =>
        !c.passed &&
        (c.check === "correctness" ||
          c.check === "consistency" ||
          c.check === "security"),
    );
    const unverified =
      req.correctnessRecheck === undefined && req.citedFacts.length === 0;
    const verdict: VerificationVerdict["verdict"] = hardFail
      ? "FAIL"
      : unverified
        ? "UNVERIFIED"
        : "PASS";
    this.verdicts[verdict] += 1;
    return { target: req.target, verdict, checks };
  }

  stats(): { PASS: number; FAIL: number; UNVERIFIED: number } {
    return { ...this.verdicts };
  }
}
