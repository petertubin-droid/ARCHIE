// =========================================================
// ARCHIE ASSOCIATIVE MEMORY — EPISODIC SEGMENTER
// supabase/functions/_shared/archie-ai/associative-memory/episodic-segmenter.ts
//
// Segments a sequence of conversation turns into coherent
// episodic units based on temporal gaps, conversation context,
// and topic continuity.
// =========================================================

import { extractEntities, tokenize } from "../native-engine/nlu.ts";
import type { Episode, EpisodicTurnRecord } from "./types.ts";

export const MAX_EPISODE_GAP_MS = 1000 * 60 * 25; // 25-minute gap marks a new episode boundary

/** Content tokens for topic similarity */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "am",
  "do", "does", "did", "of", "to", "in", "on", "for", "with", "and",
  "or", "but", "at", "by", "from", "as", "it", "its", "this", "that",
  "these", "those", "what", "which", "who", "whom", "where", "when", "why", "how",
  "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "their", "our", "all", "will", "have", "has", "had",
]);

export function extractSalientEntities(text: string): string[] {
  const ent = extractEntities(text);
  const entities = new Set<string>();

  if (ent.quantities) {
    for (const q of ent.quantities) entities.add(`${q.value}${q.unit}`);
  }
  if (ent.filePaths) {
    for (const f of ent.filePaths) entities.add(f.toLowerCase());
  }
  if (ent.dates) {
    for (const d of ent.dates) entities.add(d);
  }

  // Also extract notable capitalized multi-word phrases or domain nouns
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(/[^a-zA-Z0-9_-]/g, "");
    if (clean.length > 2 && /^[A-Z][a-z0-9]+/.test(clean)) {
      entities.add(clean.toLowerCase());
    }
  }

  // Keywords with length >= 4 not in stopwords
  const tokens = tokenize(text);
  for (const t of tokens) {
    if (t.length >= 4 && !STOPWORDS.has(t)) {
      if (
        t.includes("project") ||
        t.includes("cost") ||
        t.includes("wall") ||
        t.includes("screed") ||
        t.includes("reinforce") ||
        t.includes("ratio") ||
        t.includes("pour") ||
        t.includes("cement") ||
        t.includes("granite") ||
        t.includes("sand") ||
        t.includes("block") ||
        t.includes("beam") ||
        t.includes("column") ||
        t.includes("slab") ||
        t.includes("delivery") ||
        t.includes("price") ||
        t.includes("supplier") ||
        t.includes("lekki") ||
        t.includes("abuja") ||
        t.includes("lagos") ||
        t.includes("epe") ||
        t.includes("ikeja")
      ) {
        entities.add(t);
      }
    }
  }

  return Array.from(entities);
}

/**
 * Rates the inherent importance [0.1, 1.0] of a turn based on:
 * - Direct directives ("remember that", "we decided", "supplier is")
 * - Quantitative facts, materials, prices, numbers
 * - Commitments and outcomes
 */
export function rateTurnImportance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0.3; // baseline conversational turn

  if (
    lower.includes("remember that") ||
    lower.includes("note that") ||
    lower.includes("always use") ||
    lower.includes("rule:")
  ) {
    score += 0.5;
  }
  if (
    lower.includes("we decided") ||
    lower.includes("settled on") ||
    lower.includes("agreed to") ||
    lower.includes("approved")
  ) {
    score += 0.4;
  }
  if (
    lower.includes("price") ||
    lower.includes("supplier") ||
    lower.includes("cost") ||
    lower.includes("contract")
  ) {
    score += 0.3;
  }
  if (/\b\d+(\.\d+)?\s*(mm|cm|m|kg|naira|ngn|\$|usd|eur|gbp|bags|blocks)\b/i.test(text)) {
    score += 0.25;
  }

  return Math.min(1.0, Math.max(0.1, score));
}

/**
 * Segments an array of EpisodicTurnRecords into contiguous Episodes.
 */
export function segmentTurnsIntoEpisodes(
  turns: EpisodicTurnRecord[],
  conversationId = "default",
): Episode[] {
  if (turns.length === 0) return [];

  const sorted = [...turns].sort((a, b) => a.timestamp - b.timestamp);
  const episodes: Episode[] = [];

  let currentTurnGroup: EpisodicTurnRecord[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const timeDiff = curr.timestamp - prev.timestamp;
    const sameConv = (curr.conversationId || "default") === (prev.conversationId || "default");

    if (timeDiff > MAX_EPISODE_GAP_MS || !sameConv) {
      episodes.push(createEpisodeFromGroup(currentTurnGroup, conversationId, episodes.length));
      currentTurnGroup = [curr];
    } else {
      currentTurnGroup.push(curr);
    }
  }

  if (currentTurnGroup.length > 0) {
    episodes.push(createEpisodeFromGroup(currentTurnGroup, conversationId, episodes.length));
  }

  // Link temporal succession between consecutive episodes
  for (let i = 0; i < episodes.length; i++) {
    if (i > 0) episodes[i].precedingEpisodeId = episodes[i - 1].id;
    if (i < episodes.length - 1) episodes[i].succeedingEpisodeId = episodes[i + 1].id;
  }

  return episodes;
}

function createEpisodeFromGroup(
  group: EpisodicTurnRecord[],
  conversationId: string,
  index: number,
): Episode {
  const startedAt = group[0].timestamp;
  const endedAt = group[group.length - 1].timestamp;
  const turnIds = group.map((t) => t.id);

  const allEntities = new Set<string>();
  let totalImportance = 0;
  for (const t of group) {
    t.entities.forEach((e) => allEntities.add(e));
    totalImportance += t.importance;
  }

  const primaryEntities = Array.from(allEntities);
  const avgImportance = totalImportance / group.length;

  // Title generation: summarize dominant subject/entities
  const firstOwnerTurn = group.find((t) => t.role === "owner") ?? group[0];
  const title =
    primaryEntities.length > 0
      ? `Episode: ${primaryEntities.slice(0, 3).join(", ")}`
      : `Conversation ${new Date(startedAt).toISOString().slice(0, 10)} #${index + 1}`;

  const summary = firstOwnerTurn.text.slice(0, 120);

  const episodeId = `ep_${startedAt}_${index}`;
  group.forEach((t) => {
    t.episodeId = episodeId;
  });

  return {
    id: episodeId,
    title,
    summary,
    conversationId,
    startedAt,
    endedAt,
    turnIds,
    primaryEntities,
    topicTags: primaryEntities.slice(0, 5),
    importance: Math.min(1.0, avgImportance),
    retrievalCount: 0,
    lastRetrievedAt: endedAt,
  };
}
