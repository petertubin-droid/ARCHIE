// =========================================================
// CROSS-PROJECT OWNER IDENTITY — QUALITY GATES
// (owner directive 2026-09-12)
// =========================================================

import { describe, expect, it } from "vitest";
import { verifyJwtWithJwk } from "@studio-shared/archie-ai/security/cross-project-auth.ts";

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeKey() {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

async function exportJwk(key: CryptoKeyPair) {
  return crypto.subtle.exportKey("jwk", key.publicKey);
}

interface Crafted {
  token: string;
  jwk: JsonWebKey;
  otherJwk: JsonWebKey;
}

async function craftToken(
  claims: Record<string, unknown>,
  alg = "ES256",
): Promise<Crafted> {
  const key = await makeKey();
  const other = await makeKey();
  const header = { alg, typ: "JWT", kid: "test-key" };
  const payload = { sub: "owner-123", email: "owner@example.com", ...claims };
  const headB = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const payB = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    key.privateKey,
    new TextEncoder().encode(`${headB}.${payB}`),
  );
  return {
    token: `${headB}.${payB}.${b64url(new Uint8Array(signature))}`,
    jwk: await exportJwk(key),
    otherJwk: await exportJwk(other),
  };
}

describe("cross-project authority JWT verification", () => {
  it("accepts a valid ES256 token signed by the authority key", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const { token, jwk } = await craftToken({ exp });
    const v = await verifyJwtWithJwk(token, jwk as never);
    expect(v).not.toBeNull();
    expect(v?.sub).toBe("owner-123");
    expect(v?.email).toBe("owner@example.com");
    expect(v?.exp).toBe(exp);
  });

  it("rejects a token signed by a different key", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const { token, otherJwk } = await craftToken({ exp });
    expect(await verifyJwtWithJwk(token, otherJwk as never)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const { token, jwk } = await craftToken({ exp });
    expect(await verifyJwtWithJwk(token, jwk as never)).toBeNull();
  });

  it("rejects tampered payloads", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const { token, jwk } = await craftToken({ exp });
    const [h, _p, s] = token.split(".");
    const tamperedPayload = b64url(
      new TextEncoder().encode(JSON.stringify({ sub: "attacker", exp })),
    );
    expect(
      await verifyJwtWithJwk(`${h}.${tamperedPayload}.${s}`, jwk as never),
    ).toBeNull();
  });

  it("rejects non-ES256 algorithms", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const { token, jwk } = await craftToken({ exp }, "RS256");
    expect(await verifyJwtWithJwk(token, jwk as never)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const { jwk } = await craftToken({
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(await verifyJwtWithJwk("not-a-jwt", jwk as never)).toBeNull();
  });
});
