import { supabase, getFunctionErrorMessage } from '@/lib/supabase';

// ── Types ──

export interface ErrorDiagnosis {
  what_failed: string;
  where_failed: string;
  root_cause: string;
  affected_file: string;
  category: string;
  proposed_solution: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  protected_functionality_affected: boolean;
  recommended_action: string;
}

export interface ErrorFix {
  file: string;
  existing_code: string;
  proposed_code: string;
  explanation: string;
  risk_level: 'low' | 'medium' | 'high';
  expected_effect: string;
  protected_functionality_affected: boolean;
}

export interface ErrorFixHistoryRecord {
  id: string;
  error_id: string;
  error_message: string;
  error_type: string | null;
  error_severity: string | null;
  diagnosis: Record<string, unknown>;
  proposed_fix: Record<string, unknown>;
  applied_changes: Record<string, unknown>;
  status: 'analyzing' | 'fix_proposed' | 'awaiting_approval' | 'validation_failed' | 'approved' | 'deployed' | 'verified' | 'failed' | 'rolled_back';
  approved_by: string | null;
  approved_at: string | null;
  validation_result: Record<string, unknown>;
  verification_result: Record<string, unknown>;
  created_at: string;
  deployed_at: string | null;
  verified_at: string | null;
  updated_at: string;
}

// ── Sanitize error data for AI submission ──

const SENSITIVE_KEYS = ['password', 'token', 'api_key', 'apikey', 'secret', 'authorization', 'access_token', 'refresh_token', 'card', 'cvv', 'ssn', 'private_key'];

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // Remove anything that looks like a key, token, or credential
    const sanitized = value
      .replace(/sk_[a-zA-Z0-9]{20,}/gi, '[REDACTED]')
      .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      .replace(/pk_[a-zA-Z0-9]{20,}/gi, '[REDACTED]')
      .replace(/service_role[a-zA-Z0-9]*/gi, '[REDACTED]')
      .replace(/supabase[a-zA-Z0-9]{20,}/gi, '[REDACTED]');
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(val);
      }
    }
    return sanitized;
  }
  return value;
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  return sanitizeValue(metadata) as Record<string, unknown>;
}

// ── Build error context for AI ──

export function buildErrorContext(error: {
  id: string;
  message: string;
  error_type: string;
  severity: string;
  stack_trace: string | null;
  route: string | null;
  feature: string | null;
  calculator: string | null;
  http_status: number | null;
  service: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  app_version: string | null;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  metadata: Record<string, unknown>;
}) {
  return {
    errorId: error.id,
    errorData: {
      message: error.message,
      error_type: error.error_type,
      severity: error.severity,
      stack_trace: error.stack_trace,
      route: error.route,
      feature: error.feature,
      calculator: error.calculator,
      http_status: error.http_status,
      service: error.service,
      browser: error.browser,
      operating_system: error.operating_system,
      device_type: error.device_type,
      app_version: error.app_version,
      occurrence_count: error.occurrence_count,
      first_seen: error.first_seen,
      last_seen: error.last_seen,
      metadata: sanitizeMetadata(error.metadata ?? {}),
    },
  };
}

// ── Analyze error with AI Studio ──

export async function analyzeErrorWithAI(error: Parameters<typeof buildErrorContext>[0]): Promise<{ diagnosis: ErrorDiagnosis; rawResponse: string }> {
  const errorContext = buildErrorContext(error);

  const { data, error: invokeError } = await supabase.functions.invoke<{ response: string; tool: string } | { error: string; code?: string }>('ai-studio', {
    body: {
      tool: 'error_analysis',
      prompt: 'Analyze this error',
      context: { errorContext },
      errorAction: 'diagnose',
    },
  });

  if (invokeError) {
    throw new Error(await getFunctionErrorMessage(invokeError));
  }

  if (!data) throw new Error('No response from AI service.');

  if ('error' in data && data.error) {
    throw new Error(data.error);
  }

  if (!('response' in data) || !data.response) {
    throw new Error('The AI response was incomplete.');
  }

  // Parse the JSON diagnosis from the response
  const rawResponse = data.response;
  let diagnosis: ErrorDiagnosis;
  try {
    diagnosis = JSON.parse(rawResponse);
  } catch {
    // Try to extract JSON from markdown
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      diagnosis = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback: construct a minimal diagnosis from the text
      diagnosis = {
        what_failed: rawResponse.slice(0, 200),
        where_failed: 'See response',
        root_cause: rawResponse,
        affected_file: 'unknown',
        category: 'unknown',
        proposed_solution: 'See raw AI response',
        risk_level: 'medium',
        protected_functionality_affected: false,
        recommended_action: 'Review the raw AI response for details',
      };
    }
  }

  return { diagnosis, rawResponse };
}

