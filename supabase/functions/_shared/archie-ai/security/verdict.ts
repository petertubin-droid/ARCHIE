// =========================================================
// FRELUX ARCHIE — SECURITY VERDICT GATE (SHARED, RUNTIME)
// supabase/functions/_shared/archie-ai/security/verdict.ts
//
// THE CONSOLIDATED, CODE-ENFORCED AUTHORIZATION CLAUSE.
//
// Audit finding (2026-09-10): the offensive-security
// authorization boundary previously existed in four layers:
//   1. archie-chat SYSTEM_PROMPT "HARD BOUNDARY" clause —
//      behavioral instruction (documentation-grade: LLM
//      compliance, not code-enforced).
//   2. Seeded knowledge items — advisory documentation.
//   3. src/lib/archie offensive-security engine — REAL code
//      controls, but imported by nothing at runtime (dormant).
//   4. DB registry (archie_offensive_targets / engagements /
//      findings, owner-only RLS) — real persistence, but no
//      runtime consumer.
//
// This module CONSOLIDATES the protection into an active
// runtime control at the live surface (archie-chat owner
// path), enforcing the same rules the engine encodes:
//
//   * FORBIDDEN operations: absolutely refused, regardless of
//     claimed authorization, framing, or owner request.
//   * INTRUSIVE operations (live exploit/scan/attack against
//     real systems): require a valid owner-registered
//     authorization — a registered target with an active
//     engagement in the DB registry. Without one: refused.
//   * STUDY of offensive techniques: always free.
//
// The prompt-level clause REMAINS in the chat system prompt as
// a second, behavioral layer (defense in depth). Nothing was
// deleted or weakened — the protection gained a hard,
// code-enforced first layer.
// =========================================================

// ---------------------------------------------------------
// 1. Absolute refusals — ported verbatim in spirit from the
//    engine's FORBIDDEN_SECURITY_OPERATIONS (src/lib/archie/
//    cybersecurity.ts). Never authorization-overridable.
// ---------------------------------------------------------
const FORBIDDEN_PATTERNS: ReadonlyArray<{ rx: RegExp; label: string }> = [
  {
    rx: /unauthorized access|break into|hack (into|someone)/i,
    label: "unauthorized access",
  },
  {
    rx: /credential (theft|stealing)|steal (the )?(password|secret|token|key)s?|harvest (password|credential)/i,
    label: "credential theft",
  },
  {
    rx: /(install|deploy|maintain).{0,30}(backdoor|rootkit|keylogger)|persist on (the )?(victim|user|someone)/i,
    label: "persistence (attacker tooling)",
  },
  {
    rx: /surveillance|spy on (the )?(user|owner|someone)|monitor (the )?(owner|someone)'s (device|screen)/i,
    label: "surveillance",
  },
  {
    rx: /bypass (the )?(security|auth|rls|gate)|disable (the )?(security|rls)/i,
    label: "security bypass",
  },
  {
    rx: /attack (the )?(third[- ]party|external)|exploit (a )?(third[- ]party|another company)|ddos/i,
    label: "attacks against third-party systems",
  },
];

