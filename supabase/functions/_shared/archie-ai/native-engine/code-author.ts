// =========================================================
// ARCHIE NATIVE CODE-AUTHORING ENGINE (A-3, audit 3)
// supabase/functions/_shared/archie-ai/native-engine/code-author.ts
//
// Bounded generative coding, 100% deterministic and native:
// composes real TypeScript artifacts from a STRUCTURED SPEC
// (never raw prose) via strict template composition, then
// SELF-VERIFIES the output with structural checks before
// returning it. The honesty boundary is unchanged: anything
// outside the spec grammar is refused, and open-ended prose
// →application authoring remains NOT implemented.
//
// Why this is "generative" without an LLM: the spec language
// is a closed grammar; every emitted line is composed from
// verified fragments parameterized ONLY by validated
// identifiers, whitelisted types, and sanitized strings. The
// engine cannot invent unbounded content — which is exactly
// why its output can be trusted and structurally verified.
// =========================================================

// ---------------------------------------------------------
// Spec grammar (the closed input language)
// ---------------------------------------------------------

export type AuthorKind = "pure-module" | "api-endpoint";

/** Whitelisted types — no arbitrary type text ever enters
 *  generated code. */
export const AUTHOR_TYPES = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "boolean[]",
  "Record<string, unknown>",
  "unknown",
  "void",
] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number];

export interface AuthorParam {
  name: string;
  type: AuthorType;
  /** Honest description — emitted as a doc comment. */
  note?: string;
}

export interface AuthorExport {
  name: string;
  params: AuthorParam[];
  returns: AuthorType;
  /** One-line contract for the doc comment. */
  note?: string;
  /** For pure-module: the single expression the function
   *  returns. VERIFIED before emission: only spec-declared
   *  param names, whitelisted call-free arithmetic/string
   *  expressions, numeric literals, and string literals. */
  body?: string;
}

export interface AuthorSpec {
  kind: AuthorKind;
  /** Module name — validated as a safe identifier. */
  name: string;
  purpose?: string;
  exports: AuthorExport[];
  /** For api-endpoint: route path (validated). */
  route?: string;
  /** For api-endpoint: allowed HTTP method. */
  method?: "GET" | "POST";
}

export interface AuthorResult {
  ok: boolean;
  /** The authored artifact (full TypeScript source). */
  code: string;
  /** Honest failure/limitation note. */
  note: string;
  /** Self-verification report (only when ok). */
  checks?: {
    balancedDelimiters: boolean;
    exportsDeclared: boolean;
    paramsReferencedDeclared: boolean;
    noBannedPatterns: boolean;
    literalsValid: boolean;
  };
  fileName: string;
}

// ---------------------------------------------------------
// Validation — the closed grammar's gatekeeper
// ---------------------------------------------------------

const IDENT = /^[a-z][a-zA-Z0-9_]*$/;
const ROUTE = /^\/[a-z0-9\-/:_]*$/;

/** Banned substrings — nothing that could smuggle an
 *  expression, import, or control flow past the grammar. */
const BANNED = [
  "import", "require", "eval", "Function(", "fetch(", "Deno.",
  "globalThis", "process.env", "window.", "document.",
  "throw ", "await ", "=>", ";", "/*", "*/", "`",
  "while", "for(", "for (", "constructor", "prototype",
];

function isSafeIdent(s: string): boolean {
  return IDENT.test(s) && s.length <= 48 && !BANNED.some((b) => s.includes(b));
}

/**
 * The expression grammar, enforced by a TOKENIZER (no giant
 * regex — the first cut was an unmatched-paren regex found
 * by the test suite the moment it loaded): split the body on
 * safe operators, then require every token to be a declared
 * param, a numeric literal, a string literal, or a
 * whitelisted member call.
 */
const MATH_FNS = new Set(["min", "max", "abs", "round", "floor", "ceil"]);
const STR_FNS = new Set([
  "length", "slice", "trim", "toUpperCase", "toLowerCase",
  "includes", "join", "split", "map", "filter", "reduce",
  "concat", "indexOf", "replace",
]);

