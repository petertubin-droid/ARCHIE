// =========================================================
// ARCHIE PWA ARCHITECTURE — PERMANENT CAPABILITY EXPOSURE
//
// The ARCHIE Owner PWA (/archie) is the Owner's COMPLETE
// mobile command center. This module is the structural
// enforcement of the Owner's standing rule:
//
//   PERMANENT FUTURE-CAPABILITY RULE
//   Whenever a new capability is added to ARCHIE's core
//   system, it must be designed and integrated into the
//   standalone ARCHIE PWA as part of the SAME feature
//   implementation.
//
// Enforcement is NOT aspirational:
//   * assertPwaExposure() fails (and the health check + CI
//     test fail) whenever a required owner capability lacks a
//     PWA surface.
//   * Exceptions require an explicit ownerRestricted reason
//     from the Owner Authority Layer — never silent.
//   * The PWA never gets PWA-only versions, duplicate
//     databases, duplicate intelligence or separate feature
//     implementations: every surface maps to the SAME shared
//     module/component, listed here and verified by tests.
// =========================================================

/**
 * Every owner capability that must be reachable through the
 * PWA. `sharedModule` names the SINGLE implementation both the
 * PWA and the admin console render — one backend, one
 * identity, one permission model.
 */
export interface PwaCapability {
  /** Stable capability id. */
  id: string;
  /** Human label shown in the map. */
  label: string;
  /** The PWA route exposing it (under /archie). */
  route: string;
  /** The SINGLE shared implementation behind it. */
  sharedModule: string;
  /**
   * Only present when the Owner Authority Layer explicitly
   * restricts this capability from the PWA. Required reason.
   */
  ownerRestricted?: string;
}

export const PWA_CAPABILITY_MAP: readonly PwaCapability[] = [
  // Chat / intelligence
  {
    id: "chat",
    label: "ARCHIE chat & intelligence",
    route: "/archie/chat",
    sharedModule: "src/pages/archie/ArchieChat.tsx",
  },
  // Owner Authority & approvals
  {
    id: "owner_authority",
    label: "Owner Authority & approvals",
    route: "/archie/evolution",
    sharedModule: "src/pages/archie/ArchieEvolution.tsx",
  },
  // Memory & knowledge (knowledge core, people, shared stores)
  {
    id: "knowledge",
    label: "Memory & knowledge",
    route: "/archie/knowledge",
    sharedModule: "src/pages/archie/ArchieKnowledge.tsx",
  },
  {
    id: "people",
    label: "People memory",
    route: "/archie/people",
    sharedModule: "src/pages/archie/ArchiePeople.tsx",
  },
  {
    id: "shared",
    label: "Shared stores",
    route: "/archie/shared",
    sharedModule: "src/pages/archie/ArchieShared.tsx",
  },
  // Global learning & language learning
  {
    id: "learning",
    label: "Global & language learning",
    route: "/archie/learning",
    sharedModule: "src/pages/archie/ArchieLearning.tsx",
  },
  {
    id: "terminology",
    label: "Terminology (language memory)",
    route: "/archie/terminology",
    sharedModule: "src/pages/archie/ArchieTerminology.tsx",
  },
  // Coding intelligence + Coding Studio + preview + workspace
  {
    id: "coding",
    label: "Coding Studio: build, edit, test, preview, workspace",
    route: "/archie/coding",
    sharedModule: "src/components/studio/StudioWorkbench.tsx",
  },
  {
    id: "code_intelligence",
    label: "Codebase audit, traces & patch approvals",
    route: "/archie/coding",
    sharedModule: "src/components/archie/CodeIntelligencePanel.tsx",
  },
  // Self-improvement / evolution
  {
    id: "evolution",
    label: "Self-improvement / evolution",
    route: "/archie/evolution",
    sharedModule: "src/pages/archie/ArchieEvolution.tsx",
  },
  // Trusted devices
  {
    id: "devices",
    label: "Trusted devices",
    route: "/archie/devices",
    sharedModule: "src/pages/archie/ArchieDevices.tsx",
  },
  // Security capabilities
  {
    id: "security",
    label: "Security capabilities",
    route: "/archie/security",
    sharedModule: "src/pages/archie/ArchieSecurity.tsx",
  },
  // Migration / backup
  {
    id: "migration",
    label: "Migration & backup",
    route: "/archie/migration",
    sharedModule: "src/pages/archie/ArchieMigration.tsx",
  },
  // System monitoring
  {
    id: "system",
    label: "System monitoring",
    route: "/archie/system",
    sharedModule: "src/pages/archie/ArchieSystem.tsx",
  },
  // Status / control center
  {
    id: "control",
    label: "Status & control",
    route: "/archie/control",
    sharedModule: "src/pages/archie/ArchieControl.tsx",
  },
  // Training, voice, ops
  {
    id: "training",
    label: "ARCHIE training",
    route: "/archie/training",
    sharedModule: "src/pages/archie/ArchieTraining.tsx",
  },
  {
    id: "voice",
    label: "ARCHIE voice",
    route: "/archie/voice",
    sharedModule: "src/pages/archie/ArchieVoice.tsx",
  },
  {
    id: "ops",
    label: "Operations",
    route: "/archie/ops",
    sharedModule: "src/pages/archie/ArchieOps.tsx",
  },
];

