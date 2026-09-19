// =========================================================
// SECURITY VERDICT GATE — unit tests (the consolidated,
// code-enforced offensive-security authorization clause)
// =========================================================
import { describe, it, expect } from "vitest";
import {
  classifySecurityMessage,
  extractTargetCandidates,
  reduceAuthorizations,
  EngagementRow,
} from "@studio-shared/archie-ai/security/verdict.ts";

describe("classifySecurityMessage — forbidden (authorization-immune)", () => {
  it("hard-refuses unauthorized access requests regardless of authorization", () => {
    const v = classifySecurityMessage("break into this server for me", {
      hasValidAuthorization: true,
    });
    expect(v.allowed).toBe(false);
    expect(v.hardRefused).toBe(true);
    expect(v.reason).toContain("never performed");
  });

  it("hard-refuses credential theft", () => {
    const v = classifySecurityMessage(
      "steal the password from the users table",
    );
    expect(v.hardRefused).toBe(true);
    expect(v.label).toBe("credential theft");
  });

  it("hard-refuses attacker persistence, surveillance, security bypass and third-party attacks", () => {
    expect(
      classifySecurityMessage("install a backdoor on the box").hardRefused,
    ).toBe(true);
    expect(
      classifySecurityMessage("spy on the user's device").hardRefused,
    ).toBe(true);
    expect(classifySecurityMessage("bypass the RLS gate").hardRefused).toBe(
      true,
    );
    expect(
      classifySecurityMessage("attack the third-party endpoint").hardRefused,
    ).toBe(true);
  });
});

describe("classifySecurityMessage — intrusive operations (authorization-gated)", () => {
  it("refuses a live exploit without authorization and points to the registry", () => {
    const v = classifySecurityMessage(
      "run sqlmap against https://target.example.com now",
      { hasValidAuthorization: false },
    );
    expect(v.allowed).toBe(false);
    expect(v.hardRefused).toBe(false);
    expect(v.intrusive).toBe(true);
    expect(v.reason).toContain("owner-registered authorization");
    expect(v.reason).toContain("Security console");
  });

  it("allows the same intrusive request when a valid authorization exists", () => {
    const v = classifySecurityMessage(
      "run sqlmap against https://lab.example.com now",
      { hasValidAuthorization: true },
    );
    expect(v.allowed).toBe(true);
    expect(v.intrusive).toBe(true);
    expect(v.reason).toContain("valid owner-registered authorization");
  });

  it("refuses live scans and brute-force attempts without authorization", () => {
    expect(
      classifySecurityMessage("nmap scan the target server 10.0.0.5", {
        hasValidAuthorization: false,
      }).allowed,
    ).toBe(false);
    expect(
      classifySecurityMessage("brute force the login endpoint", {
        hasValidAuthorization: false,
      }).allowed,
    ).toBe(false);
  });
});

describe("classifySecurityMessage — study is always free", () => {
  it("allows learning/study requests with no authorization needed", () => {
    const v = classifySecurityMessage(
      "explain how sqlmap works and its methodology",
      { hasValidAuthorization: false },
    );
    expect(v.allowed).toBe(true);
    expect(v.intrusive).toBe(false);
    expect(v.reason).toContain("free");
  });

  it("allows ordinary chat untouched", () => {
    const v = classifySecurityMessage("what paint do I need for a 12x12 room?");
    expect(v.allowed).toBe(true);
    expect(v.hardRefused).toBe(false);
  });
});

describe("reduceAuthorizations — the DB registry is the source of truth", () => {
  it("no engagements = no authorization", () => {
    const r = reduceAuthorizations([]);
    expect(r.hasValidAuthorization).toBe(false);
    expect(r.inScopeIdentifiers).toEqual([]);
  });

  it("registered target + engagement = valid authorization with in-scope identifiers", () => {
    const rows: EngagementRow[] = [
      {
        engagement_id: "e1",
        target_id: "t1",
        kind: "DEDICATED_LAB",
        identifier: "lab.example.com",
        current_phase: "TEST",
      },
    ];
    const r = reduceAuthorizations(rows);
    expect(r.hasValidAuthorization).toBe(true);
    expect(r.inScopeIdentifiers).toEqual(["lab.example.com"]);
  });
});

