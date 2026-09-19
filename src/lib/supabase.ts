import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { createArchieInvoker } from './archie/remote-bridge';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (import.meta.env.DEV && !isSupabaseConfigured) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Database features will be unavailable.'
  );
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key');

/**
 * Derived client that sends the caller's client hash in the
 * `x-client-hash` request header. The RLS policies on
 * advanced_estimates, estimation_estimates and estimation_estimate_items
 * bind anonymous ownership to this header, supabase-js cannot set
 * per-request headers, so these flows go through a second client
 * instance created with a global header instead.
 *
 * The instance is cached per hash (the hash lives in localStorage and
 * does not change during a session). Auth state is shared with the main
 * client through localStorage; autoRefreshToken/detectSessionInUrl are
 * disabled so only the primary client refreshes tokens or parses the
 * URL session, avoiding duplicate refresh races.
 */
let hashBoundClient: SupabaseClient | null = null;
let hashBoundClientHash: string | null = null;

export function supabaseWithClientHash(clientHash: string): SupabaseClient {
  if (!isSupabaseConfigured) return supabase;
  if (hashBoundClient && hashBoundClientHash === clientHash) return hashBoundClient;
  hashBoundClient = createClient(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-client-hash': clientHash },
    },
  });
  hashBoundClientHash = clientHash;
  return hashBoundClient;
}

/**
 * Supabase's functions.invoke() throws a FunctionsHttpError with a generic
 * message ("Edge Function returned a non-2xx status code") when a function
 * responds with a non-2xx, the actual error body (e.g. our
 * `{ error, code }` JSON) is only available via `error.context`, a Response
 * object, and must be read separately.
 *
 * Use this helper anywhere you call `supabase.functions.invoke(...)` so
 * users and logs see the real reason (auth required, rate limited, no API
 * key, provider error, etc.) instead of the generic wrapper message.
 */
export async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // Response body wasn't JSON, fall through to the generic message below.
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}


// =========================================================
// ARCHIE REMOTE BRIDGE (cutover 2026-09-12)
//
// ARCHIE Core lives on its own Supabase project (Frelukx).
// Any functions.invoke("archie-*") from anywhere in this app is
// transparently routed to ARCHIE's home instead of this
// project's edge functions. Non-ARCHIE functions are untouched.
// Identity travels with the user's FRELUX session JWT; ARCHIE
// is back on THIS project (Freluxtools), so verification is
// standard same-project auth. See remote-bridge.ts for details.
// =========================================================

const archieInvoke = createArchieInvoker(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
});

type InvokeFn = typeof supabase.functions.invoke;
const originalInvoke: InvokeFn = supabase.functions.invoke.bind(
  supabase.functions,
);

supabase.functions.invoke = (async (
  functionName: string,
  invokeOptions?: Parameters<InvokeFn>[1],
) => {
  if (typeof functionName === 'string' && functionName.startsWith('archie-')) {
    return archieInvoke(functionName, invokeOptions ?? {});
  }
  return originalInvoke(functionName as never, invokeOptions);
}) as InvokeFn;
