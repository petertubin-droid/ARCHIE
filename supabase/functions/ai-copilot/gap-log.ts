// =========================================================
// KNOWLEDGE GAP LOGGING (owner directive 2026-10-18 — tree
// methodology, the roots)
//
// When a FRELUX user asks the Copilot something no engine can
// handle ("unsupported"), that question is the strongest
// signal ARCHIE gets about what FRELUX needs to know. The
// question (normalized, truncated, NO user identity) goes to
// frelux_archie_knowledge_gaps via a SECURITY DEFINER RPC that
// counts repeats without duplicating rows, for the branches
// to research.
//
// HONESTY: gap logging NEVER breaks the Copilot response. A
// failed log is swallowed — the user's answer comes first.
// =========================================================

export interface ServiceLike {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<
    { error: { message: string } | null; data: T | null }
  >;
}

export function normalizeQuestion(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 300);
}

/** Log a knowledge gap. Never throws: a failed log must not
 *  break the Copilot's answer. Returns true when recorded. */
export async function logKnowledgeGap(
  service: ServiceLike | null,
  question: string,
): Promise<boolean> {
  if (!service || !question.trim()) return false;
  try {
    const { error } = await service.rpc("archie_log_knowledge_gap", {
      pQuestion: normalizeQuestion(question),
    });
    return !error;
  } catch {
    return false;
  }
}
