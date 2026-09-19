// =========================================================
// FRELUX ARCHIE MIGRATION — PACKAGE VERIFIER (spec §7, §14,
// §20, §21, §24)
//
// A package from a USB drive is UNTRUSTED until this passes:
//   1. Read manifest (must parse, must claim NO secrets)
//   2. Verify every file's SHA-256 against checksums.json
//   3. Verify checksums.json against the manifest hash
//   4. Detect unknown/extra/missing files (corruption, tampering)
//   5. Check format compatibility
//   6. Scan for embedded secrets → STOP restoration
//   7. Scan for authority-layer modifications → STOP
//
// Integrity failure = STOP. No partial, automatic restore.
// =========================================================

import { strFromU8, unzipSync } from "fflate";
import { sha256Hex, verifyFile } from "./checksums";
import { PACKAGE_COMPONENT_IDS } from "./types";
import type {
  ChecksumRecord,
  MigrationManifest,
  PackageVerificationResult,
} from "./types";
import { scanFilesForSecrets, type SecretScanHit } from "./secrets";

const ROOT = "ARCHIE-MIGRATION";
const MANIFEST_PATH = `${ROOT}/manifest.json`;
const CHECKSUMS_PATH = `${ROOT}/checksums/checksums.json`;

/** Package format this build of ARCHIE understands. */
export const SUPPORTED_COMPATIBILITY_VERSION = 1;

export interface UnzippedPackage {
  manifest: MigrationManifest;
  manifestJson: string;
  checksums: ChecksumRecord[];
  /** Raw checksums.json text exactly as shipped (hash input). */
  checksumsJson: string;
  /** Component files (paths relative to package root). */
  files: Array<{ path: string; content: string }>;
}

/** Unzip + parse. Throws with an owner-readable message on garbage input. */
export function unzipPackage(zip: Uint8Array): UnzippedPackage {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(zip);
  } catch {
    throw new Error(
      "This file is not a valid ARCHIE migration package (unreadable ZIP).",
    );
  }
  const manifestRaw = raw[MANIFEST_PATH];
  if (!manifestRaw) {
    throw new Error(
      "No manifest.json found — this is not an ARCHIE migration package.",
    );
  }
  const manifestJson = strFromU8(manifestRaw);
  let manifest: MigrationManifest;
  try {
    manifest = JSON.parse(manifestJson) as MigrationManifest;
  } catch {
    throw new Error("manifest.json is corrupted (invalid JSON).");
  }
  const checksumsRaw = raw[CHECKSUMS_PATH];
  if (!checksumsRaw) {
    throw new Error(
      "No checksums.json found — package integrity cannot be verified.",
    );
  }
  let checksums: ChecksumRecord[];
  try {
    checksums = (
      JSON.parse(strFromU8(checksumsRaw)) as { files: ChecksumRecord[] }
    ).files;
  } catch {
    throw new Error("checksums.json is corrupted (invalid JSON).");
  }
  const files: UnzippedPackage["files"] = [];
  for (const [path, bytes] of Object.entries(raw)) {
    if (path === MANIFEST_PATH || path === CHECKSUMS_PATH) continue;
    if (!path.startsWith(`${ROOT}/`)) {
      files.push({ path: `__ROOT__/${path}`, content: strFromU8(bytes) });
      continue;
    }
    files.push({
      path: path.slice(ROOT.length + 1),
      content: strFromU8(bytes),
    });
  }
  return {
    manifest,
    manifestJson,
    checksums,
    checksumsJson: strFromU8(checksumsRaw),
    files,
  };
}

function validateManifestShape(
  manifest: MigrationManifest,
  errors: string[],
): void {
  if (!manifest.packageId || typeof manifest.packageId !== "string") {
    errors.push("Manifest has no package ID.");
  }
  if (manifest.secretsIncluded !== false) {
    errors.push(
      "Manifest claims secrets are included — ARCHIE migration packages must never contain secrets.",
    );
  }
  if (!manifest.createdAt || Number.isNaN(Date.parse(manifest.createdAt))) {
    errors.push("Manifest has an invalid creation date.");
  }
  if (!manifest.sourceEnvironment?.archieInstallationId) {
    errors.push("Manifest has no ARCHIE installation identity.");
  }
  if (!manifest.integrity?.checksumsFileHash) {
    errors.push("Manifest has no integrity hash — package cannot be verified.");
  }
  if (typeof manifest.migrationCompatibilityVersion !== "number") {
    errors.push("Manifest has no migration compatibility version.");
  }
}

