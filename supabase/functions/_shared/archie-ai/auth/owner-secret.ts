// =========================================================
// OWNER SECRET VERIFICATION (shared edge helper)
// supabase/functions/_shared/archie-ai/auth/owner-secret.ts
//
// PBKDF2-SHA-256 verification of the Owner Secret against
// frelux_owner_credentials — identical to the archie-execute
// implementation, extracted so every engine consumer
// (archie-execute, archie-agents, ...) verifies the SAME way.
// The secret is NEVER stored or logged; only its verifier.
// =========================================================

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function deriveVerifier(
  secret: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(saltB64), (c) =>
        c.charCodeAt(0),
      ) as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    256,
  );
  return b64encode(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface OwnerSecretEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

/** Verify an Owner Secret server-side. Returns false on any
 *  mismatch or transport failure — never throws, never leaks
 *  which side failed. */
export async function verifyOwnerSecret(
  userId: string,
  secret: string,
  env: OwnerSecretEnv,
): Promise<boolean> {
  const fetchFn = env.fetchFn ?? fetch;
  const res = await fetchFn(
    `${env.supabaseUrl}/rest/v1/frelux_owner_credentials?user_id=eq.${userId}&select=secret_hash,salt,iterations`,
    {
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
      },
    },
  );
  if (!res.ok) return false;
  const rows = (await res.json()) as {
    secret_hash: string;
    salt: string;
    iterations: number;
  }[];
  const cred = rows[0];
  if (!cred) return false;
  const verifier = await deriveVerifier(secret, cred.salt, cred.iterations);
  return constantTimeEqual(verifier, cred.secret_hash);
}