// ── Generate fix with AI Studio ──

export async function generateErrorFix(error: Parameters<typeof buildErrorContext>[0], diagnosis?: ErrorDiagnosis): Promise<{ fix: ErrorFix; rawResponse: string }> {
  const errorContext = buildErrorContext(error);

  // Include diagnosis in the prompt if available
  const prompt = diagnosis
    ? `Based on this diagnosis: ${JSON.stringify(diagnosis)}, generate a proposed code fix for the error.`
    : 'Generate a proposed code fix for this error.';

  const { data, error: invokeError } = await supabase.functions.invoke<{ response: string; tool: string } | { error: string; code?: string }>('ai-studio', {
    body: {
      tool: 'error_fix',
      prompt,
      context: { errorContext },
      errorAction: 'generate_fix',
    },
  });

  if (invokeError) {
    throw new Error(await getFunctionErrorMessage(invokeError));
  }

  if (!data) throw new Error('No response from AI service.');

  if ('error' in data && data.error) {
    throw new Error(data.error);
  }

  if (!('response' in data) || !data.response) {
    throw new Error('The AI response was incomplete.');
  }

  const rawResponse = data.response;
  let fix: ErrorFix;
  try {
    fix = JSON.parse(rawResponse);
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      fix = JSON.parse(jsonMatch[0]);
    } else {
      fix = {
        file: 'unknown',
        existing_code: '',
        proposed_code: '',
        explanation: rawResponse,
        risk_level: 'unknown' as ErrorFix['risk_level'],
        expected_effect: 'See raw response',
        protected_functionality_affected: false,
      };
    }
  }

  return { fix, rawResponse };
}

// ── Fetch fix history ──

export async function fetchFixHistory(limit = 50): Promise<ErrorFixHistoryRecord[]> {
  const { data, error } = await supabase
    .from('error_fix_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ErrorFixHistoryRecord[];
}

// ── Fetch fix history for a specific error ──

export async function fetchFixHistoryForError(errorId: string): Promise<ErrorFixHistoryRecord[]> {
  const { data, error } = await supabase
    .from('error_fix_history')
    .select('*')
    .eq('error_id', errorId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ErrorFixHistoryRecord[];
}

// ── Approve a fix ──

export async function approveFix(fixHistoryId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('error_fix_history')
    .update({
      status: 'approved',
      approved_by: userData.user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', fixHistoryId);

  if (error) throw new Error(error.message);
}

// ── Update fix status ──

export async function updateFixStatus(
  fixHistoryId: string,
  status: ErrorFixHistoryRecord['status'],
  extra?: Record<string, unknown>,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  if (status === 'deployed') update.deployed_at = new Date().toISOString();
  if (status === 'verified') update.verified_at = new Date().toISOString();

  const { error } = await supabase.from('error_fix_history').update(update).eq('id', fixHistoryId);
  if (error) throw new Error(error.message);
}

// ── Fetch recent errors for AI Studio sidebar ──

export async function fetchRecentErrorsForStudio(limit = 20): Promise<{
  id: string;
  message: string;
  severity: string;
  error_type: string;
  feature: string | null;
  route: string | null;
  occurrence_count: number;
  last_seen: string;
  resolved: boolean;
}[]> {
  const { data, error } = await supabase
    .from('application_errors')
    .select('id, message, severity, error_type, feature, route, occurrence_count, last_seen, resolved')
    .eq('resolved', false)
    .order('last_seen', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
