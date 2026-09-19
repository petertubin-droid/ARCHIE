// =========================================================
// SANDBOXED JAVASCRIPT INTERPRETER (owner upgrade 2026-09-16,
// gap 2 — no code-execution sandbox).
//
// A REAL, deterministic, in-engine code-execution sandbox:
// ARCHIE can run owner-supplied JavaScript and report the
// computed output — no external runtime, no external AI,
// nothing leaves the sandbox.
//
// HONEST SAFETY MODEL — this is a WHITELIST interpreter, not
// a process jail:
//   - NO I/O of any kind: no network, no filesystem, no
//     timers, no eval, no import. There is simply no
//     instruction that reaches outside.
//   - NO non-determinism: Date, Math.random, globalThis are
//     excluded — every run of the same program returns the
//     same output (the engine never hides a clock behind a
//     computation).
//   - Bounded: hard caps on steps (200k), output lines,
//     string size, array size and call depth. Overrun is an
//     honest error naming the cap, never a hang.
//   - Whitelisted surface: var/let/const, if/else, while,
//     for, function declarations, return/break/continue,
//     arrays, object literals, string/array/Math/JSON
//     subsets and print(). Anything outside the whitelist
//     is an error with the source position.
//
// Tree-walking with an explicit step counter — every
// statement and loop iteration is counted, so resource use
// is provably finite. Deterministic throughout.
// =========================================================

/** Sandboxed execution result. */
export interface SandboxResult {
  ok: boolean;
  /** Captured print() lines. */
  output: string[];
  /** Value of the final expression statement (REPL-style). */
  value: string | null;
  /** Honest error, with source position when available. */
  error: string | null;
  steps: number;
}

// ---------------------------------------------------------
// Caps — the sandbox is bounded, and says so.
// ---------------------------------------------------------
export const MAX_STEPS = 200_000;
export const MAX_OUTPUT_LINES = 500;
export const MAX_STRING_CHARS = 1_000_000;
export const MAX_ARRAY_ITEMS = 100_000;
export const MAX_CALL_DEPTH = 64;

// ---------------------------------------------------------
// Lexer
// ---------------------------------------------------------
type TokKind = "num" | "str" | "id" | "kw" | "punc" | "eof";

interface Tok {
  kind: TokKind;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS = new Set([
  "var", "let", "const", "if", "else", "while", "for",
  "function", "return", "break", "continue", "true", "false", "null",
]);

const TWO_CHAR = ["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/="];

function err(line: number, col: number, msg: string): Error {
  return new Error(`line ${line}, col ${col}: ${msg}`);
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1, col = 1;
  const push = (kind: TokKind, value: string) =>
    toks.push({ kind, value, line, col });
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line += 1; col = 1; i += 1; continue; }
    if (/\s/.test(c)) { i += 1; col += 1; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j += 1;
      if (src[j] === "e" || src[j] === "E") {
        j += 1;
        if (src[j] === "+" || src[j] === "-") j += 1;
        while (j < src.length && /[0-9]/.test(src[j])) j += 1;
      }
      push("num", src.slice(i, j));
      col += j - i;
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\") {
          const e = src[j + 1];
          s += e === "n" ? "\n" : e === "t" ? "\t" : e === "0" ? "\0" : e;
          j += 2;
        } else {
          s += src[j];
          j += 1;
        }
      }
      if (j >= src.length) throw err(line, col, "unterminated string");
      push("str", s);
      col += j - i;
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      push(KEYWORDS.has(word) ? "kw" : "id", word);
      col += j - i;
      i = j;
      continue;
    }
    // JS strict equality — normalized onto the whitelisted
    // == / != tokens (the sandbox has one honest equality).
    const three = src.slice(i, i + 3);
    if (three === "===" || three === "!==") {
      push("punc", three === "===" ? "==" : "!=");
      i += 3; col += 3;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR.includes(two)) { push("punc", two); i += 2; col += 2; continue; }
    if ("+-*/%<>=!?:;,.()[]{}&|".includes(c)) { push("punc", c); i += 1; col += 1; continue; }
    throw err(line, col, `unsupported character "${c}" — the sandbox whitelist has no instruction for it`);
  }
  toks.push({ kind: "eof", value: "", line, col });
  return toks;
}

