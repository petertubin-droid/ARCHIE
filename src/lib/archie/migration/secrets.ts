// =========================================================
// FRELUX ARCHIE MIGRATION — SECRET BOUNDARY (spec §5, §20, §24)
//
// Two jobs:
//   1. SCAN — detect accidentally embedded secrets in package
//      content BEFORE export and BEFORE restore. Detection is
//      fail-closed: a match stops the operation.
//   2. TEMPLATE — generate the secure placeholder template a
//      restored environment uses to re-authorize secrets.
//
// Secrets are NEVER auto-packaged, NEVER displayed in migration
// logs, and NEVER accepted inside a package without a hard stop.
// =========================================================

import type { PackageFile } from "./types";

/**
 * High-signal secret patterns. Deliberately conservative to keep
 * false positives near zero, but broad enough to catch the
 * realistic accident: a service key pasted into config or data.
 */
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Supabase service-role / anon keys (sbp_/, legacy JWT-shaped keys with role claims)
  {
    name: "Supabase service-role key",
    re: /sbp_[A-Za-z0-9_-]{20,}/,
  },
  {
    name: "Supabase service/anon JWT",
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  // OpenAI / Anthropic / Gemini style API keys
  { name: "OpenAI API key", re: /sk-(proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{30,}/ },
  // Paystack / Stripe secrets
  { name: "Paystack secret key", re: /sk_(live|test)_[0-9a-f]{20,}/ },
  { name: "Stripe secret key", re: /sk_(live|test)_[0-9a-zA-Z]{20,}/ },
  // PEM private key blocks
  { name: "PEM private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // Password assignments in config-like content (not in normal prose)
  {
    name: "Password assignment",
    re: /^\s*(password|passwd|db_password|database_password)\s*[:=]\s*\S+$/im,
  },
];

/**
 * Placeholders the migration system writes INSTEAD of secrets.
 * These are intentionally allowed through the scanner.
 */
export const SECRET_PLACEHOLDER_SUFFIX = "REQUIRED_AFTER_RESTORE";

export function isSecretPlaceholder(value: string): boolean {
  return value.includes(SECRET_PLACEHOLDER_SUFFIX);
}

export interface SecretScanHit {
  path: string;
  patternName: string;
}

/**
 * Scan every file of a package for embedded secrets.
 * Returns ALL hits so the owner sees the full picture (spec §20:
 * "WARN AND STOP").
 */
export function scanFilesForSecrets(files: PackageFile[]): SecretScanHit[] {
  const hits: SecretScanHit[] = [];
  for (const file of files) {
    if (file.encoding === "base64") {
      // Binary content cannot be meaningfully scanned; checksums
      // still protect it. Note as a warning at verify time.
      continue;
    }
    for (const { name, re } of SECRET_PATTERNS) {
      // Ignore our own placeholder templates (they mention key NAMES)
      const matches = file.content.match(new RegExp(re.source, "gm"));
      if (!matches) continue;
      for (const m of matches) {
        if (isSecretPlaceholder(m)) continue;
        hits.push({ path: file.path, patternName: name });
        break;
      }
    }
  }
  return hits;
}

/**
 * The secure secrets template placed in every migration package.
 * Contains key NAMES and where to obtain them — never values.
 */
export function secretsTemplate(): { path: string; content: string } {
  const content = [
    "# ARCHIE / FRELUX migration package — secrets template",
    "#",
    "# This package contains NO secrets by design (spec §5).",
    "# After restoring ARCHIE on a new environment, obtain each value",
    "# from the ORIGINAL environment's secret store and fill it in here.",
    "# Never commit this file with real values.",
    "",
    "# --- Database ---",
    "SUPABASE_URL=REQUIRED_AFTER_RESTORE",
    "SUPABASE_ANON_KEY=REQUIRED_AFTER_RESTORE",
    "SUPABASE_SERVICE_KEY=REQUIRED_AFTER_RESTORE",
    "",
    "# --- AI providers (external models stay external) ---",
    "AI_PROVIDER_API_KEY=REQUIRED_AFTER_RESTORE",
    "",
    "# --- Payments ---",
    "PAYSTACK_SECRET_KEY=REQUIRED_AFTER_RESTORE",
    "",
    "# --- Deployment ---",
    "NETLIFY_AUTH_TOKEN=REQUIRED_AFTER_RESTORE",
    "GITHUB_TOKEN=REQUIRED_AFTER_RESTORE",
    "",
    "# --- ARCHIE owner authority ---",
    "# The owner authorization secret is a PBKDF2 hash on the server.",
    "# A restored environment must RE-AUTHORIZE the owner (spec §24):",
    "# the package cannot carry owner authority across environments.",
    "OWNER_AUTH_SECRET=REQUIRED_AFTER_RESTORE",
    "",
  ].join("\n");
  return { path: "configuration/secrets-template.env", content };
}

/** Non-secret configuration keys that ARE safe to export. */
export const EXPORTABLE_CONFIG_KEYS = [
  "ads_enabled",
  "ai_admin_override",
  "estimation_admin_override",
  "premium_subscriptions_enabled",
  "seo_title",
  "seo_description",
  "hero_headline",
  "hero_subheadline",
  "site_name",
  "short_name",
  "tagline",
  "description",
  "contact_email",
] as const;

/** Config keys that are NEVER exported (secrets or environment-bound). */
export const NON_EXPORTABLE_CONFIG_KEYS = [
  "adsense_publisher_id",
] as const;