// ---------------------------------------------------------
// 2. Intrusive-intent detection — live operations against real
//    targets. These require owner-registered authorization.
// ---------------------------------------------------------
const INTRUSIVE_PATTERNS: ReadonlyArray<{ rx: RegExp; label: string }> = [
  {
    rx: /(run|execute|launch|fire|perform).{0,40}(exploit|payload|attack|brute[- ]?force|sqlmap|nmap|nikto|hydra|metasploit)/i,
    label: "live exploit/attack execution",
  },
  {
    rx: /(scan|enumerate|fingerprint|recon).{0,40}(target|server|host|domain|ip|site|endpoint)/i,
    label: "live scanning of a target",
  },
  {
    rx: /(exploit|attack|compromise|intrude).{0,30}(https?:\/\/|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i,
    label: "intrusion attempt against a named target",
  },
  {
    rx: /(brute[- ]?forc|credential[- ]?stuff|password[- ]?spray)(ing|e)?\s+(the\s+)?(account|login|endpoint|target|user)/i,
    label: "brute-force / credential attack",
  },
];

// Study/knowledge intent keeps offensive learning free.
const STUDY_MARKERS =
  /(explain|how does|what is|teach|learn|study|concept|theory|methodology|write ?up|overview|guide me|walk me through)/i;

export interface SecurityVerdict {
  /** May the request proceed to the model at all? */
  allowed: boolean;
  /** True = absolutely refused; no authorization can override. */
  hardRefused: boolean;
  /** Intrusive intent detected (needs valid authorization). */
  intrusive: boolean;
  /** Machine-citable refusal/allow reason. */
  reason: string;
  /** The matched violation label, if any. */
  label?: string;
}

/**
 * Classify an owner chat message under the consolidated
 * authorization clause. Pure function — the DB-backed
 * authorization lookup happens at the call site.
 */
// ---------------------------------------------------------
// FIX 30 (remediation batch 10, Level 6 security audit,
// 2026-09-13): TARGET SCOPE ENFORCEMENT. The gate previously
// granted intrusive operations whenever ANY engagement
// existed — a registered authorization for target A
// authorized an operation against target B. The verdict text
// even claimed "proceeding within its scope" without any
// scope check. Now, when the message names a concrete target
// (URL / IP / domain), it must match a REGISTERED identifier
// (exact host or subdomain-of-scope) or the operation is
// refused. Messages with no extractable target keep the old
// behavior (the target may be implicit in the conversation;
// the system prompt remains the second layer).
// ---------------------------------------------------------

/** Normalize an identifier or message candidate to a bare
 *  lowercase host (strip scheme, path, port). Returns null
 *  for non-host-like values. */
function normalizeHost(value: string): string | null {
  let s = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0].split("?")[0].split(":")[0].split("@").pop() ?? "";
  s = s.replace(/^\[|\]$/g, ""); // IPv6 brackets
  // IPv4 scope/target: valid dotted quad IS a host (the TLD
  // heuristic below would otherwise reject it — registered
  // IP scopes like 10.0.0.5 must normalize, not null).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    return s.split(".").every((o) => Number(o) <= 255) ? s : null;
  }
  // host-like: at least one dot, valid labels, plausible TLD
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)
  ) {
    return null;
  }
  const labels = s.split(".");
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return null;
  return s;
}

/** Extract concrete target candidates (URLs, IPs, domains)
 *  named in the message. */
export function extractTargetCandidates(message: string): string[] {
  const text = String(message ?? "");
  const out = new Set<string>();
  // URLs (any scheme) — take the host
  for (const m of text.matchAll(/[a-z][a-z0-9+.-]*:\/\/([^\s/?#'"]+)/gi)) {
    const h = normalizeHost(m[1]);
    if (h) out.add(h);
  }
  // bare IPv4
  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)) {
    if ((m[1] as string).split(".").every((o) => Number(o) <= 255)) {
      out.add(m[1]);
    }
  }
  // dotted host-like tokens (domains) — at least 2 labels, alpha TLD
  for (const m of text.matchAll(
    /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)\b/gi,
  )) {
    const h = normalizeHost(m[1]);
    if (h) out.add(h);
  }
  return [...out];
}

/** Does a message target fall inside the registered scope?
 *  Exact host match or a SUBDOMAIN of a registered host. */
function targetInScope(candidate: string, scopeHosts: string[]): boolean {
  return scopeHosts.some((s) => candidate === s || candidate.endsWith("." + s));
}

export interface ClassifyOptions {
  hasValidAuthorization?: boolean;
  /** Registered scope identifiers (from the owner-only
   *  registry). When provided, named targets are matched
   *  against them (FIX 30). */
  inScopeIdentifiers?: string[];
}