// ---------------------------------------------------------
// AST
// ---------------------------------------------------------
type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" }
  | { t: "id"; name: string; line: number; col: number }
  | { t: "arr"; items: Node[] }
  | { t: "obj"; props: Array<{ key: string; value: Node }> }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "un"; op: string; e: Node }
  | { t: "logic"; op: string; l: Node; r: Node }
  | { t: "ternary"; c: Node; a: Node; b: Node }
  | { t: "assign"; op: string; target: Node; value: Node }
  | { t: "upd"; op: string; target: Node; prefix: boolean }
  | { t: "call"; callee: Node; args: Node[] }
  | { t: "member"; obj: Node; prop: string; computed: boolean; propNode?: Node }
  | { t: "func"; name: string | null; params: string[]; body: Stmt[] };

type Stmt =
  | { t: "expr"; e: Node }
  | { t: "funcdecl"; name: string; fn: Node }
  | { t: "decl"; kind: string; decls: Array<{ name: string; init: Node | null }> }
  | { t: "if"; c: Node; then: Stmt[]; else: Stmt[] | null }
  | { t: "while"; c: Node; body: Stmt[] }
  | { t: "for"; init: Stmt | null; c: Node; upd: Node[]; body: Stmt[] }
  | { t: "return"; e: Node | null }
  | { t: "break" }
  | { t: "continue" };

