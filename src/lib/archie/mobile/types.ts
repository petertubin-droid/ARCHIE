// =========================================================
// FRELUX PHASE 8b, ARCHIE MOBILE TYPES
//
// Types for the ARCHIE Mobile Assistant (Free tier), the
// Mobile Security & Secure Data Protection Layer and the
// owner-authorization workflow.
// =========================================================

// ---------------------------------------------------------
// Free mobile capabilities, explicit user permission, one
// consent record each. ARCHIE never assumes device access.
// ---------------------------------------------------------
export type ArchieMobileCapability =
  | "VOICE_INPUT" // voice commands/input (where Android supports)
  | "VOICE_OUTPUT" // ARCHIE speaks responses (browser TTS, output only)
  | "CAMERA" // manually invoked camera access
  | "PHOTOS" // user-selected photos/images
  | "FILES" // user-selected files/documents
  | "LOCATION" // optional location
  | "NOTIFICATIONS" // system notifications
  | "CLIPBOARD" // permitted clipboard actions
  | "OPEN_LINKS" // open FRELUX and supported web links
  | "CALCULATORS" // FRELUX calculator/intelligence access
  | "TEXT_GENERATION" // ARCHIE text generation (free path)
  | "CODE_GENERATION" // ARCHIE code generation (free path)
  | "WEB_INTELLIGENCE"; // permitted web-intelligence access

export interface ArchieConsent {
  capability: ArchieMobileCapability;
  granted: boolean;
  granted_at: string | null;
}

// ---------------------------------------------------------
// Paid capabilities, modular, optional, DISABLED BY DEFAULT
// ---------------------------------------------------------
export type ArchiePaidCapability =
  | "CLOUD_AI_GENERATION" // cloud LLM generation via external fallback
  | "CLOUD_TRANSCRIPTION" // server-side audio transcription
  | "WEB_SEARCH_INTEL"; // TAVILY-backed web search intelligence

export interface ArchiePaidActivation {
  capability: ArchiePaidCapability;
  enabled: boolean;
  activated_at: string | null;
}

// ---------------------------------------------------------
// Device sessions
// ---------------------------------------------------------
export interface ArchieSession {
  id: string;
  device_label: string;
  fingerprint: string;
  current: boolean;
  revoked: boolean;
  revoked_at: string | null;
  last_seen: string;
  created_date: string;
}

// ---------------------------------------------------------
// Protected data vault
// ---------------------------------------------------------
export type ProtectedItemType =
  "PROJECT" | "ESTIMATE" | "REPORT" | "DOCUMENT" | "PLAN" | "OTHER";

export interface ProtectedItem {
  id: string;
  label: string;
  item_type: ProtectedItemType;
  source_ref: string | null;
  storage_path: string;
  cipher: string;
  kdf_salt: string;
  kdf_iterations: number;
  latest_version: number;
  size_bytes: number;
  created_date: string;
  updated_date: string;
}

export interface ProtectedItemVersion {
  id: string;
  item_id: string;
  version: number;
  storage_path: string;
  size_bytes: number;
  checksum: string;
  created_date: string;
}

/** Client-side ciphertext envelope. Plaintext NEVER leaves the device. */
export interface CipherEnvelope {
  v: 1;
  cipher: "AES-256-GCM";
  kdf: { algo: "PBKDF2-SHA256"; salt: string; iterations: number };
  iv: string; // base64
  ciphertext: string; // base64
  created_at: string;
}

// ---------------------------------------------------------
// Security events
// ---------------------------------------------------------
export type SecurityEventKind =
  | "NEW_DEVICE"
  | "SESSION_REVOKED"
  | "ALL_SESSIONS_REVOKED"
  | "PROTECTED_DATA_BACKED_UP"
  | "PROTECTED_DATA_RECOVERED"
  | "PROTECTED_DATA_DELETED"
  | "RECOVERY_COMPLETED"
  | "LOCAL_CACHE_CLEARED"
  | "OWNER_AUTH_SUCCEEDED"
  | "OWNER_AUTH_FAILED"
  | "NON_OWNER_AUTH_ATTEMPT"
  | "RATE_LIMIT_HIT"
  // Phase 8 P4, trusted devices & subscriber intelligence
  | "SUSPICIOUS_DEVICE_DETECTED"
  | "FORBIDDEN_CONSENT_REQUESTED"
  | "DEVICE_TOKEN_ROTATED"
  | "TRUSTED_DEVICE_REVOKED"
  | "DATA_CONSENT_REVOKED";

export interface SecurityEvent {
  id: string;
  kind: SecurityEventKind;
  severity: "info" | "warning" | "critical";
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_date: string;
}

// ---------------------------------------------------------
// Owner authorization
// ---------------------------------------------------------
export type OwnerChangeKind =
  | "CODE_CHANGE"
  | "CALCULATOR_ENGINE_CHANGE"
  | "DETERMINISTIC_LOGIC_CHANGE"
  | "HIGH_RISK_CONFIG_CHANGE"
  | "KNOWLEDGE_PROMOTION"
  /** Portable continuity: backup/migration/restore of ARCHIE state. */
  | "ARCHIE_MIGRATION";

export interface OwnerAuthorizationRecord {
  id: string;
  change_kind: OwnerChangeKind;
  target: string;
  current_version: string | null;
  proposed_version: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  tests_passed: boolean;
  rollback_ref: string | null;
  status: "AUTHORIZED" | "ROLLED_BACK";
  created_date: string;
}
