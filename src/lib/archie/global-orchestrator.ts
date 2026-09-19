// =========================================================
// ARCHIE GLOBAL ORCHESTRATOR — THE PLATFORM STATEMENT (§12)
//
// ARCHIE is NOT "FRELUX AI".
//
// ARCHIE is a general intelligence, learning, reasoning and
// engineering platform that CURRENTLY POWERS FRELUX.
//
//   ┌─────────────────────────────────────────────┐
//   │ ARCHIE — general intelligence platform      │
//   │  · global learning (global-domains)         │
//   │  · website & code inspection (§2)           │
//   │  · coding intelligence (§3)                  │
//   │  · authorized security intelligence (§4)    │
//   │  · global market research (§5)              │
//   │  · proactive reasoning (§6)                 │
//   │  · high-throughput computation (§7)         │
//   │  · self-evolution (§8, evolution/)          │
//   │  · knowledge validation (§11)               │
//   └─────────────┬───────────────────────────────┘
//                 │ environment grants (knowledge-core)
//   ┌─────────────▼───────────────┐
//   │ FRELUX — an environment      │
//   │ ARCHIE powers and learns    │
//   │ from, governed by core-      │
//   │ orchestrator.ts              │
//   └─────────────────────────────┘
//
// The knowledge horizon is global. The AUTHORITY boundary
// is the Owner (capability-authority.ts). FRELUX-specific
// requests still route through the existing core
// orchestrator — nothing there is bypassed or replaced.
// =========================================================

import {
  GLOBAL_EXPANSION_DOMAINS,
  AUTHORIZATION_GATED_DOMAINS,
} from "./global-domains";
import {
  checkAuthority,
  AuthorizationRegistry,
  type ArchieAuthority,
} from "./capability-authority";
import {
  evaluateSecurityWork,
  type SecurityWorkRequest,
} from "./authorized-security";
import {
  authorizeInspection,
  type InspectionLayer,
} from "./website-inspection";
import { canDiscoveryTransition } from "./domain-discovery";
import { archieDomains } from "./domains";

/** What world a request addresses. */
export type RequestWorld =
  | "GLOBAL_KNOWLEDGE" // any domain, learning/reasoning
  | "FRELUX_ENVIRONMENT" // the FRELUX app — core-orchestrator
  | "SECURITY_WORK" // authorized security operations
  | "WEBSITE_INSPECTION" // authorized URL inspection
  | "MARKET_RESEARCH" // global market observations
  | "COMPUTATION" // high-throughput deterministic compute
  | "SELF_EVOLUTION"; // the evolution change pipeline

/** Classification of an incoming request. */
export interface GlobalRequest {
  world: RequestWorld;
  /** The domain(s) involved, when known. */
  domains?: readonly string[];
  /** The concrete action description. */
  action: string;
  /** A consequential action needs Owner authority. */
  authorityRequired?: ArchieAuthority;
  scope?: string;
}

export type GlobalDecision =
  | {
      ok: true;
      world: RequestWorld;
      route: string;
      authorityBasis: "CAPABILITY_FREE" | "OWNER_AUTHORIZED";
      authorizationId?: string;
    }
  | { ok: false; error: string; needsOwner?: boolean };

/** Ensure ARCHIE never refuses to LEARN about a domain:
 *  every registered domain (seeded + global expansion) is
 *  studyable. No fixed knowledge boundary exists. */
export function isStudyableDomain(key: string): boolean {
  return (
    archieDomains.list().some((d) => d.key === key) ||
    GLOBAL_EXPANSION_DOMAINS.some((d) => d.key === key)
  );
}

/** Security domains are studyable but their OPERATIONAL use
 *  is authorization-gated (global-domains.ts). */
export function isOperationallyGated(key: string): boolean {
  return AUTHORIZATION_GATED_DOMAINS.has(key);
}

/**
 * The single routing decision for any request. Capabilities
 * are free; consequential actions demand recorded owner
 * authority. FRELUX-environment requests are routed to the
 * existing core orchestrator with its own governance intact.
 */