// ---------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------
class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok { return this.toks[this.i]; }
  private next(): Tok { return this.toks[this.i++]; }
  private is(kind: TokKind, value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }
  private eat(kind: TokKind, value?: string): Tok {
    if (!this.is(kind, value)) {
      const t = this.peek();
      throw err(t.line, t.col, `expected ${value ?? kind}, found "${t.value || "end of input"}"`);
    }
    return this.next();
  }

  parseProgram(): Stmt[] {
    const stmts: Stmt[] = [];
    while (!this.is("eof")) stmts.push(this.statement());
    return stmts;
  }

  /** A braced block of statements. */
  private block(): Stmt[] {
    this.eat("punc", "{");
    const body: Stmt[] = [];
    while (!this.is("punc", "}") && !this.is("eof")) body.push(this.statement());
    this.eat("punc", "}");
    return body;
  }

  /** if/while/for bodies may be braced OR a single statement
   *  (JS braceless form) — function bodies keep requiring
   *  braces, like real JavaScript. */
  private bodyOrSingle(): Stmt[] {
    return this.is("punc", "{") ? this.block() : [this.statement()];
  }

  private statement(): Stmt {
    const t = this.peek();
    if (t.kind === "kw") {
      switch (t.value) {
        case "var": case "let": case "const": {
          const kind = this.next().value;
          const decls: Array<{ name: string; init: Node | null }> = [];
          do {
            const name = this.eat("id").value;
            let init: Node | null = null;
            if (this.is("punc", "=")) { this.next(); init = this.expression(); }
            decls.push({ name, init });
          } while (this.is("punc", ",") && (this.next(), true));
          this.end();
          return { t: "decl", kind, decls };
        }
        case "if": {
          this.next();
          this.eat("punc", "(");
          const c = this.expression();
          this.eat("punc", ")");
          const then = this.bodyOrSingle();
          let els: Stmt[] | null = null;
          if (this.is("kw", "else")) {
            this.next();
            els = this.is("kw", "if")
              ? [this.statement()]
              : this.bodyOrSingle();
          }
          return { t: "if", c, then, else: els };
        }
        case "while": {
          this.next();
          this.eat("punc", "(");
          const c = this.expression();
          this.eat("punc", ")");
          return { t: "while", c, body: this.bodyOrSingle() };
        }
        case "for": {
          this.next();
          this.eat("punc", "(");
          let init: Stmt | null = null;
          if (this.is("kw", "var") || this.is("kw", "let") || this.is("kw", "const")) {
            const kind = this.next().value;
            const name = this.eat("id").value;
            let iv: Node | null = null;
            if (this.is("punc", "=")) { this.next(); iv = this.expression(); }
            init = { t: "decl", kind, decls: [{ name, init: iv }] };
          } else if (!this.is("punc", ";")) {
            init = { t: "expr", e: this.expression() };
          }
          this.eat("punc", ";");
          const c: Node = this.is("punc", ";")
            ? { t: "bool", v: true }
            : this.expression();
          this.eat("punc", ";");
          const upd: Node[] = [];
          if (!this.is("punc", ")")) {
            upd.push(this.expression());
            while (this.is("punc", ",")) { this.next(); upd.push(this.expression()); }
          }
          this.eat("punc", ")");
          return { t: "for", init, c, upd, body: this.bodyOrSingle() };
        }
        case "return": {
          this.next();
          const e = this.is("punc", ";") ? null : this.expression();
          this.end();
          return { t: "return", e };
        }
        case "break": this.next(); this.end(); return { t: "break" };
        case "continue": this.next(); this.end(); return { t: "continue" };
        case "function": {
          this.next();
          const name = this.eat("id").value;
          return { t: "funcdecl", name, fn: this.funcRest(name) };
        }
      }
    }
    const e = this.expression();
    this.end();
    return { t: "expr", e };
  }

  private end(): void {
    if (this.is("punc", ";")) this.next();
  }

  private funcRest(name: string | null): Node {
    this.eat("punc", "(");
    const params: string[] = [];
    if (!this.is("punc", ")")) {
      params.push(this.eat("id").value);
      while (this.is("punc", ",")) { this.next(); params.push(this.eat("id").value); }
    }
    this.eat("punc", ")");
    return { t: "func", name, params, body: this.block() };
  }

  // ----- expressions (precedence climbing) -----
  private expression(): Node { return this.ternary(); }

  private ternary(): Node {
    const c = this.binary(0);
    if (this.is("punc", "?")) {
      this.next();
      const a = this.ternary();
      this.eat("punc", ":");
      const b = this.ternary();
      return { t: "ternary", c, a, b };
    }
    return c;
  }

  private static readonly LEVELS = [
    ["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"],
  ];

  private binary(level: number): Node {
    if (level >= Parser.LEVELS.length) return this.unary();
    let l = this.binary(level + 1);
    for (;;) {
      const op = Parser.LEVELS[level].find((o) => this.is("punc", o));
      if (op === undefined) return l;
      this.next();
      const r = this.binary(level + 1);
      l = op === "||" || op === "&&"
        ? { t: "logic", op, l, r }
        : { t: "bin", op, l, r };
    }
  }

  private unary(): Node {
    if (this.is("punc", "!")) { this.next(); return { t: "un", op: "!", e: this.unary() }; }
    if (this.is("punc", "-")) { this.next(); return { t: "un", op: "-", e: this.unary() }; }
    if (this.is("punc", "+")) { this.next(); return this.unary(); }
    if (this.is("punc", "++") || this.is("punc", "--")) {
      const op = this.next().value;
      return { t: "upd", op, target: this.unary(), prefix: true };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let e = this.primary();
    for (;;) {
      if (this.is("punc", ".")) {
        this.next();
        const prop = this.eat("id").value;
        e = { t: "member", obj: e, prop, computed: false };
      } else if (this.is("punc", "[")) {
        this.next();
        const idx = this.expression();
        this.eat("punc", "]");
        e = { t: "member", obj: e, prop: "", computed: true, propNode: idx };
      } else if (this.is("punc", "(")) {
        this.next();
        const args: Node[] = [];
        if (!this.is("punc", ")")) {
          args.push(this.expression());
          while (this.is("punc", ",")) { this.next(); args.push(this.expression()); }
        }
        this.eat("punc", ")");
        e = { t: "call", callee: e, args };
      } else if (this.is("punc", "++") || this.is("punc", "--")) {
        const op = this.next().value;
        e = { t: "upd", op, target: e, prefix: false };
      } else if (
        this.is("punc", "=") || this.is("punc", "+=") || this.is("punc", "-=") ||
        this.is("punc", "*=") || this.is("punc", "/=")
      ) {
        const op = this.next().value;
        const value = this.ternary();
        e = { t: "assign", op, target: e, value };
      } else return e;
    }
  }

  private primary(): Node {
    const t = this.peek();
    if (t.kind === "num") { this.next(); return { t: "num", v: Number(t.value.replace(/_/g, "")) }; }
    if (t.kind === "str") { this.next(); return { t: "str", v: t.value }; }
    if (t.kind === "kw") {
      if (t.value === "true") { this.next(); return { t: "bool", v: true }; }
      if (t.value === "false") { this.next(); return { t: "bool", v: false }; }
      if (t.value === "null") { this.next(); return { t: "null" }; }
      if (t.value === "function") { this.next(); return this.funcRest(null); }
    }
    if (t.kind === "id") {
      this.next();
      return { t: "id", name: t.value, line: t.line, col: t.col };
    }
    if (this.is("punc", "(")) {
      this.next();
      const e = this.expression();
      this.eat("punc", ")");
      return e;
    }
    if (this.is("punc", "[")) {
      this.next();
      const items: Node[] = [];
      if (!this.is("punc", "]")) {
        items.push(this.expression());
        while (this.is("punc", ",")) { this.next(); items.push(this.expression()); }
      }
      this.eat("punc", "]");
      return { t: "arr", items };
    }
    if (this.is("punc", "{")) {
      this.next();
      const props: Array<{ key: string; value: Node }> = [];
      if (!this.is("punc", "}")) {
        do {
          const key = this.eat("id").value;
          this.eat("punc", ":");
          props.push({ key, value: this.ternary() });
        } while (this.is("punc", ",") && (this.next(), true));
      }
      this.eat("punc", "}");
      return { t: "obj", props };
    }
    throw err(t.line, t.col, `unexpected "${t.value || "end of input"}"`);
  }
}