/**
 * Full verification pipeline. Returns ok:false with explicit
 * reasons on ANY problem — restoration must STOP (spec §7).
 */
export async function verifyPackage(
  zip: Uint8Array,
): Promise<PackageVerificationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let unzipped: UnzippedPackage;
  try {
    unzipped = unzipPackage(zip);
  } catch (err) {
    return {
      ok: false,
      manifest: null,
      errors: [(err as Error).message],
      warnings,
    };
  }
  const { manifest, checksums, checksumsJson, files } = unzipped;

  // 1. Manifest shape + claimed secret policy
  validateManifestShape(manifest, errors);

  // 2. Compatibility (spec §6/§14)
  if (
    manifest.migrationCompatibilityVersion > SUPPORTED_COMPATIBILITY_VERSION
  ) {
    errors.push(
      `Package format version ${manifest.migrationCompatibilityVersion} is newer than this ARCHIE understands (max ${SUPPORTED_COMPATIBILITY_VERSION}). Update ARCHIE before restoring.`,
    );
  }
  if (manifest.migrationCompatibilityVersion < 1) {
    errors.push("Package has an invalid compatibility version.");
  }

  // 3. Component allowlist (spec §24) — unknown top-level dirs are
  //    treated as attempted smuggling, not as benign extras.
  const knownIds = new Set<string>(PACKAGE_COMPONENT_IDS);
  knownIds.add("ARCHIE-VERSION"); // root marker file, checksum-covered
  const componentDirs = new Set(
    files.map((f) =>
      f.path.startsWith("__ROOT__/") ? f.path : f.path.split("/")[0],
    ),
  );
  for (const dir of componentDirs) {
    if (!knownIds.has(dir)) {
      errors.push(
        `Package contains unknown component "${dir}" — rejected (possible authority/security modification attempt).`,
      );
    }
  }

  // 4. Checksum verification of every component file (spec §7)
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const record of checksums) {
    const file = byPath.get(record.path);
    if (!file) {
      errors.push(
        `Corrupted package: file listed in checksums is missing: ${record.path}.`,
      );
      continue;
    }
    const result = await verifyFile(
      { path: file.path, content: file.content },
      record,
    );
    if (!result.ok)
      errors.push(result.reason ?? `Checksum mismatch: ${record.path}.`);
  }
  // Extra files not in checksums = unexpected modification
  for (const f of files) {
    if (!checksums.some((c) => c.path === f.path)) {
      errors.push(
        `Unexpected file not present in checksums: ${f.path} — package was modified after creation.`,
      );
    }
  }
  if (checksums.length === 0) {
    errors.push(
      "Package has no checksum records — integrity cannot be verified.",
    );
  }

  // 5. checksums.json itself against the manifest anchor —
  //    hashed as the RAW file bytes, exactly as shipped.
  const checksumsHash = await sha256Hex(checksumsJson);
  if (
    manifest.integrity?.checksumsFileHash &&
    checksumsHash !== manifest.integrity.checksumsFileHash
  ) {
    errors.push(
      "checksums.json does not match the manifest's integrity hash — the package was modified or corrupted after creation.",
    );
  }

  // 6. Secret scan (spec §20) — STOP restoration on any hit
  const secretHits: SecretScanHit[] = scanFilesForSecrets(
    files.map((f) => ({ path: f.path, content: f.content })),
  );
  for (const hit of secretHits) {
    errors.push(
      `SECRET DETECTED in package (${hit.path}: ${hit.patternName}). Restoration STOPPED — resolve the secret before restoring.`,
    );
  }

  // 7. Honest warnings
  if (manifest.excludedComponents?.length) {
    warnings.push(
      `Excluded at creation time: ${manifest.excludedComponents.map((e) => `${e.id} (${e.reason})`).join("; ")}`,
    );
  }
  if (!manifest.owner?.authorizationId) {
    warnings.push("Package was created without an owner authorization record.");
  }
  if (manifest.sourceEnvironment?.createdOffline) {
    warnings.push(
      "Package was created with limited connectivity — some components may be excluded.",
    );
  }

  return {
    ok: errors.length === 0,
    manifest: errors.length === 0 ? manifest : manifest,
    errors,
    warnings,
  };
}
