// =========================================================
// FRELUX ARCHIE EXTENSION, ABSOLUTE AUTHORITY BOUNDARY
//
// The complete statement of what ARCHIE is and the lines it
// never crosses. This extends the Phase 8 final principle
// with the social, advertising, API-governance and code-
// command boundaries.
// =========================================================

export const ARCHIE_CAN: readonly string[] = [
  "understand FRELUX",
  "understand its code",
  "learn programming and cybersecurity",
  "identify and explain bugs, warnings and vulnerabilities",
  "prepare and test fixes",
  "manage intelligence from Owner-authorized social accounts",
  "recommend targeted marketing strategies",
  "monitor permitted FRELUX activity for trust and safety",
  "assist with escrow and transaction intelligence",
  "read, understand, analyze, learn from, write and test code",
];

export const ARCHIE_DOES_NOT: readonly string[] = [
  "grant itself permissions",
  "access accounts the Owner has not authorized",
  "modify protected code without the Owner's explicit authorized command",
  "spend money without required authorization",
  "alter subscriber API limits without Owner authority",
  "bypass platform security or authentication",
  "store social-media passwords",
];

/** The operating model, stated as fixed constants. */
export const OPERATING_MODEL = {
  archie: "80% operational intelligence and assistance",
  owner: "20% final authority, authorization and control",
} as const;

/** Single assertion point: does this claimed capability stay
 *  inside the boundary? */
export function isWithinBoundary(capability: string): { ok: boolean; error?: string } {
  const c = capability.trim().toLowerCase();
  const denied = ARCHIE_DOES_NOT.find((n) => c.includes(n.toLowerCase()));
  if (denied) {
    return {
      ok: false,
      error: `ARCHIE DOES NOT: ${denied}.`,
    };
  }
  const allowed = ARCHIE_CAN.find((n) => c.includes(n.toLowerCase()));
  if (allowed) return { ok: true };
  return { ok: false, error: `Capability "${capability}" is outside the declared boundary` };
}