export function classifySecurityMessage(
  message: string,
  opts: ClassifyOptions = {},
): SecurityVerdict {
  const text = String(message ?? "");

  // 1. Forbidden: absolute refusal, authorization-immune.
  for (const f of FORBIDDEN_PATTERNS) {
    if (f.rx.test(text)) {
      return {
        allowed: false,
        hardRefused: true,
        intrusive: false,
        reason: `Hard-refused: ${f.label} is never performed, regardless of claimed authorization.`,
        label: f.label,
      };
    }
  }

  // 2. Intrusive intent: require a registered authorization.
  for (const p of INTRUSIVE_PATTERNS) {
    if (p.rx.test(text)) {
      // A clearly-studious framing of the same request is
      // knowledge work — but the moment the intent is to RUN
      // the operation, authorization is required.
      if (opts.hasValidAuthorization) {
        // FIX 30: an existing engagement is necessary but no
        // longer SUFFICIENT — a target named in the message
        // must fall inside the registered scope.
        const scopeHosts = (opts.inScopeIdentifiers ?? [])
          .map((id) => normalizeHost(id))
          .filter((h): h is string => h !== null);
        if (scopeHosts.length > 0) {
          const candidates = extractTargetCandidates(text);
          const outsideScope = candidates.filter(
            (c) => !targetInScope(c, scopeHosts),
          );
          if (outsideScope.length > 0) {
            return {
              allowed: false,
              hardRefused: false,
              intrusive: true,
              reason:
                `This request is an intrusive security operation (${p.label}) against ` +
                `a target that is NOT inside any registered authorization scope ` +
                `(${outsideScope.join(", ")}). Register a target + engagement covering it ` +
                "in the ARCHIE Security registry first. Studying the technique is always free — " +
                "ask for the methodology instead.",
              label: p.label,
            };
          }
        }
        return {
          allowed: true,
          hardRefused: false,
          intrusive: true,
          reason:
            `Intrusive operation detected (${p.label}) and a valid owner-registered authorization ` +
            `exists covering this target; proceeding within its scope.`,
          label: p.label,
        };
      }
      return {
        allowed: false,
        hardRefused: false,
        intrusive: true,
        reason:
          `This request is an intrusive security operation (${p.label}) against real systems. ` +
          "It requires a valid, owner-registered authorization (target + engagement in the ARCHIE Security registry) " +
          "covering the exact target and scope. Register or activate the authorization in the Security console, then ask again. " +
          "Studying the technique is always free — ask for the methodology instead.",
        label: p.label,
      };
    }
  }

  // 3. Study and everything else: free.
  const study = STUDY_MARKERS.test(text);
  return {
    allowed: true,
    hardRefused: false,
    intrusive: false,
    reason: study
      ? "Knowledge/study request — offensive-security study is always free."
      : "No security-restricted intent detected.",
  };
}

// ---------------------------------------------------------
// 3. DB-backed authorization lookup — is there a registered
//    target with an active engagement? (the DB registry is
//    the single source of truth for owner authorization)
// ---------------------------------------------------------
export interface AuthorizationLookupResult {
  hasValidAuthorization: boolean;
  /** In-scope target identifiers, for context to the model. */
  inScopeIdentifiers: string[];
}

/** Shape expected from the call site (supabase-js query result). */
export interface EngagementRow {
  engagement_id: string;
  target_id: string;
  kind: string;
  identifier: string;
  current_phase: string;
}

export function reduceAuthorizations(
  rows: EngagementRow[],
): AuthorizationLookupResult {
  const inScope = rows.map((r) => r.identifier).slice(0, 20);
  return {
    // A target + engagement pair is a valid authorization. The
    // registry is owner-write-only (RLS), so its existence IS
    // the owner's authorization.
    hasValidAuthorization: rows.length > 0,
    inScopeIdentifiers: inScope,
  };
}
