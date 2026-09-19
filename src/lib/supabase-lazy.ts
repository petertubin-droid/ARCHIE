/**
 * Lazy Supabase client, defers the 200KB @supabase/supabase-js import
 * until the first call, so it doesn't block initial paint / hydration.
 *
 * Use `getSupabase()` in async contexts instead of the static `supabase` export.
 * Use `isSupabaseConfigured` (no Supabase dependency) for config checks.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

let _client: SupabaseClient | null = null;
let _promise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (_client) return Promise.resolve(_client);
  if (_promise) return _promise;

  _promise = import("@supabase/supabase-js").then(({ createClient }) => {
    _client = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return _client;
  });

  return _promise;
}

/**
 * Supabase's functions.invoke() throws a FunctionsHttpError with a generic
 * message ("Edge Function returned a non-2xx status code") when a function
 * responds with a non-2xx status, the actual error body (e.g. our
 * `{ error, code }` JSON) is only available via `error.context`, a Response
 * object, and must be read separately.
 *
 * This is the lazy-loading equivalent of the same helper in `@/lib/supabase`.
 * It dynamically imports `FunctionsHttpError` instead of depending on the
 * eager client, so callers that already use `getSupabase()` (to keep
 * @supabase/supabase-js out of the initial bundle) don't lose that benefit
 * just to get an accurate error message. By the time an edge function call
 * has failed, the module is already loaded, so this import is free.
 *
 * Use this anywhere that calls `supabase.functions.invoke(...)` via the lazy
 * client so users and logs see the real reason (auth required, rate
 * limited, no API key, provider error, etc.) instead of the generic
 * wrapper message.
 */
export async function getFunctionErrorMessage(error: unknown): Promise<string> {
  try {
    const { FunctionsHttpError } = await import("@supabase/supabase-js");
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
        ) {
          return body.error;
        }
      } catch {
        // Response body wasn't JSON, fall through to the generic message below.
      }
    }
  } catch {
    // Dynamic import itself failed, fall through to the generic message below.
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
