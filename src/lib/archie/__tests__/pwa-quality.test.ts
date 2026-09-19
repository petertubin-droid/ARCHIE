import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// =========================================================
// ARCHIE PWA QUALITY — PWA-BUILDING-BLOCKS INTEGRITY
//
// © 2026 FRENZY. All rights reserved.
//
// Verifies the upgraded PWA surface: installability assets,
// offline honesty (what IS and IS NOT cached), the update
// flow, app shortcuts, and the legal/AI-disclosure surfaces
// required by the ARCHIE legal corpus.
// =========================================================

const ROOT = path.join(__dirname, "../../../..");

const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("ARCHIE PWA — service worker integrity", () => {
  const sw = read("public/archie-sw.js");

  it("uses a versioned cache (bumpable for updates)", () => {
    expect(sw).toMatch(/const CACHE = "archie-shell-v\d+"/);
  });

  it("supports the explicit update flow (SKIP_WAITING on user consent)", () => {
    expect(sw).toContain("SKIP_WAITING");
    expect(sw).toContain("skipWaiting");
  });

  it("never caches authenticated, chat or API traffic (privacy rule)", () => {
    expect(sw).toMatch(/never cached|NEVER cached|authenticated/i);
    // And no blanket runtime cache that would swallow API calls.
    expect(sw).not.toMatch(/respondWith\(fetchAndCache/);
  });

  it("serves an offline fallback for navigations", () => {
    expect(sw).toMatch(/offline|respondWith/);
  });
});

describe("ARCHIE PWA — manifest quality", () => {
  const manifest = JSON.parse(
    read("public/assets/archie/manifest.webmanifest"),
  );

  it("is a valid installable manifest with identity and display mode", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toContain("/archie");
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(
      manifest.display,
    );
    expect(manifest.icons?.length).toBeGreaterThan(0);
  });

  it("exposes app shortcuts for the core surfaces", () => {
    const names = (manifest.shortcuts ?? []).map(
      (s: { name: string }) => s.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(["Chat", "Coding", "Devices", "Legal"]),
    );
  });
});

describe("ARCHIE PWA — legal & AI-disclosure surfaces", () => {
  const layout = read("src/components/archie/ArchieLayout.tsx");
  // STANDALONE-REPO GATE: in the extracted ARCHIE engine repo there is no
  // host router (src/App.tsx lives in the host app, e.g. FRELUX). The
  // host-wiring assertion below is a HOST-REPO contract: it runs in full
  // in the host; here the read is conditional so the engine-repo checks
  // above still hold. Never fabricated - no fake router is created here.
  const app = existsSync(path.join(ROOT, "src/App.tsx"))
    ? read("src/App.tsx")
    : null;

  it("shows a first-run AI disclosure banner with a link to the AI Disclosure", () => {
    expect(layout).toContain("ARCHIE is an AI");
    expect(layout).toContain("/archie/legal");
    expect(layout).toContain("archie-ai-disclosure-ack");
  });

  it("carries the legal footer: governance + memory rights + FRENZY copyright", () => {
    expect(layout).toContain("Legal &amp; Governance");
    expect(layout).toContain("Privacy &amp; Memory Rights");
    expect(layout).toContain("© 2026 FRENZY. All rights reserved.");
  });

  // Same gate: skipped only when the host router file is absent (standalone
  // engine repo); runs as the full contract inside the host repo.
  ;(app ? it : it.skip)("routes /archie/legal, /archie/privacy and the admin legal console", () => {
    expect(app).toMatch(/path="legal" element=\{<ArchieLegal \/>\}/);
    expect(app).toMatch(/path="privacy" element=\{<ArchiePrivacy \/>\}/);
    expect(app).toMatch(/path="archie-legal"[\s\S]{0,80}AdminArchieLegal/);
  });

  it("has an honest offline indicator (no fake offline chat)", () => {
    expect(layout).toContain("OFFLINE — cached screens only");
  });

  it("has a user-consented update flow, not a silent swap", () => {
    expect(layout).toContain("UPDATE READY — RELOAD");
    expect(layout).toContain("updatefound");
  });
});

describe("ARCHIE PWA — voice & personalization consent wiring", () => {
  const chat = read("supabase/functions/archie-chat/index.ts");
  const ears = read("supabase/functions/archie-ears/index.ts");

  it("archie-chat honors the personalization_memory consent as a REAL gate", () => {
    expect(chat).toContain("personalization_memory");
    expect(chat).toMatch(/revoked \? null : db/);
  });

  it("archie-ears refuses voice processing when voice_audio consent is revoked", () => {
    expect(ears).toContain("voice_audio");
    expect(ears).toContain("VOICE_CONSENT_REVOKED");
  });
});