// ---------------------------------------------------------
// Runtime
// ---------------------------------------------------------
interface FuncVal {
  sandboxFunc: true;
  /** User function: params/body/closure. */
  params?: string[];
  body?: Stmt[];
  closure?: Scope;
  /** Builtin: native implementation. */
  native?: (args: Val[]) => Val;
}

type Val =
  | number | string | boolean | null | undefined
  | Val[]
  | FuncVal
  | { [k: string]: Val };

class Scope {
  private readonly vars = new Map<string, Val>();
  constructor(private readonly parent: Scope | null) {}
  get(name: string, line: number, col: number): Val {
    let s: Scope | null = this;
    while (s) {
      const v = s.vars.get(name);
      if (v !== undefined || s.vars.has(name)) return v;
      s = s.parent;
    }
    throw err(line, col, `"${name}" is not defined`);
  }
  has(name: string): boolean {
    let s: Scope | null = this;
    while (s) {
      if (s.vars.has(name)) return true;
      s = s.parent;
    }
    return false;
  }
  set(name: string, v: Val): void { this.vars.set(name, v); }
  /** JS assignment semantics: write the scope where the name
   *  is DEFINED (walk outward), never a shadowing copy — a
   *  loop body scope must not silently fork the variable. */
  assign(name: string, v: Val): void {
    let s: Scope | null = this;
    while (s) {
      if (s.vars.has(name)) { s.vars.set(name, v); return; }
      s = s.parent;
    }
    this.vars.set(name, v); // implicit declaration (sloppy-JS style, bounded)
  }
}

const BREAK = { signal: "break" } as const;
const CONTINUE = { signal: "continue" } as const;
class ReturnSignal { constructor(public readonly value: Val) {} }
type Flow = ReturnSignal | typeof BREAK | typeof CONTINUE | null;

/** Match a conversational code-execution request ("run this
 *  javascript: …") and return the program text, or null.
 *  Shared by the engine's tool path AND the reasoning-loop
 *  controller — the loop must NEVER clause-split a program
 *  on its semicolons. */
export function matchCodeRequest(input: string): string | null {
  const m = input.match(
    /(?:run|execute|eval(?:uate)?)\s+(?:this\s+)?(?:javascript|js|code|program|script)\s*:?\s*([\s\S]+)/i,
  );
  const code = m?.[1]?.trim();
  return code && code.length > 0 ? code : null;
}

