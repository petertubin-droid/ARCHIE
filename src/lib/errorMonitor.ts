/**
 * FRELUX Error Monitor, centralized client-side error capture.
 *
 * Captures: JS runtime errors, unhandled promise rejections, React errors,
 * API failures, Supabase errors, auth errors, calculator errors, AI errors,
 * payment errors, marketplace errors, and PWA/service-worker errors.
 *
 * Features:
 * - Sanitization of all sensitive data before sending
 * - Offline queue (max 20 entries, flushed on reconnect)
 * - Deduplication client-side (same error within 2s = single report)
 * - Non-blocking, fire-and-forget (never throws, never loops)
 * - App version tracking via build-time injection
 */

import { getSupabase } from '@/lib/supabase-lazy';

// ── Types ──

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ErrorType =
  | 'runtime'
  | 'react'
  | 'promise_rejection'
  | 'api_request'
  | 'supabase'
  | 'auth'
  | 'calculator'
  | 'ai'
  | 'payment'
  | 'marketplace'
  | 'pwa'
  | 'unknown';

interface ErrorReport {
  severity: ErrorSeverity;
  error_type: ErrorType;
  message: string;
  stack_trace?: string | null;
  route?: string | null;
  feature?: string | null;
  calculator?: string | null;
  http_status?: number | null;
  service?: string | null;
  metadata?: Record<string, unknown>;
}

// ── Client info detection ──

function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Chrome\/(\d+)/.test(ua) && !/Edg|OPR|Brave/.test(ua)) return 'Chrome';
  if (/Firefox\/(\d+)/.test(ua)) return 'Firefox';
  if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  if (/Edg\/(\d+)/.test(ua)) return 'Edge';
  if (/OPR\/(\d+)/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  return 'Other';
}

function detectOS(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

function detectDeviceType(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Mobile|Android|iPhone|iPod/.test(ua)) return 'mobile';
  if (/iPad|Tablet/.test(ua)) return 'tablet';
  return 'desktop';
}

function getAppVersion(): string {
  // Vite injects this at build time
  return (
    (import.meta.env.VITE_APP_VERSION as string) ||
    (import.meta.env.VITE_SENTRY_RELEASE as string) ||
    import.meta.env.MODE ||
    'unknown'
  );
}

