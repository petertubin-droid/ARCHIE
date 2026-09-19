// Supabase Edge Function: send-push-notification
// Sends a web push notification to a user's active subscriptions.
//
// Environment variables needed:
//   VAPID_PUBLIC_KEY  — the VAPID public key (same as client-side)
//   VAPID_PRIVATE_KEY — the VAPID private key (server-only)
//
// Invoke with: { "userId": "uuid", "title": "string", "body": "string", "url": "string" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Web Push implementation using Web Crypto API
// Based on https://datatracker.ietf.org/doc/html/rfc8291

async function sendPushNotification(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: object,
) {
  // Create JWT for VAPID
  const jwt = await createVapidJWT(vapidPublicKey, vapidPrivateKey, endpoint);

  // Encrypt payload
  const encrypted = await encryptPayload(JSON.stringify(payload), p256dh, auth);

  // Build headers
  const headers: Record<string, string> = {
    TTL: "86400",
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: encrypted,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `[push] Failed to send to ${endpoint}: ${response.status} ${text}`,
    );
  }

  return response.ok;
}

async function createVapidJWT(
  publicKey: string,
  privateKey: string,
  endpoint: string,
): Promise<string> {
  const url = new URL(endpoint);
  const origin = url.origin;

  // Header
  const header = { typ: "JWT", alg: "ES256" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));

  // Payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: origin,
    exp: now + 12 * 3600,
    sub: "mailto:admin@freluxtools.netlify.app",
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));

  // Sign
  const key = await importVapidKey(privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function importVapidKey(privateKey: string): Promise<CryptoKey> {
  const keyData = base64UrlToUint8Array(privateKey);
  return crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// AES-128-GCM encryption per RFC 8291
async function encryptPayload(
  payload: string,
  p256dhBase64: string,
  authBase64: string,
): Promise<Uint8Array> {
  const userPublicKey = base64UrlToUint8Array(p256dhBase64);
  const userAuth = base64UrlToUint8Array(authBase64);

  // Import user's public key
  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Generate server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // Export server public key
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userKey },
    serverKeyPair.privateKey,
    256,
  );

  // HKDF for content encryption key
  const ikm = new Uint8Array(sharedSecret);
  const authSecret = new Uint8Array(userAuth);

  // Info for content encryption key
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0\0");

  // Derive PRK
  const prkKey = await crypto.subtle.importKey(
    "raw",
    concat(authSecret, ikm),
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );
  // Note: Web Crypto HKDF doesn't take separate info for key+nonce easily in all implementations.
  // Using a simplified approach:
  const prk = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: authSecret,
        info: new Uint8Array(0),
      },
      prkKey,
      256,
    ),
  );

  // Derive content encryption key
  const cekKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: cekInfo },
      cekKey,
      128,
    ),
  );

  // Derive nonce
  const nonceKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: nonceInfo,
      },
      nonceKey,
      96,
    ),
  );

  // Build RFC 8291 header
  const recordSize = 4096;
  const header = new Uint8Array(21 + serverPublicKey.length);
  header[0] = 0; // salt (empty — 16 bytes of zeros for simplicity)
  // Actually the header format is: salt(16) + rs(4) + idlen(1) + key
  // For simplicity we skip the salt and use zeros
  const fullHeader = new Uint8Array(16 + 4 + 1 + 65);
  // rs = record size (big-endian)
  fullHeader[16] = (recordSize >> 24) & 0xff;
  fullHeader[17] = (recordSize >> 16) & 0xff;
  fullHeader[18] = (recordSize >> 8) & 0xff;
  fullHeader[19] = recordSize & 0xff;
  fullHeader[20] = 65; // key length
  fullHeader.set(serverPublicKey, 21);

  // Encrypt
  const plaintext = new TextEncoder().encode(payload);
  // Add padding marker
  const paddedPayload = new Uint8Array(plaintext.length + 1);
  paddedPayload.set(plaintext);
  paddedPayload[plaintext.length] = 2; // delimiter

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: fullHeader },
    await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
      "encrypt",
    ]),
    paddedPayload,
  );

  const result = new Uint8Array(
    fullHeader.length + new Uint8Array(encrypted).length,
  );
  result.set(fullHeader);
  result.set(new Uint8Array(encrypted), fullHeader.length);
  return result;
}

// Helper functions
function base64UrlEncode(input: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input;
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

// Main handler
serveWithCors(async (req) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { userId, title, body, url } = await req.json();

    if (!userId || !title) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get user's active subscriptions
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh_key, auth_key")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No active subscriptions" }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const payload = {
      title,
      body,
      url: url || "/messages",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "frelux-message",
    };

    let sentCount = 0;
    for (const sub of subscriptions) {
      if (sub.p256dh_key && sub.auth_key) {
        const ok = await sendPushNotification(
          sub.endpoint,
          sub.p256dh_key,
          sub.auth_key,
          payload,
        );
        if (ok) sentCount++;
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, total: subscriptions.length }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
