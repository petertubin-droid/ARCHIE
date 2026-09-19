// =========================================================
// FRELUX AI FOUNDATION, Copilot Client
//
// Client for the ai-copilot edge function (NL interpretation only :
// the edge function is FORBIDDEN from computing quantities/costs).
//
// PERFORMANCE & RESILIENCE
//   - in-flight dedupe: identical concurrent requests share one call
//   - 25s timeout via AbortController
//   - single retry on network failure only (never on 4xx)
//   - graceful degradation: falls back to the deterministic parser
//     (zero API cost, works offline) so the Copilot NEVER dead-ends
//   - confirmed user data is never lost on failure
// =========================================================

import { supabase } from '@/lib/supabase';
import { captureAiError } from '@/lib/errorMonitor';
import type { AiFact, CopilotTaskType, InterpretationResult } from './types';
import { interpretRequest } from './orchestrator';

const COPILOT_TIMEOUT_MS = 25_000;

interface CopilotEdgeResponse {
  interpretation: {
    taskType: CopilotTaskType;
    facts: Array<{
      key: string;
      label: string;
      value: number | string | boolean;
      unit?: string;
      evidence?: string;
    }>;
    followUpQuestion?: string;
  };
}

/** In-flight dedupe, same payload shares one request. */
const inFlight = new Map<string, Promise<InterpretationResult>>();

function requestKey(text: string, contextHash: string): string {
  return `${contextHash}:${text.trim().toLowerCase()}`;
}

/**
 * Interpret a natural-language request with AI assistance.
 * Falls back to the deterministic parser on any failure, the
 * Copilot always returns a usable interpretation.
 */
export async function interpretWithAi(text: string, contextHash = ''): Promise<InterpretationResult> {
  const key = requestKey(text, contextHash);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = interpretWithAiOnce(text).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function interpretWithAiOnce(text: string): Promise<InterpretationResult> {
  try {
    const data = await invokeEdgeWithRetry<CopilotEdgeResponse>('ai-copilot', { text });
    const facts: AiFact[] = (data.interpretation.facts ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      unit: f.unit,
      origin: 'ai_interpretation',
      source: 'ai-copilot-edge',
      confidence: 0.8,
      trust: 'needs_confirmation',
      evidence: f.evidence,
      detectedAt: new Date().toISOString(),
    }));
    return {
      taskType: data.interpretation.taskType,
      facts,
      followUpQuestion: data.interpretation.followUpQuestion,
      interpretedBy: 'ai_assisted',
    };
  } catch (error) {
    captureAiError(error instanceof Error ? error : new Error('ai-copilot unavailable'), { feature: 'ai-copilot' });
    // Graceful degradation, deterministic parse, zero API cost.
    return interpretRequest(text);
  }
}

async function invokeEdgeWithRetry<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const attempt = async (): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COPILOT_TIMEOUT_MS);
    try {
      const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
        signal: controller.signal,
      });
      if (error) throw error;
      if (!data) throw new Error('Empty response from ai-copilot');
      return data;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (firstError) {
    // Retry once on network/timeout errors only.
    if (isNetworkError(firstError)) {
      return await attempt();
    }
    throw firstError;
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof TypeError) return true; // fetch network failure
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('network') || message.includes('failed to fetch') || message.includes('timeout');
}