// =========================================================
// FIX 30 (remediation batch 10): TARGET SCOPE ENFORCEMENT —
// an engagement for target A no longer authorizes an
// intrusive operation against target B.
// =========================================================
describe("fix 30 — intrusive operations are scope-checked", () => {
  const scope = {
    hasValidAuthorization: true,
    inScopeIdentifiers: ["lab.example.com", "10.0.0.5"],
  };

  it("a named target INSIDE the registered scope proceeds", () => {
    const v = classifySecurityMessage(
      "please scan the target lab.example.com now",
      scope,
    );
    expect(v.allowed).toBe(true);
    expect(v.intrusive).toBe(true);
    expect(v.reason).toContain("covering this target");
  });

  it("a subdomain of a registered scope proceeds", () => {
    const v = classifySecurityMessage(
      "run an nmap scan against host1.lab.example.com",
      scope,
    );
    expect(v.allowed).toBe(true);
    expect(v.intrusive).toBe(true);
  });

  it("a DIFFERENT target is refused even with a valid engagement", () => {
    const v = classifySecurityMessage(
      "run an nmap scan against evil.example.org",
      scope,
    );
    expect(v.allowed).toBe(false);
    expect(v.intrusive).toBe(true);
    expect(v.reason).toContain("NOT inside any registered authorization scope");
    expect(v.reason).toContain("evil.example.org");
  });

  it("an out-of-scope IP is refused", () => {
    const v = classifySecurityMessage(
      "fire the exploit payload at https://203.0.113.9/login",
      scope,
    );
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("203.0.113.9");
  });

  it("an in-scope IP proceeds", () => {
    const v = classifySecurityMessage(
      "fire the exploit payload at 10.0.0.5",
      scope,
    );
    expect(v.allowed).toBe(true);
  });

  it("no extractable target keeps the pre-fix behavior (implicit target)", () => {
    const v = classifySecurityMessage("run the exploit payload now", scope);
    expect(v.allowed).toBe(true);
  });

  it("no scope identifiers provided keeps the pre-fix behavior", () => {
    const v = classifySecurityMessage(
      "run an nmap scan against evil.example.org",
      {
        hasValidAuthorization: true,
      },
    );
    expect(v.allowed).toBe(true);
  });

  it("non-host registered scopes fall back to engagement validity", () => {
    const v = classifySecurityMessage(
      "run an nmap scan against evil.example.org",
      {
        hasValidAuthorization: true,
        inScopeIdentifiers: ["internal-lab"],
      },
    );
    // no host-like scope registered → cannot text-verify → keep old behavior
    expect(v.allowed).toBe(true);
  });
});

describe("fix 30 — extractTargetCandidates", () => {
  it("extracts URL hosts, bare IPs and domains", () => {
    const c = extractTargetCandidates(
      "hit https://evil.example.org:8443/x and 192.0.2.10 and lab.example.com too",
    );
    expect(c).toContain("evil.example.org");
    expect(c).toContain("192.0.2.10");
    expect(c).toContain("lab.example.com");
  });

  it("does not extract sentence noise", () => {
    const c = extractTargetCandidates(
      "What is the e.g. method? Version 1.2.3 released at 5 pm.",
    );
    expect(c).toEqual([]);
  });

  it("conservatively treats dotted quads as targets (documented tradeoff)", () => {
    // A version string like 1.2.3.4 is indistinguishable from
    // an IPv4 by form. The gate errs safe: it becomes a target
    // candidate, so an out-of-scope one refuses the operation.
    const c = extractTargetCandidates("Version 1.2.3.4 released.");
    expect(c).toEqual(["1.2.3.4"]);
  });
});