export function runJavaScript(src: string): SandboxResult {
  const output: string[] = [];
  let steps = 0;
  let depth = 0;
  const step = (): void => {
    steps += 1;
    if (steps > MAX_STEPS) {
      throw new Error(
        `sandbox step cap reached (${MAX_STEPS} steps) — the program was stopped honestly, not truncated silently`,
      );
    }
  };
  const capString = (s: string): string => {
    if (s.length > MAX_STRING_CHARS) {
      throw new Error(`string exceeds the sandbox cap (${MAX_STRING_CHARS} chars)`);
    }
    return s;
  };
  const capArray = (a: Val[]): Val[] => {
    if (a.length > MAX_ARRAY_ITEMS) {
      throw new Error(`array exceeds the sandbox cap (${MAX_ARRAY_ITEMS} items)`);
    }
    return a;
  };

  function serialize(v: Val): string {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "number") {
      return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
    }
    if (typeof v === "boolean") return String(v);
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return "[" + v.map(serialize).join(", ") + "]";
    if (typeof v === "object" && "sandboxFunc" in v) return "[function]";
    return "{ " + Object.entries(v).map(([k, x]) => `${k}: ${serialize(x)}`).join(", ") + " }";
  }

  function truthy(v: Val): boolean {
    if (v === undefined || v === null || v === false) return false;
    if (v === true) return true;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object" && "sandboxFunc" in v) return true;
    return Object.keys(v).length > 0;
  }

  const eq = (a: Val, b: Val): boolean => {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (typeof a === "number" && typeof b === "number") return a === b;
    if (typeof a === "string" && typeof b === "string") return a === b;
    if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
    if (typeof a === "string" || typeof b === "string") return serialize(a) === serialize(b);
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((x, i) => eq(x, b[i]));
    }
    return a === b;
  };

  const cmp = (a: Val, b: Val): number => {
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === "number" && typeof b === "number") return a - b;
    throw new Error(
      `comparison needs two numbers or two strings — got ${typeof a} and ${typeof b} (honesty over JS quirks)`,
    );
  };

  const numOp = (a: Val, b: Val, op: (x: number, y: number) => number): number => {
    if (typeof a !== "number" || typeof b !== "number") {
      throw new Error("arithmetic needs numbers — the sandbox does not coerce strings in arithmetic (honesty over JS quirks)");
    }
    return op(a, b);
  };

  // ---- whitelisted globals ----
  const globals = new Scope(null);
  const native = (fn: (args: Val[]) => Val): FuncVal => ({ sandboxFunc: true, native: fn });

  globals.set("print", native((args) => {
    if (output.length >= MAX_OUTPUT_LINES) {
      throw new Error(`output cap reached (${MAX_OUTPUT_LINES} print lines)`);
    }
    output.push(serialize(args[0]));
    return undefined;
  }));

  const mathObj: { [k: string]: Val } = { PI: Math.PI, E: Math.E };
  const unaryMath = ["floor", "ceil", "round", "abs", "sqrt", "sign", "trunc", "log2", "log10", "cbrt"] as const;
  for (const name of unaryMath) {
    mathObj[name] = native((args) => (Math as unknown as Record<string, (x: number) => number>)[name](Number(args[0])));
  }
  mathObj.pow = native((args) => Math.pow(Number(args[0]), Number(args[1])));
  mathObj.min = native((args) => Math.min(...args.map(Number)));
  mathObj.max = native((args) => Math.max(...args.map(Number)));
  mathObj.hypot = native((args) => Math.hypot(...args.map(Number)));
  globals.set("Math", mathObj);

  globals.set("JSON", {
    stringify: native((args) => {
      const raw = JSON.stringify(toPlain(args[0]));
      return typeof raw === "string" ? capString(raw) : "undefined";
    }),
    parse: native((args) => fromPlain(JSON.parse(String(args[0])))),
  } as { [k: string]: Val });

  globals.set("Number", native((args) => (args.length === 0 ? 0 : Number(args[0]) || 0)));
  globals.set("String", native((args) => (args.length === 0 ? "" : serialize(args[0]))));
  globals.set("Boolean", native((args) => truthy(args[0])));
  globals.set("Array", { isArray: native((args) => Array.isArray(args[0])) } as { [k: string]: Val });
  globals.set("parseInt", native((args) => Number.parseInt(String(args[0] ?? ""))));
  globals.set("parseFloat", native((args) => Number.parseFloat(String(args[0] ?? ""))));
  globals.set("isNaN", native((args) => Number.isNaN(Number(args[0]))));
  globals.set("Object", {
    keys: native((args) => capArray(Object.keys(args[0] as { [k: string]: Val }).map((k) => k))),
    values: native((args) => capArray(Object.values(args[0] as { [k: string]: Val }))),
  } as { [k: string]: Val });

  /** Sandbox values → plain JSON values. */
  function toPlain(v: Val): unknown {
    if (v === null || v === undefined) return null;
    if (typeof v === "object") {
      if ("sandboxFunc" in v) return undefined;
      if (Array.isArray(v)) return v.map(toPlain);
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = toPlain(x);
      return o;
    }
    return v;
  }
  /** Plain JSON values → sandbox values. */
  function fromPlain(v: unknown): Val {
    if (v === null || typeof v !== "object") return v as Val;
    if (Array.isArray(v)) return capArray(v.map(fromPlain));
    const o: { [k: string]: Val } = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = fromPlain(x);
    return o;
  }

  function member(obj: Val, prop: string): Val {
    if (obj === null || obj === undefined) {
      throw new Error(`cannot read "${prop}" of ${obj === null ? "null" : "undefined"}`);
    }
    if (Array.isArray(obj)) {
      if (prop === "length") return obj.length;
      if (prop === "push") return native((args) => { obj.push(...args); capArray(obj); return obj.length; });
      if (prop === "pop") return native(() => obj.pop());
      if (prop === "shift") return native(() => obj.shift());
      if (prop === "unshift") return native((args) => { obj.unshift(...args); capArray(obj); return obj.length; });
      if (prop === "indexOf") return native((args) => obj.findIndex((x) => eq(x, args[0])));
      if (prop === "includes") return native((args) => obj.some((x) => eq(x, args[0])));
      if (prop === "join") return native((args) => capString(obj.map(serialize).join(args[0] === undefined ? "," : serialize(args[0]))));
      if (prop === "slice") return native((args) => obj.slice(Number(args[0] ?? 0), args[1] === undefined ? undefined : Number(args[1])));
      if (prop === "reverse") return native(() => { obj.reverse(); return obj; });
      if (prop === "sort") return native(() => {
        obj.sort((x, y) => (typeof x === "number" && typeof y === "number" ? x - y : serialize(x) < serialize(y) ? -1 : 1));
        return obj;
      });
      if (prop === "map") return native((args) => capArray(obj.map((x, i) => callFunction("map callback", args[0], [x, i]))));
      if (prop === "filter") return native((args) => capArray(obj.filter((x, i) => truthy(callFunction("filter callback", args[0], [x, i])))));
      if (prop === "reduce") return native((args) => {
        const acc = args[1] === undefined ? obj.shift() : args[1];
        return obj.reduce((a: Val, x: Val) => callFunction("reduce callback", args[0], [a, x]), acc);
      });
      if (prop === "forEach") return native((args) => { obj.forEach((x, i) => callFunction("forEach callback", args[0], [x, i])); return undefined; });
      const idx = Number(prop);
      if (Number.isInteger(idx) && idx >= 0) return obj[idx];
      throw new Error(`array property "${prop}" is not in the sandbox whitelist`);
    }
    if (typeof obj === "string") {
      if (prop === "length") return obj.length;
      if (prop === "toUpperCase") return native(() => capString(obj.toUpperCase()));
      if (prop === "toLowerCase") return native(() => capString(obj.toLowerCase()));
      if (prop === "trim") return native(() => capString(obj.trim()));
      if (prop === "indexOf") return native((args) => obj.indexOf(serialize(args[0])));
      if (prop === "includes") return native((args) => obj.includes(serialize(args[0])));
      if (prop === "slice") return native((args) => capString(obj.slice(Number(args[0] ?? 0), args[1] === undefined ? undefined : Number(args[1]))));
      if (prop === "substring") return native((args) => capString(obj.substring(Number(args[0] ?? 0), args[1] === undefined ? undefined : Number(args[1]))));
      if (prop === "split") return native((args) => capArray(serialize(args[0]) === "" ? Array.from(obj) : obj.split(serialize(args[0]))));
      if (prop === "repeat") return native((args) => capString(obj.repeat(Math.max(0, Math.floor(Number(args[0] ?? 0))))));
      if (prop === "replace") return native((args) => capString(obj.split(serialize(args[0])).join(serialize(args[1]))));
      if (prop === "charAt") return native((args) => obj.charAt(Number(args[0] ?? 0)));
      const idx = Number(prop);
      if (Number.isInteger(idx) && idx >= 0 && idx < obj.length) return obj[idx];
      throw new Error(`string property "${prop}" is not in the sandbox whitelist`);
    }
    if (typeof obj === "number") {
      if (prop === "toFixed") return native((args) => obj.toFixed(Number(args[0] ?? 0)));
      if (prop === "toString") return native(() => serialize(obj));
      throw new Error(`number property "${prop}" is not in the sandbox whitelist`);
    }
    if (typeof obj === "object" && "sandboxFunc" in obj) {
      throw new Error(`function property "${prop}" is not in the sandbox whitelist`);
    }
    const o = obj as { [k: string]: Val };
    if (prop in o) return o[prop];
    throw new Error(`property "${prop}" is not defined`);
  }

  function callFunction(name: string, fnv: Val, args: Val[]): Val {
    step();
    depth += 1;
    if (depth > MAX_CALL_DEPTH) {
      depth -= 1;
      throw new Error(`call depth cap reached (${MAX_CALL_DEPTH}) — deep recursion stopped honestly`);
    }
    try {
      if (typeof fnv === "object" && fnv !== null && "sandboxFunc" in fnv) {
        const f = fnv as FuncVal;
        if (f.native) return f.native(args);
        if (f.params && f.body) {
          const local = new Scope(f.closure ?? globals);
          f.params.forEach((p, i) => local.set(p, args[i]));
          const r = execBlock(f.body, local);
          return r instanceof ReturnSignal ? r.value : undefined;
        }
      }
      throw new Error(`"${name}" is not a function — called honestly, refused honestly`);
    } finally {
      depth -= 1;
    }
  }

  function assignTo(target: Node, v: Val, scope: Scope): void {
    step();
    if (target.t === "id") { scope.assign(target.name, v); return; }
    if (target.t === "member") {
      const obj = evalNode(target.obj, scope);
      const prop = target.computed
        ? serialize(evalNode(target.propNode as Node, scope))
        : target.prop;
      if (Array.isArray(obj)) {
        const idx = Number(prop);
        if (Number.isInteger(idx) && idx >= 0) { obj[idx] = v; capArray(obj); return; }
        throw new Error(`cannot assign array property "${prop}"`);
      }
      if (typeof obj === "string") {
        throw new Error("strings are immutable in the sandbox (honest refusal)");
      }
      if (obj !== null && typeof obj === "object" && !("sandboxFunc" in obj)) {
        (obj as { [k: string]: Val })[prop] = v;
        return;
      }
      throw new Error(`cannot assign property "${prop}" of ${serialize(obj)}`);
    }
    throw new Error("unsupported assignment target");
  }

  function evalNode(n: Node, scope: Scope): Val {
    step();
    switch (n.t) {
      case "num": return n.v;
      case "str": return capString(n.v);
      case "bool": return n.v;
      case "null": return null;
      case "id": return scope.get(n.name, n.line, n.col);
      case "arr": return capArray(n.items.map((x) => evalNode(x, scope)));
      case "obj": {
        const o: { [k: string]: Val } = {};
        for (const p of n.props) o[p.key] = evalNode(p.value, scope);
        return o;
      }
      case "logic": {
        const lv = evalNode(n.l, scope);
        if (n.op === "||") return truthy(lv) ? lv : evalNode(n.r, scope);
        return truthy(lv) ? evalNode(n.r, scope) : lv;
      }
      case "bin": {
        const a = evalNode(n.l, scope), b = evalNode(n.r, scope);
        switch (n.op) {
          case "+":
            if (typeof a === "string" || typeof b === "string") {
              return capString(serialize(a) + serialize(b));
            }
            return numOp(a, b, (x, y) => x + y);
          case "-": return numOp(a, b, (x, y) => x - y);
          case "*": return numOp(a, b, (x, y) => x * y);
          case "/": return numOp(a, b, (x, y) => x / y);
          case "%": return numOp(a, b, (x, y) => x % y);
          case "==": return eq(a, b);
          case "!=": return !eq(a, b);
          case "<": return cmp(a, b) < 0;
          case ">": return cmp(a, b) > 0;
          case "<=": return cmp(a, b) <= 0;
          case ">=": return cmp(a, b) >= 0;
        }
        throw new Error(`unsupported operator "${n.op}"`);
      }
      case "un": {
        const v = evalNode(n.e, scope);
        return n.op === "!" ? !truthy(v) : -Number(v);
      }
      case "ternary":
        return truthy(evalNode(n.c, scope)) ? evalNode(n.a, scope) : evalNode(n.b, scope);
      case "upd": {
        const before = Number(evalNode(n.target, scope));
        const after = n.op === "++" ? before + 1 : before - 1;
        assignTo(n.target, after, scope);
        return n.prefix ? after : before;
      }
      case "assign": {
        let v: Val;
        if (n.op === "=") {
          v = evalNode(n.value, scope);
        } else {
          const cur = evalNode(n.target, scope);
          const rhs = evalNode(n.value, scope);
          const op = n.op[0];
          v = op === "+"
            ? (typeof cur === "string" || typeof rhs === "string"
                ? capString(serialize(cur) + serialize(rhs))
                : numOp(cur, rhs, (x, y) => x + y))
            : numOp(cur, rhs,
                op === "-" ? (x, y) => x - y
                : op === "*" ? (x, y) => x * y
                : (x, y) => x / y);
        }
        assignTo(n.target, v, scope);
        return v;
      }
      case "member": {
        const obj = evalNode(n.obj, scope);
        const prop = n.computed ? serialize(evalNode(n.propNode as Node, scope)) : n.prop;
        return member(obj, prop);
      }
      case "call": {
        const callee = n.callee;
        if (callee.t === "id" && !scope.has(callee.name)) {
          throw err(callee.line, callee.col, `"${callee.name}" is not defined`);
        }
        const fnv = evalNode(callee, scope);
        const args = n.args.map((a) => evalNode(a, scope));
        const name = callee.t === "id" ? callee.name : callee.t === "member" ? callee.prop : "<anonymous>";
        return callFunction(name, fnv, args);
      }
      case "func": {
        return { sandboxFunc: true, params: n.params, body: n.body, closure: scope };
      }
    }
  }

  function execBlock(body: Stmt[], scope: Scope): Flow {
    for (const s of body) {
      step();
      const r = execStmt(s, scope);
      if (r !== null) return r;
    }
    return null;
  }

  /** Value of the last evaluated expression statement (REPL-style). */
  let lastValue: Val = undefined;

  function execStmt(s: Stmt, scope: Scope): Flow {
    switch (s.t) {
      case "expr": {
        lastValue = evalNode(s.e, scope);
        return null;
      }
      case "funcdecl": {
        scope.set(s.name, evalNode(s.fn, scope));
        return null;
      }
      case "decl": {
        for (const d of s.decls) {
          if (s.kind === "const" && d.init === null) {
            throw new Error("const declaration needs an initializer");
          }
          scope.set(d.name, d.init ? evalNode(d.init, scope) : undefined);
        }
        return null;
      }
      case "if": {
        if (truthy(evalNode(s.c, scope))) return execBlock(s.then, new Scope(scope));
        if (s.else !== null) return execBlock(s.else, new Scope(scope));
        return null;
      }
      case "while": {
        while (truthy(evalNode(s.c, scope))) {
          step();
          const r = execBlock(s.body, new Scope(scope));
          if (r === BREAK) break;
          if (r instanceof ReturnSignal) return r;
        }
        return null;
      }
      case "for": {
        const loop = new Scope(scope);
        if (s.init !== null) execStmt(s.init, loop);
        while (truthy(evalNode(s.c, loop))) {
          step();
          const r = execBlock(s.body, new Scope(loop));
          if (r === BREAK) break;
          if (r instanceof ReturnSignal) return r;
          for (const u of s.upd) evalNode(u, loop);
        }
        return null;
      }
      case "return": return new ReturnSignal(s.e ? evalNode(s.e, scope) : undefined);
      case "break": return BREAK;
      case "continue": return CONTINUE;
    }
    return null;
  }

  try {
    const stmts = new Parser(lex(src)).parseProgram();
    for (const s of stmts) {
      const r = execStmt(s, globals);
      if (r instanceof ReturnSignal) {
        lastValue = r.value;
        break;
      }
    }
    return {
      ok: true,
      output,
      value: lastValue === undefined ? null : serialize(lastValue),
      error: null,
      steps,
    };
  } catch (e) {
    return {
      ok: false,
      output,
      value: null,
      error: e instanceof Error ? e.message : String(e),
      steps,
    };
  }
}