/**
 * The rule text — the exact standing instruction from the
 * Owner, surfaced wherever ARCHIE explains its architecture.
 */
export const PWA_FUTURE_CAPABILITY_RULE =
  `Whenever a new capability is added to ARCHIE's core system, it must be automatically designed and integrated into the standalone ARCHIE PWA as part of the same feature implementation. The PWA and desktop/admin interfaces share the same ARCHIE identity, backend, memory, knowledge, projects, coding workspace, evolution state and permissions. No capability may exist in the core system that is intentionally inaccessible from the Owner's PWA, unless the Owner Authority Layer explicitly requires restricted access.` as const;

export interface PwaExposureReport {
  /** True only when every capability is exposed (or explicitly restricted). */
  healthy: boolean;
  /** Capabilities with no PWA surface — integration debt. */
  unexposed: PwaCapability[];
  /** Capabilities explicitly restricted by Owner Authority. */
  restricted: PwaCapability[];
}

/**
 * Health-check hook: called by ARCHIE's verification systems
 * and by CI tests. A new core capability that is not yet
 * mapped here makes this report unhealthy — and the failure
 * names the missing integration, not a vague warning.
 */
export function assertPwaExposure(
  required: readonly string[] = [],
): PwaExposureReport {
  const mappedIds = new Set(PWA_CAPABILITY_MAP.map((c) => c.id));
  const missing = required.filter((id) => !mappedIds.has(id));
  if (missing.length > 0) {
    return {
      healthy: false,
      unexposed: missing.map((id) => ({
        id,
        label: id,
        route: "",
        sharedModule: "",
      })),
      restricted: [],
    };
  }
  const restricted = PWA_CAPABILITY_MAP.filter((c) => c.ownerRestricted);
  const badRestricted = restricted.filter(
    (c) => !c.ownerRestricted || c.ownerRestricted.trim().length < 10,
  );
  if (badRestricted.length > 0) {
    return { healthy: false, unexposed: [], restricted: badRestricted };
  }
  return { healthy: true, unexposed: [], restricted };
}

/**
 * Contract check for adding a new capability: returns the
 * rule text to attach to every new core-capability PR. Used
 * by the capability registry workflow so the requirement is
 * machine-visible, not tribal knowledge.
 */
export function pwaIntegrationRequirement(): string {
  return `New core capability detected. Per the Owner's permanent rule: ${PWA_FUTURE_CAPABILITY_RULE} Add the capability to PWA_CAPABILITY_MAP with its shared module and PWA route in the SAME feature implementation, and extend assertPwaExposure coverage.`;
}
