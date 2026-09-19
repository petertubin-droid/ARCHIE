// =========================================================
// FRELUX PHASE 9, OPEN-ENDED DOMAIN DISCOVERY & REGISTRATION
//
// ARCHIE can register new knowledge domains without redesign
// (spec §2, §16, §18.2). Lifecycle (enforced state machine):
//
//   DISCOVER → CLASSIFY → ACQUIRE → STRUCTURE → VERIFY →
//   EVALUATE → VERSION → REGISTER
//
// RULES:
//  - Registration is a REQUEST reviewed and completed by an
//    admin. ARCHIE never self-registers a domain.
//  - Every registered domain inherits FRELUX's security,
//    provenance, verification and governance framework.
//  - Risk class decides the verification bar: high-risk
//    domains (structural/foundation/safety) can NEVER be
//    auto-promoted — inherited from the Phase 8 registry.
//  - The architecture core (architecture) stays primary and
//    can never be displaced by a new registration.
// =========================================================

import { archieDomains, PROTECTED_DOMAIN_KEYS } from "./domains";
import type {
  DomainDiscoveryState,
  DomainRegistrationRequest,
} from "./phase9-types";

export const DISCOVERY_TRANSITIONS: Record<
  DomainDiscoveryState,
  readonly DomainDiscoveryState[]
> = {
  DISCOVERED: ["CLASSIFIED", "REJECTED"],
  CLASSIFIED: ["ACQUIRED", "REJECTED"],
  ACQUIRED: ["STRUCTURED", "REJECTED"],
  STRUCTURED: ["VERIFIED", "REJECTED"],
  VERIFIED: ["EVALUATED", "REJECTED"],
  EVALUATED: ["VERSIONED", "REJECTED"],
  VERSIONED: ["REGISTERED", "REJECTED"],
  REGISTERED: [],
  REJECTED: [],
};

export function canDiscoveryTransition(
  from: DomainDiscoveryState,
  to: DomainDiscoveryState,
): boolean {
  return DISCOVERY_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Validates a registration request before the lifecycle starts. */
export function validateRegistrationRequest(
  req: DomainRegistrationRequest,
): { ok: true } | { ok: false; error: string } {
  const key = req.proposed_key;
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return {
      ok: false,
      error: "Domain key must be snake_case starting with a letter.",
    };
  }
  if (archieDomains.exists(key)) {
    return {
      ok: false,
      error: `Domain "${key}" already exists in the registry.`,
    };
  }
  if (PROTECTED_DOMAIN_KEYS.has(key)) {
    return {
      ok: false,
      error: `Key "${key}" collides with a protected domain and cannot be registered.`,
    };
  }
  if (!req.label?.trim() || !req.rationale?.trim()) {
    return { ok: false, error: "Label and rationale are required." };
  }
  if (req.knowledge_sources.length === 0) {
    return {
      ok: false,
      error: "§16: a domain must declare at least one knowledge source.",
    };
  }
  if (req.verification_requirements.length === 0) {
    return {
      ok: false,
      error:
        "§16: a domain must declare its verification requirements (it inherits the governance framework).",
    };
  }
  if (!req.provenance.discovered_by || !req.provenance.discovered_at) {
    return {
      ok: false,
      error: "Provenance (discovered_by, discovered_at) is required.",
    };
  }
  return { ok: true };
}

/** One discovery in flight. */
export interface DomainDiscoveryRecord {
  request: DomainRegistrationRequest;
  state: DomainDiscoveryState;
  /** Review notes accumulated through the lifecycle. */
  notes: string[];
  /** True once an ADMIN has approved the REGISTERED step. */
  admin_approved: boolean;
}

/**
 * The discovery lifecycle runner. ARCHIE proposes; ADMINS act.
 */
export class DomainDiscoveryPipeline {
  private records = new Map<string, DomainDiscoveryRecord>();

  /** Step 1 — DISCOVER: ARCHIE (or anyone) files a request. */
  discover(req: DomainRegistrationRequest): DomainDiscoveryRecord {
    const v = validateRegistrationRequest(req);
    if (!v.ok) throw new Error(v.error);
    if (this.records.has(req.proposed_key)) {
      throw new Error(
        `A discovery for "${req.proposed_key}" is already in flight.`,
      );
    }
    const rec: DomainDiscoveryRecord = {
      request: req,
      state: "DISCOVERED",
      notes: [],
      admin_approved: false,
    };
    this.records.set(req.proposed_key, rec);
    return rec;
  }

  /** Lifecycle advance. ARCHIE may run DISCOVER→VERSIONED;
   *  only an admin may REGISTER. */
  advance(
    key: string,
    to: DomainDiscoveryState,
    opts: { note?: string; by_admin?: boolean } = {},
  ): DomainDiscoveryRecord {
    const rec = this.records.get(key);
    if (!rec) throw new Error(`No in-flight discovery for "${key}".`);

    if (to === "REGISTERED") {
      if (!opts.by_admin) {
        throw new Error(
          "Domain registration requires explicit admin approval. ARCHIE never self-registers knowledge domains.",
        );
      }
      rec.admin_approved = true;
    }
    if (to === "REJECTED" && !opts.by_admin) {
      // ARCHIE may self-reject its own proposal early (a
      // classification failure, for example) — allowed.
    }
    if (!canDiscoveryTransition(rec.state, to)) {
      throw new Error(`Invalid lifecycle transition ${rec.state} → ${to}.`);
    }
    if (opts.note) rec.notes.push(`${to}: ${opts.note}`);
    rec.state = to;

    if (to === "REGISTERED") {
      // Inherit the governance framework: register into the
      // Phase 8 domain registry with the declared risk class.
      archieDomains.addDomain({
        key: rec.request.proposed_key,
        label: rec.request.label,
        description: rec.request.description,
        is_core: false, // architecture is the ONLY core domain
        risk_class: rec.request.risk_class,
        active: true,
      });
    }
    return rec;
  }

  get(key: string): DomainDiscoveryRecord | undefined {
    return this.records.get(key);
  }
}

/**
 * Convenience runner that executes the ARCHIE-side lifecycle
 * (DISCOVER → CLASSIFY → ACQUIRE → STRUCTURE → VERIFY →
 * EVALUATE → VERSIONED) and stops for admin review. §2 flow:
 * DISCOVER → CLASSIFY → ACQUIRE → STRUCTURE → VERIFY →
 * EVALUATE → VERSION → REGISTER.
 */
export function runDiscoveryToReview(
  pipeline: DomainDiscoveryPipeline,
  req: DomainRegistrationRequest,
): DomainDiscoveryRecord {
  pipeline.discover(req);
  const key = req.proposed_key;
  pipeline.advance(key, "CLASSIFIED", { note: req.rationale });
  pipeline.advance(key, "ACQUIRED", {
    note: `${req.knowledge_sources.length} source(s) declared`,
  });
  pipeline.advance(key, "STRUCTURED");
  pipeline.advance(key, "VERIFIED", {
    note: "verification requirements recorded",
  });
  pipeline.advance(key, "EVALUATED", { note: `risk class ${req.risk_class}` });
  pipeline.advance(key, "VERSIONED", { note: "v1 pending registration" });
  return pipeline.get(key)!;
}
