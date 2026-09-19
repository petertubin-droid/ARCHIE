// =========================================================
// FRELUX PHASE 9, REUSABLE ARCHIE KNOWLEDGE CORE
//
// ARCHIE's knowledge is NOT trapped inside FRELUX. This module
// is the controlled access layer:
//
//   ARCHIE KNOWLEDGE CORE → FRELUX → FUTURE AUTHORIZED APPS
//
// Applications consume ARCHIE capabilities through EXPLICIT
// grants (application_id + allowed scopes + allowed domains).
// Isolation rules (spec §9, §18.11, §18.17):
//  - USER-scope knowledge requires explicit end-user consent
//    and NEVER becomes global ARCHIE knowledge automatically.
//  - An application only sees the scopes/domains in its grant.
//  - FRELUX itself is an application with a grant (self-host).
// =========================================================

import { archieDomains } from "./domains";
import type { KnowledgeCoreGrant, KnowledgeCoreQuery } from "./phase9-types";

type KnowledgeScope = "GLOBAL" | "REGIONAL" | "PROJECT" | "PROPERTY" | "USER";

/** The scopes an application may NEVER hold by default. */
const CONSENT_REQUIRED_SCOPES: ReadonlySet<KnowledgeScope> = new Set(["USER"]);

/** FRELUX's own grant: full domain access, no USER scope
 *  without the same consent rules. */
export const FRELUX_SELF_GRANT: KnowledgeCoreGrant = {
  application_id: "frelux",
  application_label: "FRELUX (self)",
  scopes: ["GLOBAL", "REGIONAL", "PROJECT", "PROPERTY"],
  domains: [], // empty = resolved dynamically; see resolveGrant
  user_scope_requires_consent: true,
};

/**
 * The grant registry. Future authorized applications register
 * here (or via the DB mirror); grants are Owner/Admin-managed.
 */
export class KnowledgeCore {
  private grants = new Map<string, KnowledgeCoreGrant>();

  constructor(seed: KnowledgeCoreGrant[] = [FRELUX_SELF_GRANT]) {
    for (const g of seed) this.grants.set(g.application_id, g);
  }

  /** Owner/Admin action: register a consuming application. */
  registerApplication(grant: KnowledgeCoreGrant): void {
    if (this.grants.has(grant.application_id)) {
      throw new Error(
        `Application "${grant.application_id}" already registered.`,
      );
    }
    if (grant.user_scope_requires_consent !== true) {
      throw new Error(
        "USER-scope access must always require explicit consent in the grant.",
      );
    }
    this.grants.set(grant.application_id, grant);
  }

  getGrant(applicationId: string): KnowledgeCoreGrant | undefined {
    return this.grants.get(applicationId);
  }

  /**
   * Validate a knowledge-core query against the grant.
   * Throws with a precise reason on any violation:
   *  - unknown application
   *  - scope not granted
   *  - domain not granted
   *  - USER scope without explicit consent
   */
  authorizeQuery(query: KnowledgeCoreQuery): {
    grant: KnowledgeCoreGrant;
    authorized_scopes: KnowledgeScope[];
    authorized_domains: string[];
  } {
    const grant = this.grants.get(query.application_id);
    if (!grant) {
      throw new Error(
        `Unknown application "${query.application_id}". Knowledge-core access requires an Owner-registered grant.`,
      );
    }
    for (const s of query.scopes) {
      if (!grant.scopes.includes(s)) {
        throw new Error(
          `Application "${query.application_id}" is not granted scope ${s}.`,
        );
      }
      if (CONSENT_REQUIRED_SCOPES.has(s) && query.user_consent !== true) {
        throw new Error(
          `Scope ${s} requires explicit end-user consent for every query.`,
        );
      }
    }
    // Domain access: empty grant domains = "all registered
    // domains" (FRELUX self); otherwise exact matching.
    let authorized_domains: string[];
    if (grant.domains.length === 0) {
      authorized_domains = archieDomains.list().map((d) => d.key);
    } else {
      authorized_domains = [...grant.domains];
    }
    for (const d of query.domains) {
      if (!authorized_domains.includes(d)) {
        throw new Error(
          `Application "${query.application_id}" is not granted domain "${d}".`,
        );
      }
    }
    return {
      grant,
      authorized_scopes: [...query.scopes],
      authorized_domains,
    };
  }

  /**
   * Isolation guard (§9, §18.11): USER-private knowledge must
   * never leak into shared scopes. Enforced at the query layer:
   * a query cannot combine USER scope with GLOBAL/REGIONAL
   * export semantics — private data stays private.
   */
  assertNoPrivateLeak(query: KnowledgeCoreQuery): void {
    if (query.scopes.includes("USER") && query.scopes.length > 1) {
      throw new Error(
        "USER-scope queries must be issued alone; private knowledge never mixes with shared-scope queries.",
      );
    }
  }

  /** Full authorize + isolate pipeline for a query. */
  requestKnowledge(query: KnowledgeCoreQuery): {
    grant: KnowledgeCoreGrant;
    scopes: KnowledgeScope[];
    domains: string[];
    region?: string;
  } {
    this.assertNoPrivateLeak(query);
    const { grant, authorized_scopes, authorized_domains } =
      this.authorizeQuery(query);
    return {
      grant,
      scopes: authorized_scopes,
      domains: query.domains.length ? query.domains : authorized_domains,
      region: query.region,
    };
  }
}

/** Singleton core used by FRELUX services. */
export const archieKnowledgeCore = new KnowledgeCore();
