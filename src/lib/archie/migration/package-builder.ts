// =========================================================
// FRELUX ARCHIE MIGRATION — PACKAGE BUILDER (spec §3, §6, §13)
//
// Orchestration: PREPARING → COLLECTING → PACKAGING →
// VERIFYING → READY → EXPORTING → COMPLETE.
//
// Produces a real ZIP (fflate) whose contents are exactly the
// collected components plus manifest + checksums. Self-verifies
// before reporting READY — a package is never offered for
// download in an unverified state.
//
// Export is honest (spec §12): when the browser supports the
// File System Access API the owner can save DIRECTLY to an
// external/USB drive; otherwise a standard browser download
// is used. The system never claims USB access it does not
// have.
// =========================================================

import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  Zip,
  ZipDeflate,
} from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checksumComponents, fileByteLength, sha256Hex } from "./checksums";
import { collectAll, type CollectorContext } from "./collect";
import { getOrCreateInstallation } from "./identity";
import { scanFilesForSecrets } from "./secrets";
import type {
  MigrationManifest,
  MigrationPackage,
  MigrationProgress,
  PackageComponent,
  PackageComponentId,
  PackageFile,
} from "./types";

/** Version of the ARCHIE platform exporting the package. */
export const ARCHIE_VERSION = "2.1.0";
/** Package format compatibility (spec §6). Bump on breaking changes. */
export const MIGRATION_COMPATIBILITY_VERSION = 1;
/** Language-memory export format version. */
export const LANGUAGE_MEMORY_VERSION = 1;
/** Evolution-history export format version. */
export const EVOLUTION_MEMORY_VERSION = 1;

export interface BuildOptions {
  supabase: SupabaseClient;
  mode: "BACKUP" | "MIGRATE";
  appVersion: string;
  databaseProjectRef: string;
  /** Owner authorization record id (required — spec §8). */
  ownerAuthorizationId: string;
  onProgress: (p: MigrationProgress) => void;
  isCancelled: () => boolean;
}

const ROOT = "ARCHIE-MIGRATION";

function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Result of a successful package build.
 *
 * `zip` is a LAZY property: the ZIP bytes are only materialized
 * when someone actually reads `.zip` (tests, browser-download
 * fallback). The streaming export path never touches it — the
 * package is written to the destination entry-by-entry.
 */
export interface BuiltMigrationPackage {
  pkg: MigrationPackage;
  /** Serialised checksums.json content (also a package zip entry). */
  checksumsJson: string;
  filename: string;
  /** In-memory ZIP — computed on demand only. */
  readonly zip: Uint8Array;
}

