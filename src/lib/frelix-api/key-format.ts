// =========================================================
// FRELUX PHASE 7, API KEY FORMAT & GENERATION
//
// STRICT REQUIREMENT (Phase 7 §3): every FRELUX-issued API key
// is exactly 32 characters:
//   "FLX-" (4 chars) + 28 alphanumeric chars [A-Za-z0-9]
//
// The raw key is generated with a cryptographically secure
// generator (Web Crypto getRandomValues, browser + Deno), using
// rejection sampling so the 62-character alphabet is sampled
// uniformly (no modulo bias). The raw key is returned exactly
// once at creation; only a SHA-256 hash is ever stored.
// =========================================================

export const API_KEY_PREFIX = "FLX-";
export const API_KEY_SUFFIX_LENGTH = 28;
export const API_KEY_TOTAL_LENGTH =
  API_KEY_PREFIX.length + API_KEY_SUFFIX_LENGTH; // 32

const SUFFIX_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// ^FLX- followed by exactly 28 alphanumerics, nothing else.
const CANONICAL_KEY_PATTERN = /^FLX-[A-Za-z0-9]{28}$/;

export interface ApiKeyFormatVerdict {
  valid: boolean;
  reason?: string;
}

/**
 * Strict format validation. Rejects wrong prefixes ("FRELUX-",
 * "FLX_live_", UUID/sequential/user-derived shapes), wrong
 * lengths, and any non-alphanumeric suffix character.
 */
export function validateApiKeyFormat(key: string): ApiKeyFormatVerdict {
  if (typeof key !== "string")
    return { valid: false, reason: "key must be a string" };
  if (key.length !== API_KEY_TOTAL_LENGTH) {
    return {
      valid: false,
      reason: `key must be exactly ${API_KEY_TOTAL_LENGTH} characters (got ${key.length})`,
    };
  }
  if (!key.startsWith(API_KEY_PREFIX)) {
    return { valid: false, reason: `key must start with "${API_KEY_PREFIX}"` };
  }
  if (!CANONICAL_KEY_PATTERN.test(key)) {
    return {
      valid: false,
      reason: "suffix must be exactly 28 alphanumeric characters [A-Za-z0-9]",
    };
  }
  return { valid: true };
}

export function isValidApiKeyFormat(key: string): boolean {
  return validateApiKeyFormat(key).valid;
}

// Uniform rejection sampling over the 62-char alphabet. The
// rejection buffer keeps every character exactly equilikely :
// a plain modulo over random bytes would bias the alphabet.
function randomSuffix(length: number): string {
  const out = new Array<string>(length);
  const max = 256 - (256 % SUFFIX_ALPHABET.length); // 248
  const bytes = new Uint8Array(length * 2);
  let i = 0;
  while (i < length) {
    crypto.getRandomValues(bytes);
    for (let j = 0; j < bytes.length && i < length; j++) {
      const b = bytes[j];
      if (b < max) {
        out[i] = SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length];
        i++;
      }
    }
  }
  return out.join("");
}

/**
 * Generate a new FRELUX API key: "FLX-" + 28 crypto-random
 * alphanumeric characters. Exactly 32 characters, cryptographically
 * unpredictable, no user/sequential/timestamp derivation.
 */
export function generateFreluxApiKey(): string {
  return `${API_KEY_PREFIX}${randomSuffix(API_KEY_SUFFIX_LENGTH)}`;
}

/**
 * SHA-256 hex hash of the full raw key, the ONLY thing stored.
 * Web Crypto works in both the browser and Deno edge runtime.
 */
export async function hashApiKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawKey),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract the Bearer credential from an Authorization header
 * without ever logging or echoing it.
 */
export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Masked display form for stored key metadata: "FLX-A7k9••••"
 * (prefix + first 4 suffix characters, never more).
 */
export function maskApiKey(rawKey: string): string {
  if (!isValidApiKeyFormat(rawKey)) return "FLX-••••";
  return `${rawKey.slice(0, 8)}••••`;
}

/** Stored key_prefix column value: FLX- + first 4 suffix chars. */
export function apiKeyDisplayPrefix(rawKey: string): string {
  if (!isValidApiKeyFormat(rawKey)) return "FLX-????";
  return rawKey.slice(0, 8);
}
