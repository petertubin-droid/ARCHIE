// =========================================================
// FRELUX PHASE 8b, PROTECTED DATA VAULT
//
// The user EXPLICITLY selects important FRELUX data to protect.
// Protecting an item:
//   1. encrypts it on-device (AES-256-GCM, PBKDF2 key from the
//      user's passphrase, never stored anywhere)
//   2. uploads ONLY ciphertext to the private archie-protected
//      bucket (secure cloud backup, the phone is never the
//      only copy)
//   3. keeps a version history for every change
//   4. records a security event
// Recovery (any device): authenticate, pick the item, enter
// the passphrase → decrypt. A stolen phone holds ciphertext
// only, and a revoked session can't even fetch that.
// =========================================================
import { supabase } from "@/lib/supabase";
import { encryptEnvelope, decryptEnvelope, checksumEnvelope } from "./crypto";
import { recordSecurityEvent } from "./security-events";
import type {
  CipherEnvelope,
  ProtectedItem,
  ProtectedItemVersion,
  ProtectedItemType,
} from "./types";

export const PROTECTED_BUCKET = "archie-protected";
export const LOCAL_CACHE_PREFIX = "frelux:protected-cache:";

// ---------------------------------------------------------
// Local cache, CIPHERTEXT ONLY, per user, removable
// ---------------------------------------------------------
function cacheKey(userId: string) {
  return `${LOCAL_CACHE_PREFIX}${userId}`;
}

/** Best-effort local caching of ciphertext envelopes (speeds up recovery). */
export function cacheEnvelope(
  userId: string,
  itemPath: string,
  envelope: CipherEnvelope,
): void {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    const store: Record<string, CipherEnvelope> = raw ? JSON.parse(raw) : {};
    store[itemPath] = envelope;
    localStorage.setItem(cacheKey(userId), JSON.stringify(store));
  } catch {
    /* caching is best-effort; never fatal */
  }
}

export function getCachedEnvelope(
  userId: string,
  itemPath: string,
): CipherEnvelope | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, CipherEnvelope>;
    return store[itemPath] ?? null;
  } catch {
    return null;
  }
}

/** FIX 56: remove specific envelope paths from the local
 *  ciphertext cache (a deleted item's cache must not
 *  outlive the item). Best-effort, never fatal. */
function uncacheEnvelopes(userId: string, paths: string[]): void {
  try {
    const key = cacheKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const store: Record<string, CipherEnvelope> = JSON.parse(raw);
    for (const path of paths) delete store[path];
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* caching is best-effort; never fatal */
  }
}

/** Remove ALL locally cached protected data (where the browser/Android permits). */
export async function clearLocalProtectedCache(
  userId?: string,
): Promise<number> {
  let removed = 0;
  try {
    if (userId) {
      const key = cacheKey(userId);
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed += 1;
      }
    } else {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LOCAL_CACHE_PREFIX)) doomed.push(k);
      }
      for (const k of doomed) {
        localStorage.removeItem(k);
        removed += 1;
      }
    }
  } catch {
    /* storage may be unavailable, nothing to remove */
  }
  return removed;
}

