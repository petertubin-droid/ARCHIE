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
    expect(block).toContain("new ArchieNativeEngine()");
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