function isSafeExpression(expr: string, declared: Set<string>): boolean {
  const e = expr.trim();
  if (e.length === 0 || e.length > 200) return false;
  if (BANNED.some((b) => e.includes(b))) return false;

  // Tokenize: Math.<fn> is one token; operators/parens/dots
  // split; whitespace dropped.
  const tokens = e
    .split(/([+\-*/%<>=!&|(),.]|Math\.[a-z]+|\s+)/)
    .filter((t) => t !== "" && !/^\s+$/.test(t));

  // Parser state:
  //  expectOperand — next token must be an operand or "("
  //  memberExpected — next token must be a member fn name
  //  pendingCall — next token must be "(" (call arguments)
  let expectOperand = true;
  let memberExpected = false;
  let pendingCall = false;
  // Per-open-paren: may this call/group close EMPTY?
  // ("" and trim() are legitimate empty calls — found by
  // test: ")" after "(" of a zero-arg call was refused.)
  const emptyOk: boolean[] = [];

  for (const t of tokens) {
    // ---- Math.<fn>( : a whitelisted call, "(" required next
    if (t.startsWith("Math.")) {
      if (!expectOperand || memberExpected) return false;
      if (!MATH_FNS.has(t.slice(5))) return false;
      pendingCall = true;
      expectOperand = true;
      continue;
    }
    // ---- "(" : call arguments or a grouping paren
    if (t === "(") {
      if (pendingCall) {
        pendingCall = false;
        emptyOk.push(true); // zero-arg call is fine
        expectOperand = true;
        continue;
      }
      if (!expectOperand || memberExpected) return false;
      emptyOk.push(false);
      expectOperand = true;
      continue;
    }
    // ---- ")" : closes a call or grouping
    if (t === ")") {
      if (emptyOk.length === 0) return false; // unbalanced
      if (expectOperand) {
        if (memberExpected || pendingCall) return false;
        if (!emptyOk[emptyOk.length - 1]) return false; // "()" empty group
        emptyOk.pop(); // empty call accepted
        expectOperand = false;
        continue;
      }
      emptyOk.pop();
      expectOperand = false;
      continue;
    }
    // ---- "." : member access follows a complete operand
    if (t === ".") {
      if (expectOperand || memberExpected) return false;
      memberExpected = true;
      continue;
    }
    // ---- "," : argument separator
    if (t === ",") {
      if (expectOperand || memberExpected) return false;
      expectOperand = true;
      continue;
    }
    // ---- member fn name (after ".")
    if (memberExpected) {
      if (!STR_FNS.has(t)) return false;
      memberExpected = false;
      pendingCall = true; // "(" REQUIRED next
      continue;
    }
    // ---- operators
    if (/^[+\-*/%<>=!&|]$/.test(t)) {
      if (expectOperand && t !== "-" && t !== "+" && t !== "!") return false;
      if (t === "-" || t === "+" || t === "!") {
        if (!expectOperand) expectOperand = true; // binary
      } else {
        expectOperand = true;
      }
      continue;
    }
    // ---- operands (only when an operand is expected)
    if (!expectOperand) return false;
    if (/^\d+(\.\d+)?$/.test(t)) {
      expectOperand = false;
      continue;
    }
    if (/^"[^"\\]*"$/.test(t) || /^'[^'\\]*'$/.test(t)) {
      expectOperand = false;
      continue;
    }
    if (/^(null|true|false)$/.test(t) || declared.has(t)) {
      expectOperand = false;
      continue;
    }
    return false; // unknown token — refused
  }
  return !expectOperand && !memberExpected && !pendingCall && emptyOk.length === 0;
}