// ---------------------------------------------------------
// Protect (encrypt + back up + version), user-selected data
// ---------------------------------------------------------
async function uploadEnvelope(
  userId: string,
  path: string,
  envelope: CipherEnvelope,
): Promise<void> {
  const body = JSON.stringify(envelope);
  const { error } = await supabase.storage
    .from(PROTECTED_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

export async function protectItem(
  userId: string,
  input: {
    label: string;
    itemType: ProtectedItemType;
    plaintext: string;
    passphrase: string;
    sourceRef?: string;
  },
): Promise<{ item: ProtectedItem; version: ProtectedItemVersion }> {
  const envelope = await encryptEnvelope(input.passphrase, input.plaintext);
  const checksum = await checksumEnvelope(envelope);
  const itemId = crypto.randomUUID();
  const path = `${userId}/${itemId}/v1.json`;

  await uploadEnvelope(userId, path, envelope);
  cacheEnvelope(userId, path, envelope);

  const { data: item, error } = await supabase
    .from("frelux_protected_items")
    .insert({
      id: itemId,
      user_id: userId,
      label: input.label,
      item_type: input.itemType,
      source_ref: input.sourceRef ?? null,
      storage_path: path,
      kdf_salt: envelope.kdf.salt,
      kdf_iterations: envelope.kdf.iterations,
      latest_version: 1,
      size_bytes: envelope.ciphertext.length,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { data: version, error: verErr } = await supabase
    .from("frelux_protected_item_versions")
    .insert({
      item_id: itemId,
      user_id: userId,
      version: 1,
      storage_path: path,
      size_bytes: envelope.ciphertext.length,
      checksum,
    })
    .select("*")
    .single();
  if (verErr) throw new Error(verErr.message);

  await recordSecurityEvent(userId, {
    kind: "PROTECTED_DATA_BACKED_UP",
    severity: "info",
    message: `"${input.label}" was encrypted and backed up (v1). The phone is not the only copy.`,
  });

  return {
    item: item as ProtectedItem,
    version: version as ProtectedItemVersion,
  };
}

/** Add a new version of an existing protected item (history kept). */
export async function versionProtectedItem(
  userId: string,
  itemId: string,
  plaintext: string,
  passphrase: string,
): Promise<{ item: ProtectedItem; version: ProtectedItemVersion }> {
  const { data: item, error } = await supabase
    .from("frelux_protected_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !item) throw new Error("Protected item not found.");

  const nextVersion = item.latest_version + 1;
  const envelope = await encryptEnvelope(passphrase, plaintext);
  const checksum = await checksumEnvelope(envelope);
  const path = `${userId}/${itemId}/v${nextVersion}.json`;
  await uploadEnvelope(userId, path, envelope);
  cacheEnvelope(userId, path, envelope);

  // FIX 58: the version ledger row is written BEFORE the item
  // pointer moves. The old order (update item, then insert the
  // version row) left latest_version pointing at a version that
  // did not exist in the ledger whenever the insert failed —
  // the version list and the item disagreed. With this order a
  // failed insert leaves the item on its previous consistent
  // version; the orphaned storage object is harmless ciphertext.
  const { data: version, error: verErr } = await supabase
    .from("frelux_protected_item_versions")
    .insert({
      item_id: itemId,
      user_id: userId,
      version: nextVersion,
      storage_path: path,
      size_bytes: envelope.ciphertext.length,
      checksum,
    })
    .select("*")
    .single();
  if (verErr) throw new Error(verErr.message);

  const { data: updated, error: upErr } = await supabase
    .from("frelux_protected_items")
    .update({
      storage_path: path,
      kdf_salt: envelope.kdf.salt,
      kdf_iterations: envelope.kdf.iterations,
      latest_version: nextVersion,
      size_bytes: envelope.ciphertext.length,
      updated_date: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (upErr) throw new Error(upErr.message);

  return {
    item: updated as ProtectedItem,
    version: version as ProtectedItemVersion,
  };
}

export async function listProtectedItems(
  userId: string,
): Promise<ProtectedItem[]> {
  const { data, error } = await supabase
    .from("frelux_protected_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProtectedItem[];
}

export async function listItemVersions(
  userId: string,
  itemId: string,
): Promise<ProtectedItemVersion[]> {
  const { data, error } = await supabase
    .from("frelux_protected_item_versions")
    .select("*")
    .eq("item_id", itemId)
    .eq("user_id", userId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProtectedItemVersion[];
}

async function downloadEnvelope(
  userId: string,
  path: string,
): Promise<CipherEnvelope> {
  const cached = getCachedEnvelope(userId, path);
  if (cached) return cached;
  const { data, error } = await supabase.storage
    .from(PROTECTED_BUCKET)
    .download(path);
  if (error || !data)
    throw new Error("Protected backup could not be downloaded.");
  const envelope = JSON.parse(await data.text()) as CipherEnvelope;
  cacheEnvelope(userId, path, envelope);
  return envelope;
}

/**
 * Authenticated recovery, works on a replacement device: sign
 * in, pick the item, enter the passphrase, decrypt.
 */
export async function recoverProtectedItem(
  userId: string,
  itemId: string,
  passphrase: string,
  version?: number,
): Promise<{ plaintext: string; version: ProtectedItemVersion }> {
  const { data: item, error } = await supabase
    .from("frelux_protected_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !item) throw new Error("Protected item not found.");

  let ver: ProtectedItemVersion;
  if (version != null) {
    const { data: v, error: vErr } = await supabase
      .from("frelux_protected_item_versions")
      .select("*")
      .eq("item_id", itemId)
      .eq("user_id", userId)
      .eq("version", version)
      .maybeSingle();
    if (vErr || !v) throw new Error("Version not found.");
    ver = v as ProtectedItemVersion;
  } else {
    // FIX 57: the default (latest) recovery reads the REAL
    // ledger row for the latest version. The old code
    // synthesized a fake version row with an empty checksum —
    // which the integrity gate skips — so only explicit
    // version recovery was ever tamper-checked. The latest
    // backup (the default path most owners use) now gets the
    // SAME checksum verification.
    const { data: lv, error: lvErr } = await supabase
      .from("frelux_protected_item_versions")
      .select("*")
      .eq("item_id", itemId)
      .eq("user_id", userId)
      .eq("version", item.latest_version)
      .maybeSingle();
    if (lvErr || !lv) {
      throw new Error(
        "The version ledger for this item is inconsistent — recover by choosing an explicit version.",
      );
    }
    ver = lv as ProtectedItemVersion;
  }

  const envelope = await downloadEnvelope(userId, ver.storage_path);
  const checksum = await checksumEnvelope(envelope);
  if (ver.checksum && ver.checksum !== checksum) {
    throw new Error(
      "Integrity check failed, the backup does not match its recorded checksum. It may have been tampered with.",
    );
  }

  const plaintext = await decryptEnvelope(passphrase, envelope);
  await recordSecurityEvent(userId, {
    kind: "PROTECTED_DATA_RECOVERED",
    severity: "info",
    message: `Protected item "${item.label}" (v${ver.version}) was decrypted successfully.`,
  });
  return { plaintext, version: ver };
}

export async function deleteProtectedItem(
  userId: string,
  itemId: string,
): Promise<void> {
  // FIX 56: a delete must destroy the CIPHERTEXT BACKUPS too.
  // The old code deleted only the DB rows — the version rows
  // cascaded away, but every encrypted object stayed in the
  // archie-protected bucket (and the local cache) forever. An
  // owner deleting a protected item expects the protected data
  // to be gone, not merely unlisted. Collect every known path
  // BEFORE the rows disappear (the cascade needs them gone
  // after), remove the storage objects, clear the local cache,
  // and record an honest security event — a warning naming the
  // leftovers if storage removal failed.
  const { data: versions } = await supabase
    .from("frelux_protected_item_versions")
    .select("storage_path")
    .eq("item_id", itemId)
    .eq("user_id", userId);
  const paths = new Set<string>(
    (versions ?? []).map((r: { storage_path: string }) => r.storage_path),
  );
  const { data: item } = await supabase
    .from("frelux_protected_items")
    .select("storage_path, latest_version, label")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (item) {
    paths.add(item.storage_path);
    for (let n = 1; n <= item.latest_version; n++) {
      paths.add(`${userId}/${itemId}/v${n}.json`);
    }
  }
  const pathList = [...paths];

  let storageFailed = false;
  if (pathList.length > 0) {
    const { error: rmErr } = await supabase.storage
      .from(PROTECTED_BUCKET)
      .remove(pathList);
    storageFailed = Boolean(rmErr);
  }
  uncacheEnvelopes(userId, pathList);

  const { error } = await supabase
    .from("frelux_protected_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await recordSecurityEvent(userId, {
    kind: "PROTECTED_DATA_DELETED",
    severity: storageFailed ? "warning" : "info",
    message: storageFailed
      ? `Protected item "${item?.label ?? itemId}" was deleted, but removing its encrypted backups from cloud storage failed — ciphertext objects remain in the private bucket (${pathList.length}). Retry the delete or contact support.`
      : `Protected item "${item?.label ?? itemId}" was deleted together with all ${pathList.length} encrypted backup(s). The phone and the cloud hold no copy.`,
  });
}
