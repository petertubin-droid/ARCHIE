// Visitor isolation guard for the archie-chat edge function.
//
// Visitors (every non-owner request, including FRELUX site visitors)
// must run on an isolated, non-persistent engine and must never reach
// the cognitive kernel, the world model, or owner memory. The check is
// structural: it reads the source and pins the boundary, so a future
// edit that routes visitor traffic into owner state fails here.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

const VISITOR_START = "  if (!isOwner) {";
const VISITOR_END = "  // 3. Resolve the inference engine";

function visitorBlock(): string {
  const start = source.indexOf(VISITOR_START);
  const end = source.indexOf(VISITOR_END, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("archie-chat visitor isolation", () => {
  it("visitor branch runs on a fresh isolated engine with no tools", () => {
    const block = visitorBlock();
    expect(block).toContain("new ArchieNativeEngine({");
    expect(block).toContain('sessionKind: "guest"');
    expect(block).toContain("tools: []");
  });

  it("visitor branch never touches the cognitive kernel or world model", () => {
    const block = visitorBlock();
    for (const forbidden of [
      "getCognitiveEngine",
      "createRequestCognitiveEngine",
      "CognitiveKernel",
      "WorldModel",
      "ownerUserId",
      "resolveArchieCapabilityEngine",
    ]) {
      expect(block, `visitor block references ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("owner kernel is built only after the visitor branch returns", () => {
    const visitorEnd = source.indexOf(VISITOR_START) + visitorBlock().length;
    const firstKernel = Math.min(
      ...["createRequestCognitiveEngine(", "getCognitiveEngine()"]
        .map((needle) => source.indexOf(needle))
        .filter((i) => i > -1),
    );
    expect(firstKernel).toBeGreaterThan(visitorEnd);
  });

  it("owner identity is derived only from the owner check", () => {
    expect(source).toContain("const ownerUserId = isOwner && user ? user.id : null;");
  });
});

/** FORENSIC AUDIT 2026-10-20 (observability): the owner cycle's
 *  degradation catch was SILENT — a swallowed exception is
 *  untraceable from the surface. The catch must capture the
 *  error and state the degradation (with reason) in the reply. */
describe("owner cycle degradation honesty", () => {
  it("the cycle catch is no longer silent: reason is captured and stated", () => {
    expect(source).toContain("} catch (err) {");
    expect(source).toContain(
      "Cognitive loop degraded to single-pass substrate",
    );
    expect(source).toContain("degradeReason");
  });

  it("the verified lexicon is wired for owner requests regardless of consent", () => {
    // the owner kernel call must pass the db as its third
    // (lexiconDb) argument, separate from consent-gated persistence
    const kernelCall = source.indexOf("createRequestCognitiveEngine(");
    expect(kernelCall).toBeGreaterThan(-1);
    const callBody = source.slice(kernelCall, kernelCall + 1200);
    expect(callBody).toContain("conversationId,");
    expect(callBody).toMatch(
      /\(db as unknown as import\(["']\.\.\/_shared/,
    );
  });
});

describe("multilingual notice on visitor and API-credential paths (batch 41)", () => {
  it("visitor path applies detectLanguage + multilingualReply before responding", () => {
    // BATCH 46: detection happens ONCE at entry on the
    // ORIGINAL message; the visitor wrapper uses the
    // entry-level detection so normalization never erases
    // the language notice.
    expect(source).toMatch(/const langDetection = detectLanguage\(rawMessage\);/);
    expect(source).toMatch(/const visitorReply = multilingualReply\(langDetection, text\);/);
    expect(source).toMatch(/reply: sanitize\(visitorReply\)/);
  });

  it("api-credential path applies the same honest notice", () => {
    expect(source).toMatch(/const credReply = multilingualReply\(langDetection, text\);/);
    expect(source).toMatch(/reply: sanitize\(credReply\)/);
  });

  it("the owner path multilingual treatment is unchanged", () => {
    expect(source).toMatch(/const replyText = multilingualReply\(langDetection, text\);/);
  });
});
