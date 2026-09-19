// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, INPUT HASH (§22)
//
// A stable digest of every input the analysis depends on. Two
// snapshots with the same hash MUST produce the same analysis,
// which powers the cache: identical data → cached result,
// changed data → invalidated cache → recompute.
//
// Deliberately excludes `now`: the hash covers DATA, not clock
// time, so an unchanged project can reuse a recent analysis
// until its data changes.
//
// Browser-safe: pure-JS FNV-1a (two seeds) over a canonicalized
// JSON string. Not cryptographic, it is a cache key, not a
// security primitive.
// =========================================================

import type { PredictiveProjectSnapshot } from "./types";

export function snapshotInputHash(snapshot: PredictiveProjectSnapshot): string {
  const canonical = canonicalize({
    projectId: snapshot.projectId,
    project: snapshot.project,
    stages: snapshot.stages,
    shoppingItems: snapshot.shoppingItems,
    calculations: snapshot.calculations,
    priceHistory: snapshot.priceHistory,
    marketPrices: snapshot.marketPrices,
    visualObservations: snapshot.visualObservations,
    region: snapshot.region,
  });
  const a = fnv1a(canonical, 0x811c9dc5);
  const b = fnv1a(canonical, 0x01000193);
  // Length is mixed in so equal short digests cannot collide on
  // different-length inputs without also matching the length.
  return `${a.toString(16)}-${b.toString(16)}-${canonical.length.toString(16)}`;
}

function fnv1a(input: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV-1a multiply via imul, then fold to keep unsigned
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
