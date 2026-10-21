// =========================================================
// PROFESSIONAL TEXT HYGIENE (owner directive 2026-10-21)
//
// ARCHIE's voice must be professional, not AI-like: no em or
// en dashes, no unnecessary symbols or decorative characters.
// This is the single normalization point every outbound text
// path funnels through: engine.compose(), archie-chat's
// outbound reply gate, and any FRELUX copilot surface that
// renders ARCHIE text. Normalization is deliberately
// conservative: it never removes meaning-bearing punctuation
// (URLs, brackets, code) and never touches line structure.
//
// Globalization notes: output is locale-neutral plain text
// with straight ASCII quotes, three-dot ellipses, plain
// hyphen bullets, and no directional or zero-width Unicode.
// =========================================================

export function professionalText(input: string): string {
  if (!input) return input;
  let out = input;
  // Normalize Unicode first so lookalikes (fullwidth dashes,
  // zero-width chars) do not slip through.
  out = out.normalize("NFC");
  // Em and en dashes become clause commas (owner directive:
  // ARCHIE never uses dashes in its voice).
  out = out.replace(/\s*[—–]\s*/g, ", ");
  // Horizontal-bar variants.
  out = out.replace(/\s*―\s*/g, ", ");
  // Curly quotes to straight ASCII.
  out = out.replace(/["“”„]/g, '"').replace(/[‘’‹›]/g, "'");
  // Ellipsis character to three dots.
  out = out.replace(/…/g, "...");
  // Decorative bullet to plain hyphen bullet.
  out = out.replace(/•/g, "-");
  // Decorative arrow to the word.
  out = out.replace(/\s*→\s*/g, " to ");
  // Repeated emphasis to single.
  out = out.replace(/([!?])\1{1,}/g, "$1");
  // Tidy comma runs the dash replacement can create.
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/:\s*,/g, ":");
  out = out.replace(/\(\s*,/g, "(");
  // Zero-width and control characters that leak from
  // copy-paste sources (web snippets, documents).
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // Collapse runs of spaces/tabs (never newlines).
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

/** Number formatting for user-facing reply text: standard
 *  thousands separators, locale-neutral digits. */
export function professionalNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : String(value);
}