function getSessionId(): string {
  const KEY = 'frelux_session_id';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

function getRoute(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.pathname + window.location.search;
}

// ── Sanitization ──

const SENSITIVE_PATTERNS = [
  /password[=: ]+\S+/gi,
  /token[=: ]+\S+/gi,
  /api[_-]?key[=: ]+\S+/gi,
  /secret[=: ]+\S+/gi,
  /authorization[=: ]+\S+/gi,
  /bearer\s+\S+/gi,
  /sk_live_\S+/gi,
  /sk_test_\S+/gi,
  /pk_live_\S+/gi,
  /pk_test_\S+/gi,
];

function sanitize(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  if (result.length > 4000) {
    result = result.substring(0, 4000) + '...[truncated]';
  }
  return result;
}

function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    // Skip sensitive keys entirely
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('credit') ||
      lowerKey.includes('card')
    ) {
      continue;
    }
    if (typeof value === 'string') {
      cleaned[key] = sanitize(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ── Severity classification ──

function classifySeverity(
  errorType: ErrorType,
  message: string,
  httpStatus?: number | null,
): ErrorSeverity {
  const msg = message.toLowerCase();

  // Critical: app-wide failures, security, database outage
  if (
    msg.includes('network') ||
    msg.includes('websocket') ||
    msg.includes('database') ||
    msg.includes('outage') ||
    msg.includes('security') ||
    msg.includes('session expired') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden')
  ) {
    return 'critical';
  }

  // High: calculator, AI, payment, auth, marketplace failures
  if (
    errorType === 'calculator' ||
    errorType === 'ai' ||
    errorType === 'payment' ||
    errorType === 'auth' ||
    errorType === 'marketplace' ||
    (httpStatus && httpStatus >= 500)
  ) {
    return 'high';
  }

  // Medium: feature-level failures
  if (
    errorType === 'api_request' ||
    errorType === 'supabase' ||
    errorType === 'react' ||
    (httpStatus && httpStatus >= 400 && httpStatus < 500)
  ) {
    return 'medium';
  }

  return 'low';
}

// ── Client-side dedup ──

const recentReports = new Map<string, number>();

function shouldDedupe(fingerprint: string): boolean {
  const now = Date.now();
  const last = recentReports.get(fingerprint);
  if (last && now - last < 2000) {
    return true; // Already reported within 2 seconds
  }
  recentReports.set(fingerprint, now);
  // Clean old entries every 100 reports
  if (recentReports.size > 100) {
    for (const [key, time] of recentReports) {
      if (now - time > 60000) recentReports.delete(key);
    }
  }
  return false;
}

function clientFingerprint(errorType: string, message: string, route?: string): string {
  const firstLine = message.split('\n')[0].slice(0, 200);
  return `${errorType}|${firstLine}|${route || ''}`;
}

// ── Offline queue ──

const OFFLINE_QUEUE_KEY = 'frelux_error_queue';
const MAX_QUEUE_SIZE = 20;

function getOfflineQueue(): ErrorReport[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: ErrorReport[]): void {
  try {
    if (queue.length > MAX_QUEUE_SIZE) {
      queue = queue.slice(-MAX_QUEUE_SIZE);
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Silently fail, never let monitoring break the app
  }
}

// ── Core: send error to edge function ──

let isFlushing = false;

async function sendToServer(report: ErrorReport): Promise<boolean> {
  const supabase = await getSupabase();

  const payload = {
    ...report,
    route: report.route ?? getRoute(),
    browser: detectBrowser(),
    operating_system: detectOS(),
    device_type: detectDeviceType(),
    app_version: getAppVersion(),
    session_id: getSessionId(),
    metadata: report.metadata ? sanitizeMetadata(report.metadata) : undefined,
  };

  try {
    const { error } = await supabase.functions.invoke('report-error', {
      body: JSON.stringify(payload),
    });

    if (error) {
      // Network error or function error, queue for retry
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function flushQueue(): Promise<void> {
  if (isFlushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isFlushing = true;
  try {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const remaining: ErrorReport[] = [];
    for (const report of queue) {
      const success = await sendToServer(report);
      if (!success) {
        remaining.push(report);
      }
    }
    saveOfflineQueue(remaining);
  } finally {
    isFlushing = false;
  }
}

// ── Public API ──

/**
 * Report an error to the FRELUX monitoring system.
 * Non-blocking, fire-and-forget. Never throws.
 */
export function reportError(
  report: Omit<ErrorReport, 'severity'> & { severity?: ErrorSeverity },
): void {
  try {
    const severity = report.severity ?? classifySeverity(
      report.error_type,
      report.message,
      report.http_status ?? null,
    );

    const fullReport: ErrorReport = {
      ...report,
      severity,
      message: sanitize(report.message),
      stack_trace: report.stack_trace ? sanitize(report.stack_trace) : null,
      route: report.route ?? getRoute(),
      metadata: report.metadata ? sanitizeMetadata(report.metadata) : undefined,
    };

    // Client-side dedup
    const fp = clientFingerprint(fullReport.error_type, fullReport.message, fullReport.route ?? undefined);
    if (shouldDedupe(fp)) return;

    // If offline, queue and return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queue = getOfflineQueue();
      queue.push(fullReport);
      saveOfflineQueue(queue);
      return;
    }

    // Fire and forget
    sendToServer(fullReport)
      .then((success) => {
        if (!success) {
          const queue = getOfflineQueue();
          queue.push(fullReport);
          saveOfflineQueue(queue);
        }
      })
      .catch(() => {
        // Silently fail, never create an error loop
      });
  } catch {
    // Never let error reporting itself throw
  }
}

/**
 * Capture a JavaScript Error object.
 */
export function captureError(
  error: Error | unknown,
  options: Partial<Pick<ErrorReport, 'error_type' | 'feature' | 'calculator' | 'service' | 'http_status' | 'severity' | 'metadata'>> = {},
): void {
  if (!error) return;

  const isErr = error instanceof Error;
  const message = isErr ? error.message : String(error);
  const stack = isErr ? error.stack : null;

  reportError({
    error_type: options.error_type ?? 'runtime',
    message,
    stack_trace: stack,
    ...options,
  });
}

/**
 * Capture a Supabase error response.
 */
export function captureSupabaseError(
  error: { message?: string; code?: string; status?: number } | Error,
  context?: { feature?: string; table?: string; operation?: string; service?: string },
): void {
  const message = error instanceof Error
    ? error.message
    : (error as Record<string, unknown>).message as string ?? 'Supabase error';

  reportError({
    error_type: 'supabase',
    message,
    feature: context?.feature,
    service: context?.service ?? context?.table ?? 'supabase',
    http_status: (error as Record<string, unknown>).status as number ?? null,
    metadata: context?.operation ? { operation: context.operation } : undefined,
  });
}

/**
 * Capture an API request failure.
 */
export function captureApiError(
  error: Error | { message?: string; status?: number },
  context?: { url?: string; method?: string; feature?: string; service?: string },
): void {
  const message = error instanceof Error
    ? error.message
    : (error as Record<string, unknown>).message as string ?? 'API request failed';

  reportError({
    error_type: 'api_request',
    message,
    feature: context?.feature,
    service: context?.service,
    http_status: (error as Record<string, unknown>).status as number ?? null,
    metadata: context?.url
      ? { url: sanitize(context.url), method: context.method }
      : undefined,
  });
}

/**
 * Capture a calculator error.
 */
export function captureCalculatorError(
  calculatorName: string,
  error: Error | unknown,
): void {
  captureError(error, {
    error_type: 'calculator',
    calculator: calculatorName,
    feature: 'calculator',
    severity: 'high',
  });
}

/**
 * Capture an AI feature error.
 */
export function captureAiError(
  error: Error | unknown,
  context?: { feature?: string; provider?: string },
): void {
  captureError(error, {
    error_type: 'ai',
    feature: context?.feature ?? 'ai',
    service: context?.provider ?? 'ai',
    severity: 'high',
    metadata: context ? { provider: context.provider } : undefined,
  });
}

/**
 * Capture a payment error.
 */
export function capturePaymentError(
  error: Error | unknown,
  context?: { feature?: string; provider?: string },
): void {
  captureError(error, {
    error_type: 'payment',
    feature: context?.feature ?? 'payment',
    service: context?.provider ?? 'payment',
    severity: 'high',
    metadata: context ? { provider: context.provider } : undefined,
  });
}

/**
 * Capture a marketplace error.
 */
export function captureMarketplaceError(
  error: Error | unknown,
  context?: { feature?: string; operation?: string },
): void {
  captureError(error, {
    error_type: 'marketplace',
    feature: context?.feature ?? 'marketplace',
    metadata: context?.operation ? { operation: context.operation } : undefined,
  });
}

/**
 * Capture an auth error.
 */
export function captureAuthError(
  error: Error | unknown,
  context?: { operation?: string },
): void {
  captureError(error, {
    error_type: 'auth',
    feature: 'authentication',
    severity: 'high',
    metadata: context?.operation ? { operation: context.operation } : undefined,
  });
}

// ── Global error listeners ──

let initialized = false;

/**
 * Initialize global error listeners.
 * Call once at app startup.
 */
export function initErrorMonitor(): void {
  if (initialized) return;
  initialized = true;

  // ── JavaScript runtime errors ──
  window.addEventListener('error', (event: ErrorEvent) => {
    if (!event.message && !event.error) return;
    reportError({
      error_type: 'runtime',
      message: event.message || event.error?.message || 'Unknown error',
      stack_trace: event.error?.stack ?? null,
    });
  });

  // ── Unhandled promise rejections ──
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message :
      typeof reason === 'string' ? reason :
      'Unhandled promise rejection';
    const stack = reason instanceof Error ? reason.stack : null;

    reportError({
      error_type: 'promise_rejection',
      message,
      stack_trace: stack,
    });
  });

  // ── Online/offline → flush queue ──
  window.addEventListener('online', () => {
    flushQueue().catch(() => {});
  });

  // ── PWA service worker errors ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_ERROR' && event.data?.message) {
        reportError({
          error_type: 'pwa',
          message: String(event.data.message),
          stack_trace: event.data.stack ?? null,
          feature: 'service-worker',
        });
      }
    });
  }

  // ── Flush any queued errors from a previous session ──
  flushQueue().catch(() => {});
}

/**
 * Wrap a function with error capture.
 * If the function throws, the error is captured and re-thrown (or returns a fallback).
 */
export function withErrorCapture<T extends (...args: never[]) => unknown>(
  fn: T,
  context: { calculator?: string; feature?: string; error_type?: ErrorType },
  fallback?: unknown,
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);
      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error) => {
          if (context.calculator) {
            captureCalculatorError(context.calculator, error);
          } else {
            captureError(error, context);
          }
          return fallback;
        });
      }
      return result;
    } catch (error) {
      if (context.calculator) {
        captureCalculatorError(context.calculator, error);
      } else {
        captureError(error, context);
      }
      return fallback;
    }
  }) as T;
}