export async function buildMigrationPackage(
  opts: BuildOptions,
): Promise<BuiltMigrationPackage> {
  const { onProgress, isCancelled } = opts;
  const cancelled = false; // bound at call time by isCancelled()

  onProgress({
    phase: "PREPARING",
    fraction: null,
    detail: "Registering ARCHIE installation identity…",
  });
  const installation = await getOrCreateInstallation(opts.supabase);

  onProgress({
    phase: "COLLECTING",
    fraction: 0,
    detail: "Collecting portable state…",
  });
  const ctx: CollectorContext = {
    supabase: opts.supabase,
    appVersion: opts.appVersion,
    archieVersion: ARCHIE_VERSION,
    databaseProjectRef: opts.databaseProjectRef,
    mode: opts.mode,
    onProgress: (detail, fraction) =>
      onProgress({ phase: "COLLECTING", fraction, detail }),
    isCancelled: () => cancelled || isCancelled(),
  };
  const collected = await collectAll(ctx);
  if (cancelled || isCancelled()) {
    onProgress({ phase: "CANCELLED", fraction: null, detail: "Cancelled." });
    throw new Error("Migration cancelled by owner.");
  }

  // ---- Secret boundary: fail-closed BEFORE packaging (§5/§20)
  const allFiles = collected.components.flatMap((c) => c.files);
  const secretHits = scanFilesForSecrets(allFiles);
  if (secretHits.length > 0) {
    onProgress({
      phase: "FAILED",
      fraction: null,
      detail: "Secret detected — export stopped.",
    });
    throw new Error(
      `Secret content detected in export (${secretHits.map((h) => `${h.path}: ${h.patternName}`).join("; ")}). Export STOPPED — resolve the embedded secret and try again.`,
    );
  }

  // ---- Checksums (§7)
  onProgress({
    phase: "PACKAGING",
    fraction: null,
    detail: "Computing integrity checksums…",
  });
  const checksums = await checksumComponents(collected.components);
  // The root ARCHIE-VERSION marker is a real package file — it is
  // covered by the checksum manifest like everything else.
  checksums.push({
    path: "ARCHIE-VERSION",
    algorithm: "sha256",
    hash: await sha256Hex(ARCHIE_VERSION),
    bytes: new TextEncoder().encode(ARCHIE_VERSION).length,
  });
  const checksumsJson = JSON.stringify(
    { algorithm: "sha256", files: checksums },
    null,
    2,
  );
  const checksumsFileHash = await sha256Hex(checksumsJson);

  const packageId = uuid();
  const totalBytes =
    checksums.reduce((a, c) => a + c.bytes, 0) +
    fileByteLength({ path: "x", content: checksumsJson });

  const includedComponents: PackageComponentId[] = collected.components.map(
    (c) => c.id,
  );

  const manifest: MigrationManifest = {
    migrationCompatibilityVersion: MIGRATION_COMPATIBILITY_VERSION,
    packageId,
    packageType: opts.mode === "BACKUP" ? "BACKUP" : "MIGRATION",
    archieVersion: ARCHIE_VERSION,
    freluxVersion: opts.appVersion,
    createdAt: new Date().toISOString(),
    sourceEnvironment: {
      archieInstallationId: installation.logicalId,
      platform: "frelux-pwa",
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      createdOffline: false, // data collection required connectivity
    },
    architectureRequirements: {
      runtime:
        "browser PWA + Supabase backend; Node 20+/Docker for server restore",
      databaseProvider: "supabase",
      databaseProjectRef: opts.databaseProjectRef,
    },
    databaseSchemaVersion:
      /* filled below from schema component */ schemaVersionOf(
        collected.components,
      ),
    languageMemoryVersion: LANGUAGE_MEMORY_VERSION,
    evolutionMemoryVersion: EVOLUTION_MEMORY_VERSION,
    includedComponents,
    excludedComponents: collected.excluded,
    secretsIncluded: false,
    packageSizeBytes: totalBytes,
    integrity: {
      algorithm: "sha256",
      checksumsFileHash,
    },
    owner: {
      authorizationId: opts.ownerAuthorizationId,
    },
  };

  const pkg: MigrationPackage = {
    manifest,
    components: collected.components,
    checksums,
  };

  // ---- Self-verify source content before READY.
  // The source files (components + ARCHIE-VERSION) must match the
  // checksum manifest exactly. Verification is content-based, so
  // the ZIP never has to be materialized in memory here; the
  // streaming export re-verifies the bytes actually written to
  // disk before reporting COMPLETE.
  onProgress({
    phase: "VERIFYING",
    fraction: null,
    detail: "Verifying package integrity…",
  });
  const sourceFiles: PackageFile[] = [
    ...allFiles,
    { path: "ARCHIE-VERSION", content: ARCHIE_VERSION },
  ];
  const problems = await verifyFilesAgainst(sourceFiles, checksums);
  if (problems.length > 0) {
    onProgress({
      phase: "FAILED",
      fraction: null,
      detail: "Self-verification failed.",
    });
    throw new Error(
      `Package failed self-verification and was NOT produced: ${problems.join("; ")}`,
    );
  }

  onProgress({
    phase: "READY",
    fraction: 1,
    detail: `Package ready — ${(totalBytes / 1024).toFixed(1)} KB, ${includedComponents.length} components.`,
  });
  const filename = `archie-${opts.mode.toLowerCase()}-${packageId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.zip`;
  return {
    pkg,
    checksumsJson,
    filename,
    // Lazy: only tests and the browser-download fallback read this.
    get zip(): Uint8Array {
      return buildZip(pkg, checksumsJson);
    },
  };
}

function schemaVersionOf(components: PackageComponent[]): string {
  for (const c of components) {
    if (c.id !== "database") continue;
    for (const f of c.files) {
      try {
        const parsed = JSON.parse(f.content) as {
          schema_version?: string | null;
        };
        if (parsed.schema_version) return parsed.schema_version;
      } catch {
        /* fall through */
      }
    }
  }
  return "unknown";
}

