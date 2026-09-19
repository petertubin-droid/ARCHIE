/**
 * Development-only ad diagnostics.
 *
 * In dev builds, records a compact event trail for every ad integration
 * lifecycle step (script injected / loaded / errored, slot resolved,
 * container rendered, provider response) so a broken integration is
 * diagnosable from the console or `window.__freluxAds.events`.
 *
 * In production builds this entire module is a no-op: `import.meta.env.DEV`
 * is statically `false`, so the bundler tree-shakes every call site and no
 * diagnostic state or logging ships to users. No credentials, zone keys, or
 * private configuration are ever logged, only event names and public
 * identifiers (provider slug, placement key, script host).
 */

export interface AdDiagnosticEvent {
  t: number;
  provider: string;
  event: string;
  detail?: Record<string, unknown>;
}

const isDev = import.meta.env.DEV;

const events: AdDiagnosticEvent[] = [];
const MAX_EVENTS = 200;

/**
 * Record an ad lifecycle event (dev only).
 * Examples: adDebug("adsterra", "script:injected", { src })
 */
export function adDebug(
  provider: string,
  event: string,
  detail?: Record<string, unknown>,
): void {
  if (!isDev) return;
  const entry: AdDiagnosticEvent = { t: Date.now(), provider, event };
  if (detail) entry.detail = detail;
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  try {
    const w = window as unknown as {
      __freluxAds?: { events: AdDiagnosticEvent[] };
    };
    w.__freluxAds ??= { events };
    w.__freluxAds.events = events;
  } catch {
    // window unavailable (SSR/test), keep the in-memory trail only
  }

  console.debug(`[ads] ${provider}, ${event}`, detail ?? "");
}

/** Attach load/error diagnostics to an injected script element (dev only). */
export function instrumentScript(
  provider: string,
  s: HTMLScriptElement,
  label: string,
): void {
  if (!isDev) return;
  s.addEventListener("load", () =>
    adDebug(provider, `${label}:loaded`, { src: s.src }),
  );
  s.addEventListener("error", () =>
    adDebug(provider, `${label}:error`, { src: s.src }),
  );
}