export function route(
  req: GlobalRequest,
  registry: AuthorizationRegistry,
): GlobalDecision {
  // Unknown domains route to GLOBAL_KNOWLEDGE learning —
  // and may enter the discovery lifecycle.
  if (req.domains && req.domains.length > 0) {
    for (const d of req.domains) {
      if (!isStudyableDomain(d)) {
        // Not refused: it becomes a discovery candidate.
        if (!canDiscoveryTransition("DISCOVERED", "CLASSIFIED")) {
          return {
            ok: false,
            error: `Domain "${d}" unknown and discovery is unavailable.`,
          };
        }
        // Route as global learning with a discovery note.
        return {
          ok: true,
          world: "GLOBAL_KNOWLEDGE",
          route: `new-domain-discovery:${d}`,
          authorityBasis: "CAPABILITY_FREE",
        };
      }
    }
  }

  switch (req.world) {
    case "GLOBAL_KNOWLEDGE":
    case "MARKET_RESEARCH":
      // Learning and research are free capabilities.
      return {
        ok: true,
        world: req.world,
        route:
          req.world === "GLOBAL_KNOWLEDGE"
            ? "knowledge-pipeline"
            : "global-markets",
        authorityBasis: "CAPABILITY_FREE",
      };

    case "COMPUTATION":
      return {
        ok: true,
        world: "COMPUTATION",
        route: "computation-engine",
        authorityBasis: "CAPABILITY_FREE",
      };

    case "FRELUX_ENVIRONMENT":
      // FRELUX governance lives in core-orchestrator.ts;
      // consequential FRELUX actions need owner authority here too.
      if (req.authorityRequired) {
        const decision = checkAuthority(
          { authority: req.authorityRequired, scope: req.scope },
          registry,
        );
        if (!decision.allowed) {
          return { ok: false, error: decision.reason, needsOwner: true };
        }
        return {
          ok: true,
          world: "FRELUX_ENVIRONMENT",
          route: "core-orchestrator",
          authorityBasis: "OWNER_AUTHORIZED",
          authorizationId: decision.authorizationId,
        };
      }
      return {
        ok: true,
        world: "FRELUX_ENVIRONMENT",
        route: "core-orchestrator",
        authorityBasis: "CAPABILITY_FREE",
      };

    case "SELF_EVOLUTION":
      // The evolution pipeline has its own owner gates
      // (evolution/authority.ts); production changes are NEVER
      // ARCHIE-approved. Routing there is a free capability —
      // every consequential stage inside is owner-gated.
      return {
        ok: true,
        world: "SELF_EVOLUTION",
        route: "evolution-change-pipeline",
        authorityBasis: "CAPABILITY_FREE",
      };

    case "WEBSITE_INSPECTION": {
      const url = req.scope ?? "";
      const auth = authorizeInspection(url);
      if (!auth.ok)
        return {
          ok: false,
          error: auth.error ?? "Inspection authorization failed.",
        };
      return {
        ok: true,
        world: "WEBSITE_INSPECTION",
        route: "website-inspection-pipeline",
        authorityBasis: "CAPABILITY_FREE",
      };
    }

    case "SECURITY_WORK": {
      // evaluateSecurityWork needs the operation phrasing and target.
      const secReq: SecurityWorkRequest = {
        kind: "AUTHORIZED_PENTEST_EXECUTION",
        context: req.authorityRequired ? "EXECUTION" : "STUDY",
        operation: req.action,
        target: req.scope
          ? { identifier: req.scope, environment: "REAL_SYSTEM" }
          : undefined,
      };
      const verdict = evaluateSecurityWork(secReq, registry);
      if (!verdict.allowed) {
        return {
          ok: false,
          error: verdict.reason,
          needsOwner: !verdict.hardRefused,
        };
      }
      return {
        ok: true,
        world: "SECURITY_WORK",
        route: `authorized-security:${verdict.basis}`,
        authorityBasis:
          verdict.basis === "STUDY" ? "CAPABILITY_FREE" : "OWNER_AUTHORIZED",
      };
    }

    default:
      return { ok: false, error: "Unknown request world." };
  }
}

/** The platform identity statement — used by UI and docs. */
export const ARCHIE_IDENTITY = {
  is: "A general intelligence, learning, reasoning and engineering platform.",
  powers: "Currently powers FRELUX and learns from it.",
  knowledge_horizon:
    "Global — any legitimate domain is studyable; domains are data.",
  authority_boundary:
    "The Owner is the only authority limit. Capabilities are broad; consequential actions are authorization-gated.",
  never: [
    "bypass owner authorization",
    "approve its own production changes",
    "weaken the Owner Authority Layer",
    "present unverified information as fact",
    "attack, access or compromise systems without authorization",
    "fabricate crawl, inspection or computation results",
  ],
} as const;

/** Inspection layers exposed to the UI as inspectable. */
export const INSPECTABLE_LAYERS: readonly InspectionLayer[] = [
  "frontend_architecture",
  "backend_architecture",
  "api_surface",
  "javascript_typescript",
  "html_css",
  "frameworks",
  "database_architecture",
  "performance",
  "accessibility",
  "seo",
  "security_posture",
  "dependencies",
  "public_technical_info",
  "observable_behavior",
];

export { GLOBAL_EXPANSION_DOMAINS };
