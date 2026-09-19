// =========================================================
// FRELUX ARCHIE PORTABLE CONTINUITY & MIGRATION — TYPES
//
// Spec: "ARCHIE Portable Continuity & Migration System".
//
// A migration package is a real, verifiable ZIP file containing
// ARCHIE's portable software state. It can be moved to a USB
// drive, a PC, a VPS or a cloud server, verified, and — with
// explicit owner authorization — restored.
//
// Three modes (spec §2):
//   BACKUP  — a recoverable snapshot of portable state
//   MIGRATE — a package intended to transfer ARCHIE to another
//             computing environment (adds code reference,
//             container definitions and restore documentation)
//   RESTORE — verify + restore from a previously created package
//
// Non-goals (spec §1, §15): the package NEVER contains the
// physical CPU, the AI model itself, or any secret. The
// destination environment supplies CPU/RAM/runtime; secrets are
// re-authorized by the owner on the new environment.
// =========================================================

/** The three migration modes (spec §2). */
export type MigrationMode = "BACKUP" | "MIGRATE";

/** Package type mirrors the mode that produced it. */
export type MigrationPackageType = "BACKUP" | "MIGRATION";

/** Lifecycle states for a migration operation (spec §23). */
export type MigrationStatus =
  | "CREATED"
  | "VERIFIED"
  | "EXPORTED"
  | "TRANSFERRED"
  | "IMPORTING"
  | "RESTORED"
  | "FAILED"
  | "CANCELLED"
  | "ROLLED_BACK";

/** Progress phases shown in the Migration Center (spec §13). */
export type MigrationPhase =
  | "IDLE"
  | "PREPARING"
  | "COLLECTING"
  | "PACKAGING"
  | "VERIFYING"
  | "READY"
  | "EXPORTING"
  | "IMPORTING"
  | "COMPLETE"
  | "FAILED"
  | "CANCELLED";

/** Component ids that may appear in a package (spec §3/§4).
 * Anything not in this list inside a manifest is REJECTED by
 * the verifier — a package cannot smuggle in new components
 * (spec §24 security boundary). */
export const PACKAGE_COMPONENT_IDS = [
  "manifest",
  "application",
  "memory",
  "language-memory",
  "evolution",
  "database",
  "configuration",
  "docker",
  "documentation",
  "checksums",
] as const;

export type PackageComponentId = (typeof PACKAGE_COMPONENT_IDS)[number];

/** A single named file inside a component. */
export interface PackageFile {
  /** Path inside the package, e.g. "language-memory/profiles.json" */
  path: string;
  /** UTF-8 content. Binary content is base64 with encoding:"base64". */
  content: string;
  encoding?: "utf8" | "base64";
}

/** One collected component of the package. */
export interface PackageComponent {
  id: PackageComponentId;
  files: PackageFile[];
  /** Human-readable note about provenance, e.g. "16 rows from archie_language_profiles". */
  summary: string;
}

/** Integrity record for one file (spec §7). */
export interface ChecksumRecord {
  path: string;
  algorithm: "sha256";
  /** Hex digest of the file bytes. */
  hash: string;
  /** Byte length of the file content. */
  bytes: number;
}

/** The migration manifest (spec §6) — real values only. */
export interface MigrationManifest {
  /** Package format compatibility version (spec §6). */
  migrationCompatibilityVersion: number;
  packageId: string;
  packageType: MigrationPackageType;
  archieVersion: string;
  freluxVersion: string;
  createdAt: string;
  sourceEnvironment: {
    /** Logical ARCHIE identity — survives device changes (spec §9). */
    archieInstallationId: string;
    /** Physical source: "frelux-pwa" on a phone/PC browser. */
    platform: "frelux-pwa";
    /** Honest device description of the exporting browser. */
    userAgent: string;
    /** True when export ran with limited connectivity (spec §25). */
    createdOffline: boolean;
  };
  /** Minimum requirements for a restore environment (spec §14). */
  architectureRequirements: {
    runtime: string;
    /** Database provider the portable state expects. */
    databaseProvider: "supabase";
    /** Supabase project the state originated from (ref). */
    databaseProjectRef: string;
  };
  /** Highest applied DB migration version at export time. */
  databaseSchemaVersion: string;
  /** Format version of the exported language memory. */
  languageMemoryVersion: number;
  /** Format version of the exported evolution history. */
  evolutionMemoryVersion: number;
  includedComponents: PackageComponentId[];
  excludedComponents: Array<{
    id: PackageComponentId;
    reason: string;
  }>;
  /** Secret policy — always reflected honestly (spec §5). */
  secretsIncluded: false;
  packageSizeBytes: number;
  integrity: {
    algorithm: "sha256";
    /** Hex digest over the checksums.json file itself. */
    checksumsFileHash: string;
  };
  owner: {
    /** Authorized-by record id from the owner-auth system. */
    authorizationId: string | null;
  };
}

/** A complete in-memory package, ready to be zipped. */
export interface MigrationPackage {
  manifest: MigrationManifest;
  components: PackageComponent[];
  checksums: ChecksumRecord[];
}

/** Migration audit record (spec §23). */
export interface MigrationHistoryRecord {
  id: string;
  packageId: string;
  mode: MigrationMode | "RESTORE";
  status: MigrationStatus;
  sourceEnvironment: string;
  destinationEnvironment: string;
  archieVersion: string;
  /** id of the owner-authorization record that approved the operation. */
  ownerAuthorizationRecordId: string | null;
  createdAt: string;
  /** Lifecycle events appended during the operation (append-only audit). */
  events: string[];
  componentsIncluded: string[];
  componentsExcluded: string[];
  verificationResult: string | null;
  restorationResult: string | null;
  errors: string[];
}

/** Verification outcome (spec §7). Failures STOP restoration. */
export interface PackageVerificationResult {
  ok: boolean;
  manifest: MigrationManifest | null;
  /** Every problem found — surfaced to the owner verbatim. */
  errors: string[];
  warnings: string[];
}

/** Memory handling choice at restore time (spec §17). */
export type RestoreMemoryMode =
  "KEEP_EXISTING_MEMORY" | "RESTORE_PORTABLE_SNAPSHOT";

/** One planned restoration step. */
export interface RestoreStep {
  component: PackageComponentId;
  /** Destination table — must be in RESTORE_TABLE_ALLOWLIST. */
  targetTable: string;
  mode: "upsert-merge";
  rowCount: number;
  description: string;
}

/** Full restore plan, shown to the owner BEFORE anything runs. */
export interface RestorePlan {
  packageId: string;
  memoryMode: RestoreMemoryMode;
  steps: RestoreStep[];
  skipped: Array<{ component: PackageComponentId; reason: string }>;
  warnings: string[];
}

/** Progress callback for long operations (spec §13). */
export interface MigrationProgress {
  phase: MigrationPhase;
  /** 0..1 when meaningful, else null. */
  fraction: number | null;
  detail: string;
}
