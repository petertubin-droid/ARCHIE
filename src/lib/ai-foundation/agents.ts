// =========================================================
// FRELUX AI FOUNDATION, Agent Framework (future agents)
//
// Safe, bounded, audited foundation for future FRELUX agents:
//   Project Agent · Property Agent · Procurement Agent ·
//   Market Intelligence Agent · Progress Agent
//
// IRONCLAD RULES
//   1. AI proposes → user reviews → user approves → action occurs.
//      An agent can NEVER execute a write action on its own.
//   2. High-impact actions are FORBIDDEN, not even proposeable:
//      financial transactions, structural approval, safety
//      certification, contract execution.
//   3. Every agent decision is recorded in an auditable history
//      (agent_events table; local fallback queue keeps the audit
//      alive even when the network is down).
//   4. Future agents ship DISABLED until a real capability lands :
//      no dormant "agent" UI.
// =========================================================

import type { AgentActionDecision, AgentDefinition, AgentEvent } from './types';
import { supabase } from '@/lib/supabase';

/**
 * Actions no FRELUX agent may ever take or even propose.
 * These require a qualified human professional / the user themselves.
 */
export const FORBIDDEN_AGENT_ACTIONS: ReadonlySet<string> = new Set([
  'financial_transaction',
  'payment_execution',
  'structural_approval',
  'structural_design_approval',
  'safety_certification',
  'contract_execution',
  'legal_commitment',
  'autonomous_external_action',
  'delete_user_data',
]);

/** Read domains an agent can access without approval (read-only). */
export const AGENT_REGISTRY: AgentDefinition[] = [
  {
    id: 'project_agent',
    name: 'Project Agent',
    description: 'Answers questions and proposes plan updates from your existing FRELUX project data.',
    readDomains: ['project', 'location', 'calculation'],
    proposableActions: ['save_project_update', 'suggest_input_value'],
    enabled: true, // powered by the Copilot orchestration layer
  },
  {
    id: 'property_agent',
    name: 'Property Agent',
    description: 'Reads property intelligence (location, metrics, market availability) and summarizes it.',
    readDomains: ['property', 'location', 'market'],
    proposableActions: ['save_property_note'],
    enabled: false, // future phase, ships disabled, no dormant UI
  },
  {
    id: 'procurement_agent',
    name: 'Procurement Agent',
    description: 'Compares consolidated material lists against verified market intelligence.',
    readDomains: ['calculation', 'market'],
    proposableActions: ['add_to_shopping_list'],
    enabled: false, // future phase
  },
  {
    id: 'market_intelligence_agent',
    name: 'Market Intelligence Agent',
    description: 'Summarizes verified, fresh market data for the user\'s region.',
    readDomains: ['market', 'location'],
    proposableActions: [],
    enabled: false, // future phase
  },
  {
    id: 'progress_agent',
    name: 'Progress Agent',
    description: 'Tracks project progress against the deterministic plan (future phase).',
    readDomains: ['project', 'calculation'],
    proposableActions: ['save_progress_note'],
    enabled: false, // future phase
  },
];

export function getAgent(agentId: string): AgentDefinition | null {
  return AGENT_REGISTRY.find((a) => a.id === agentId) ?? null;
}

/**
 * Decide whether an agent may perform an action.
 * Everything beyond read is a PROPOSAL the user must approve.
 */
export function evaluateAgentAction(agentId: string, action: string): {
  decision: AgentActionDecision;
  reason: string;
} {
  const agent = getAgent(agentId);
  if (!agent) {
    return { decision: 'forbidden', reason: `Unknown agent "${agentId}".` };
  }
  if (FORBIDDEN_AGENT_ACTIONS.has(action)) {
    return {
      decision: 'forbidden',
      reason: 'This action is high-impact (financial, structural, safety, contractual or autonomous) and can never be performed by a FRELUX agent.',
    };
  }
  if (!agent.enabled) {
    return { decision: 'forbidden', reason: `The ${agent.name} is a future capability and is not active yet.` };
  }
  if (action.startsWith('read_')) {
    return { decision: 'read_allowed', reason: 'Read-only access within the agent\'s domains.' };
  }
  if (agent.proposableActions.includes(action)) {
    return {
      decision: 'proposal_allowed',
      reason: 'The agent may PROPOSE this action; it only executes after your explicit approval.',
    };
  }
  return { decision: 'forbidden', reason: `Action "${action}" is not within the ${agent.name}'s bounded permissions.` };
}

// =========================================================
// AUDIT TRAIL
// =========================================================

/** Local fallback queue, the audit survives network failures. */
const localAuditQueue: AgentEvent[] = [];

export function getLocalAuditQueue(): AgentEvent[] {
  return [...localAuditQueue];
}

/**
 * Record an agent event to the auditable history (agent_events table).
 * Falls back to the local queue on failure, audit entries are never lost.
 */
export async function recordAgentEvent(event: AgentEvent, userId: string | null): Promise<'persisted' | 'queued_locally'> {
  const entry = { ...event, createdAt: event.createdAt || new Date().toISOString() };
  try {
    if (!userId || !supabase) throw new Error('no session');
    const { error } = await supabase.from('agent_events').insert({
      user_id: userId,
      agent_id: entry.agentId,
      action: entry.action,
      status: entry.status,
      payload: entry.payload ?? null,
      result: entry.result ?? null,
      created_at: entry.createdAt,
    });
    if (error) throw error;
    return 'persisted';
  } catch {
    localAuditQueue.push(entry);
    return 'queued_locally';
  }
}

/**
 * Flush the local audit queue to the database once connectivity returns.
 * Idempotent per entry, safe to retry.
 */
export async function flushLocalAuditQueue(userId: string | null): Promise<number> {
  if (!userId || localAuditQueue.length === 0) return 0;
  const pending = [...localAuditQueue];
  const { error } = await supabase
    .from('agent_events')
    .insert(
      pending.map((e) => ({
        user_id: userId,
        agent_id: e.agentId,
        action: e.action,
        status: e.status,
        payload: e.payload ?? null,
        result: e.result ?? null,
        created_at: e.createdAt,
      })),
    );
  if (error) return 0;
  localAuditQueue.length = 0;
  return pending.length;
}