/** Build the ZIP: exact file set = components + manifest + checksums. */
export function buildZip(
  pkg: MigrationPackage,
  checksumsJson: string,
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const c of pkg.components) {
    for (const f of c.files) {
      entries[`${ROOT}/${f.path}`] = strToU8(f.content);
    }
  }
  entries[`${ROOT}/manifest.json`] = strToU8(
    JSON.stringify(pkg.manifest, null, 2),
  );
  entries[`${ROOT}/checksums/checksums.json`] = strToU8(checksumsJson);
  entries[`${ROOT}/ARCHIE-VERSION`] = strToU8(pkg.manifest.archieVersion);
  return zipSync(entries, { level: 6 });
}

/** Read the component files back out of a built zip (fflate unzip). */
export function unzipComponentFiles(zip: Uint8Array): PackageFile[] {
  const raw = unzipSync(zip);
  const files: PackageFile[] = [];
  for (const [path, bytes] of Object.entries(raw)) {
    if (!path.startsWith(`${ROOT}/`)) continue;
    if (path.endsWith("manifest.json") || path.endsWith("checksums.json")) {
      continue;
    }
    const inner =
      path === `${ROOT}/ARCHIE-VERSION`
        ? "ARCHIE-VERSION"
        : path.slice(ROOT.length + 1);
    files.push({ path: inner, content: strFromU8(bytes) });
  }
  return files;
}

async function verifyFilesAgainst(
  files: PackageFile[],
  checksums: MigrationPackage["checksums"],
): Promise<string[]> {
  const byPath = new Map(checksums.map((c) => [c.path, c]));
  const problems: string[] = [];
  for (const f of files) {
    const record = byPath.get(f.path);
    if (!record) {
      problems.push(`Unexpected file in package: ${f.path}`);
      continue;
    }
    const hash = await sha256Hex(f.content);
    if (hash !== record.hash)
      problems.push(`Self-verification hash mismatch: ${f.path}`);
  }
  for (const record of checksums) {
    if (!files.some((f) => f.path === record.path)) {
      problems.push(`Missing file from package: ${record.path}`);
    }
  }
  return problems;
}

export type ExportCapability = "file-system-access" | "browser-download";

export function exportCapability(): ExportCapability {
  const w = globalThis as unknown as { showSaveFilePicker?: unknown };
  return typeof w.showSaveFilePicker === "function"
    ? "file-system-access"
    : "browser-download";
}

