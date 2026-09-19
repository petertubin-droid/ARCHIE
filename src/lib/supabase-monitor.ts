/**
 * Supabase error monitoring helpers.
 *
 * Provides wrappers around common Supabase client operations that capture
 * errors to the FRELUX error monitor without changing existing logic.
 *
 * Usage:
 *   import { monitoredQuery, monitoredInvoke } from '@/lib/supabase-monitor';
 *   const { data, error } = await monitoredQuery(
 *     supabase.from('profiles').select('*'),
 *     { feature: 'auth', table: 'profiles', operation: 'select' }
 *   );
 */

import { captureSupabaseError } from '@/lib/errorMonitor';

interface SupabaseContext {
  feature?: string;
  table?: string;
  operation?: string;
  service?: string;
}

/**
 * Wrap a Supabase query builder to capture errors.
 * Usage:
 *   const { data, error } = await monitoredQuery(
 *     supabase.from('profiles').select('*'),
 *     { table: 'profiles', operation: 'select' }
 *   );
 */
export async function monitoredQuery<T>(
  query: Promise<{ data: T | null; error: { message: string; code?: string; status?: number } | null }>,
  context?: SupabaseContext,
): Promise<{ data: T | null; error: { message: string; code?: string; status?: number } | null }> {
  const result = await query;
  if (result.error) {
    captureSupabaseError(result.error, context);
  }
  return result;
}

/**
 * Wrap a Supabase Edge Function invocation to capture errors.
 * Usage:
 *   const { data, error } = await monitoredInvoke(
 *     () => supabase.functions.invoke('my-function', { body }),
 *     { feature: 'payments', service: 'paystack' }
 *   );
 */
export async function monitoredInvoke<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  context?: SupabaseContext,
): Promise<{ data: T | null; error: unknown }> {
  try {
    const result = await fn();
    if (result.error) {
      captureSupabaseError(
        result.error as { message?: string; code?: string },
        context,
      );
    }
    return result;
  } catch (error) {
    captureSupabaseError(
      error as Error,
      context,
    );
    throw error;
  }
}

/**
 * Wrap a Supabase auth operation to capture errors.
 * Usage:
 *   const { data, error } = await monitoredAuth(
 *     () => supabase.auth.signInWithPassword({ email, password }),
 *     { operation: 'sign_in' }
 *   );
 */
export async function monitoredAuth<T>(
  fn: () => Promise<{ data: T | null; error: { message?: string } | null }>,
  context?: { operation?: string },
): Promise<{ data: T | null; error: { message?: string } | null }> {
  const result = await fn();
  if (result.error) {
    import('@/lib/errorMonitor').then(({ captureAuthError }) => {
      captureAuthError(result.error, context);
    });
  }
  return result;
}