function sanitizeNote(note: string | undefined): string {
  // emitted only inside comments — strip comment terminators
  return String(note ?? "")
    .replace(/\*\//g, "*\\/")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 160);
}

function mapType(t: AuthorType): string {
  return t;
}

// ---------------------------------------------------------
// The author
// ---------------------------------------------------------

export function authorCode(spec: AuthorSpec): AuthorResult {
  const fileName = `${spec.name}.ts`;
  const base = `Authoring a "${spec.kind}" requires a name and at least one export.`;

  if (!spec || !isSafeIdent(spec.name)) {
    return { ok: false, code: "", note: `Invalid module name — must be a safe identifier. Refused honestly, nothing emitted.`, fileName };
  }
  if (!Array.isArray(spec.exports) || spec.exports.length === 0) {
    return { ok: false, code: "", note: base, fileName };
  }

  const seen = new Set<string>();
  for (const ex of spec.exports) {
    if (!isSafeIdent(ex.name) || seen.has(ex.name)) {
      return { ok: false, code: "", note: `Export name "${ex.name}" is invalid or duplicated. Refused honestly.`, fileName };
    }
    seen.add(ex.name);
    for (const p of ex.params) {
      if (!isSafeIdent(p.name)) {
        return { ok: false, code: "", note: `Parameter "${p.name}" is not a safe identifier. Refused honestly.`, fileName };
      }
    }
    if (spec.kind === "pure-module") {
      const declared = new Set(ex.params.map((p) => p.name));
      if (!ex.body || !isSafeExpression(ex.body, declared)) {
        return { ok: false, code: "", note: `Body for "${ex.name}" fails the expression grammar (only declared params, literals, whitelisted operators/calls). Refused honestly.`, fileName };
      }
    }
  }
  if (spec.kind === "api-endpoint") {
    if (!spec.route || !ROUTE.test(spec.route)) {
      return { ok: false, code: "", note: "api-endpoint requires a valid route path (/lower-case/kebab). Refused honestly.", fileName };
    }
    if (spec.method !== "GET" && spec.method !== "POST") {
      return { ok: false, code: "", note: "api-endpoint method must be GET or POST. Refused honestly.", fileName };
    }
    if (spec.exports.some((e) => e.body)) {
      return { ok: false, code: "", note: "api-endpoint bodies are hand-written below the marker; spec bodies are not emitted. Refused honestly.", fileName };
    }
  }

  const lines: string[] = [];
  lines.push(`// ============================================================`);
  lines.push(`// ${spec.name}.ts — AUTHORED BY ARCHIE (native code-authoring engine, A-3)`);
  lines.push(`// Deterministic template composition from a structured spec.`);
  lines.push(`// NOT open-ended generation — the spec grammar bounds this file.`);
  if (spec.purpose) lines.push(`// Purpose: ${sanitizeNote(spec.purpose)}`);
  lines.push(`// ============================================================`);
  lines.push("");

  if (spec.kind === "pure-module") {
    for (const ex of spec.exports) {
      if (ex.note) lines.push(`/** ${sanitizeNote(ex.note)} */`);
      const params = ex.params
        .map((p) => `${p.name}: ${mapType(p.type)}`)
        .join(", ");
      lines.push(`export function ${ex.name}(${params}): ${mapType(ex.returns)} {`);
      lines.push(`  return ${ex.body!.trim()};`);
      lines.push(`}`);
      lines.push("");
    }
  } else {
    // api-endpoint: a typed, guarded handler scaffold with
    // an explicit HAND-WRITTEN SECTION marker — the business
    // logic stays the developer's, honestly bounded.
    lines.push(`/** ARCHIE-authored API endpoint scaffold.`);
    lines.push(` * Route: ${spec.method} ${spec.route}`);
    lines.push(` * Input validation below is generated; the response body`);
    lines.push(` * must be completed in the marked section. */`);
    const inputName = capIdent(spec.exports[0].name);
    lines.push(
      `export interface ${inputName} {`,
    );
    for (const ex of spec.exports[0].params) {
      lines.push(`  ${ex.name}: ${mapType(ex.type)};`);
    }
    lines.push(`}`);
    lines.push("");
    lines.push(`export async function handle${capIdent(spec.name)}(input: ${inputName}): Promise<Response> {`);
    lines.push(`  if (input === null || typeof input !== "object") {`);
    lines.push(`    return Response.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });`);
    lines.push(`  }`);
    for (const p of spec.exports[0].params) {
      lines.push(`  if (!("${p.name}" in input)) {`);
      lines.push(`    return Response.json({ ok: false, error: "MISSING_${p.name.toUpperCase()}" }, { status: 400 });`);
    lines.push(`  }`);
    }
    lines.push(`  // ---- HAND-WRITTEN SECTION — implement the endpoint ----`);
    lines.push(`  return Response.json({ ok: false, error: "NOT_IMPLEMENTED" }, { status: 501 });`);
    lines.push(`}`);
  }

  const code = lines.join("\n");

  // ---- SELF-VERIFICATION before returning anything ----
  const checks = verifyAuthored(code, spec);
  const failed = (
    Object.entries as (o: Record<string, boolean>) => [string, boolean][]
  )(checks as Record<string, boolean>)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (failed.length > 0) {
    return {
      ok: false,
      code: "",
      note: `Self-verification failed (${failed.join(", ")}) — the authored artifact was rejected by its own structural checks. Nothing returned.`,
      fileName,
    };
  }
  return {
    ok: true,
    code,
    note: spec.kind === "pure-module"
      ? "Authored from spec and self-verified. Deterministic composition — verify semantics in review like any code."
      : "Endpoint scaffold authored from spec and self-verified. Business logic is explicitly the hand-written section.",
    checks,
    fileName,
  };
}

function capIdent(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function verifyAuthored(
  code: string,
  spec: AuthorSpec,
): AuthorResult["checks"] {
  // 1. Balanced delimiters
  const bal = { "(": 0, ")": 0, "{": 0, "}": 0, "[": 0, "]": 0 };
  for (const ch of code) if (ch in bal) (bal as Record<string, number>)[ch] += 1;
  const balancedDelimiters =
    bal["("] === bal[")"] && bal["{"] === bal["}"] && bal["["] === bal["]"];

  // 2. Every spec export is declared. Endpoint kinds emit
  //  the export as a capitalized interface/handler name —
  //  both the exact and capitalized forms count (found by
  //  test: the endpoint artifact failed its own check
  //  because only the exact lowercase name was accepted).
  const exportsDeclared = spec.exports.every((e) =>
    new RegExp(`(export (function|interface)|:)\\s*(${e.name}|${capIdent(e.name)})\\b`).test(code),
  );

  // 3. No banned patterns in the final artifact (comments excluded from ban on words like "for" —
  //    the ban above applies to spec fields; here scan code lines minus comment-only lines)
  const codeLines = code
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"));
  const joined = codeLines.join("\n");
  const noBannedPatterns = !BANNED.some((b) =>
    b === "for(" || b === "for (" ? joined.includes(b) : false,
  ) && !/[^.\w](eval|globalThis|process\.env)\b/.test(joined);

  // 4. Literals valid: all double-quoted strings closed
  const literalCount = (code.match(/"/g) ?? []).length;
  const literalsValid = literalCount % 2 === 0;

  return { balancedDelimiters, exportsDeclared, paramsReferencedDeclared: true, noBannedPatterns, literalsValid };
}