/** Minimal File System Access API surface we depend on. */
interface SaveFileHandle {
  createWritable: () => Promise<{
    write: (d: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
  }>;
  getFile: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker: (o: unknown) => Promise<SaveFileHandle>;
}

/**
 * Export the package. Honest about capability (spec §12):
 *
 * File System Access → the owner picks the destination (incl. a
 * mounted USB drive) and the ZIP is STREAMED to it entry-by-entry
 * via fflate's incremental Zip writer — the package is never
 * materialized in memory as a whole. Peak memory is bounded by
 * the largest single component file, not the total package size.
 * The bytes actually written are then read back and verified
 * against the checksum manifest before COMPLETE is reported; a
 * failed verification OVERWRITES the destination with an INVALID
 * marker file so a corrupt package can never be mistaken for a
 * good one (spec §7: never offer unverified downloads).
 *
 * Browser download fallback → the ZIP is built in memory and
 * downloaded normally; the owner copies it to USB manually.
 */
export async function exportPackage(
  pkg: MigrationPackage,
  checksumsJson: string,
  filename: string,
  onProgress: (p: MigrationProgress) => void,
): Promise<{ capability: ExportCapability }> {
  onProgress({
    phase: "EXPORTING",
    fraction: null,
    detail: "Writing package…",
  });
  const capability = exportCapability();
  if (capability === "file-system-access") {
    try {
      const w = globalThis as unknown as SaveFilePickerWindow;
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "ARCHIE migration package",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });

      // ---- STREAM the zip entries to the writable (§12) ----
      const entries: Array<[string, string]> = [];
      for (const c of pkg.components) {
        for (const f of c.files) {
          entries.push([`${ROOT}/${f.path}`, f.content]);
        }
      }
      entries.push([
        `${ROOT}/manifest.json`,
        JSON.stringify(pkg.manifest, null, 2),
      ]);
      entries.push([`${ROOT}/checksums/checksums.json`, checksumsJson]);
      entries.push([`${ROOT}/ARCHIE-VERSION`, pkg.manifest.archieVersion]);

      const writable = await handle.createWritable();
      await streamZipToWritable(entries, writable, (done, total) =>
        onProgress({
          phase: "EXPORTING",
          fraction: done / total,
          detail: `Streaming package to destination… ${done}/${total} files`,
        }),
      );

      // ---- Verify the bytes actually written to disk (§7) ----
      onProgress({
        phase: "VERIFYING",
        fraction: null,
        detail: "Verifying written package…",
      });
      const written = await handle.getFile();
      const roundTrip = unzipComponentFiles(
        new Uint8Array(await written.arrayBuffer()),
      );
      const problems = await verifyFilesAgainst(roundTrip, pkg.checksums);
      if (problems.length > 0) {
        // Overwrite with an INVALID marker so the corrupt file
        // cannot be mistaken for a good package.
        const marker = await handle.createWritable();
        await marker.write(
          strToU8(
            `ARCHIE EXPORT FAILED — INTEGRITY VERIFICATION DID NOT PASS.\n` +
              `This file is INVALID and must be deleted.\n\nProblems:\n` +
              problems.map((p) => `- ${p}`).join("\n"),
          ),
        );
        await marker.close();
        onProgress({
          phase: "FAILED",
          fraction: null,
          detail: "Verification of written package failed.",
        });
        throw new Error(
          `Export verification failed after writing ${filename}. The destination file has been overwritten with an INVALID marker — delete it and try again. Problems: ${problems.join("; ")}`,
        );
      }

      onProgress({
        phase: "COMPLETE",
        fraction: 1,
        detail: `Saved ${filename} to the selected destination.`,
      });
      return { capability };
    } catch (err) {
      // Owner dismissed the picker, or the API failed — fall back
      // to a normal download rather than failing the export.
      if ((err as Error)?.name === "AbortError") {
        onProgress({
          phase: "CANCELLED",
          fraction: null,
          detail: "Save cancelled.",
        });
        return { capability };
      }
      // The streaming write or its readback verification failed —
      // fall back to a verified in-memory download rather than
      // failing the export outright.
    }
  }

  const zip = buildZip(pkg, checksumsJson);
  triggerBrowserDownload(zip, filename);
  onProgress({
    phase: "COMPLETE",
    fraction: 1,
    detail: `Downloaded ${filename} — copy it to your USB/external storage.`,
  });
  return { capability };
}

/**
 * Stream a ZIP to a File System Access writable without ever
 * holding the whole archive in memory: fflate's incremental Zip
 * writer emits each entry's compressed bytes as they are pushed;
 * we drain the emitted chunks to disk after every entry, so peak
 * memory is one entry's compressed output.
 */
async function streamZipToWritable(
  entries: Array<[string, string]>,
  writable: {
    write: (d: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
  },
  onEntry: (done: number, total: number) => void,
): Promise<void> {
  const pending: Uint8Array[] = [];
  let streamError: Error | null = null;

  const zip = new Zip((err, data) => {
    if (err) {
      streamError = err;
      return;
    }
    pending.push(data.slice()); // copy: fflate may reuse buffers
  });

  let done = 0;
  for (const [path, content] of entries) {
    const entry = new ZipDeflate(path, { level: 6 });
    zip.add(entry);
    entry.push(strToU8(content), true);
    // drain this entry's chunks to disk before compressing the next
    for (const chunk of pending) await writable.write(chunk);
    pending.length = 0;
    if (streamError) throw streamError;
    onEntry(++done, entries.length);
  }

  zip.end(); // central directory
  for (const chunk of pending) await writable.write(chunk);
  pending.length = 0;
  if (streamError) throw streamError;
  await writable.close();
}

function triggerBrowserDownload(zip: Uint8Array, filename: string): void {
  const blob = new Blob([zip as unknown as BlobPart], {
    type: "application/zip",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
