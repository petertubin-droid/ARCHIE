// =========================================================
// ARCHIE CODING STUDIO — DETERMINISTIC PROJECT VALIDATOR
//
// Shared source of truth (Deno-compatible pure TypeScript):
// imported by the archie-studio edge function for server-side
// validation AND by the client test suite. NO duplicate logic.
//
// This is REAL QA on REAL generated code: structure, reference
// resolution, and safety patterns. It never fabricates a pass
// or a fail — every issue is computed from the file manifest.
// =========================================================

export interface StudioFile {
  path: string;
  content: string;
}

export interface StudioIssue {
  file: string;
  rule: string;
  message: string;
}

export interface StudioValidationReport {
  valid: boolean;
  issues: StudioIssue[];
  pages: string[];
  assets: string[];
}

/** Allowed file types in a studio project. */
const ALLOWED_EXTENSIONS = [
  ".html",
  ".css",
  ".js",
  ".md",
  ".json",
  ".txt",
  ".svg",
];

/** Hard-blocked patterns: generated projects are isolated from
 *  credentials, production access and tracking surfaces. */
const FORBIDDEN_PATTERNS: ReadonlyArray<{
  rx: RegExp;
  rule: string;
  message: string;
}> = [
  {
    rx: /document\.cookie/,
    rule: "no_cookie_access",
    message: "Cookie access is not allowed in studio projects.",
  },
  {
    rx: /\bfetch\s*\(\s*["'`]/,
    rule: "no_fetch_calls",
    message:
      "Direct fetch() calls are not allowed; studio projects are self-contained.",
  },
  {
    rx: /XMLHttpRequest/,
    rule: "no_xhr",
    message:
      "XMLHttpRequest is not allowed; studio projects are self-contained.",
  },
  {
    rx: /\beval\s*\(/,
    rule: "no_eval",
    message: "eval() is not allowed in studio projects.",
  },
  {
    rx: /(sk-[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9\-_.]{20,})/,
    rule: "no_embedded_credentials",
    message: "Embedded credentials/API keys are not allowed.",
  },
  {
    rx: /supabase\.co|frelux\.tools/i,
    rule: "no_production_access",
    message:
      "Studio projects must not access FRELUX or Supabase production surfaces.",
  },
  {
    rx: /<form[^>]+action\s*=\s*["']https?:/i,
    rule: "no_external_form_posts",
    message: "Forms must not post to external URLs.",
  },
  {
    rx: /localStorage\.setItem|sessionStorage\.setItem/,
    rule: "no_persistent_storage_writes",
    message: "Studio projects must not write persistent storage.",
  },
];

/** Collect local references (href/src) from an HTML document. */
function collectHtmlRefs(html: string): { ref: string; kind: string }[] {
  const refs: { ref: string; kind: string }[] = [];
  const attrRx = /(?:href|src)\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = attrRx.exec(html)) !== null) {
    refs.push({ ref: m[1], kind: m[0].startsWith("href") ? "href" : "src" });
  }
  return refs;
}

/** Validate a studio project file manifest. Deterministic. */
export function validateStudioProject(
  files: StudioFile[],
): StudioValidationReport {
  const issues: StudioIssue[] = [];
  const paths = new Set<string>();

  if (files.length === 0) {
    return {
      valid: false,
      issues: [
        { file: "-", rule: "no_files", message: "The project has no files." },
      ],
      pages: [],
      assets: [],
    };
  }

  // --- per-file checks ---
  for (const f of files) {
    const p = f.path.trim();
    if (!p || p.startsWith("/") || p.includes("..") || p.includes("\\")) {
      issues.push({
        file: p || "(empty)",
        rule: "unsafe_path",
        message:
          "Paths must be relative and cannot contain '..' or absolute paths.",
      });
      continue;
    }
    if (paths.has(p)) {
      issues.push({
        file: p,
        rule: "duplicate_path",
        message: "Duplicate file path in the manifest.",
      });
    }
    paths.add(p);
    const ext = p.slice(p.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      issues.push({
        file: p,
        rule: "unsupported_extension",
        message: `File type "${ext}" is not allowed.`,
      });
    }
    if (!f.content || f.content.trim().length === 0) {
      issues.push({
        file: p,
        rule: "empty_file",
        message: "File has no content.",
      });
    }
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.rx.test(f.content)) {
        issues.push({ file: p, rule: pat.rule, message: pat.message });
      }
    }
  }

  // --- entrypoint checks ---
  const entry = files.find((f) => f.path === "index.html");
  if (!entry) {
    issues.push({
      file: "index.html",
      rule: "missing_entrypoint",
      message: "Every project must have an index.html entrypoint.",
    });
  } else {
    const lower = entry.content.toLowerCase();
    if (!lower.includes("<html")) {
      issues.push({
        file: "index.html",
        rule: "not_html_document",
        message: "index.html must be a complete HTML document.",
      });
    }
    if (!lower.includes("</html>")) {
      issues.push({
        file: "index.html",
        rule: "truncated_html",
        message: "index.html appears truncated (no closing </html>).",
      });
    }
    if (!lower.includes("lang=")) {
      issues.push({
        file: "index.html",
        rule: "missing_lang",
        message: "index.html must declare a lang attribute.",
      });
    }
    if (!lower.includes("<title>")) {
      issues.push({
        file: "index.html",
        rule: "missing_title",
        message: "index.html must include a <title>.",
      });
    }
    if (!/name=["']viewport["']/.test(entry.content)) {
      issues.push({
        file: "index.html",
        rule: "missing_viewport",
        message: "index.html must include the responsive viewport meta tag.",
      });
    }
  }

  // --- reference resolution across ALL pages ---
  const pages = files
    .filter((f) => f.path.endsWith(".html"))
    .map((f) => f.path);
  for (const page of files.filter((f) => f.path.endsWith(".html"))) {
    const refs = collectHtmlRefs(page.content);
    for (const { ref } of refs) {
      if (/^(https?:|mailto:|tel:|data:|#)/i.test(ref)) continue;
      if (/^https?:/i.test(ref)) continue;
      const clean = ref.split("#")[0].split("?")[0];
      if (!clean) continue;
      if (!paths.has(clean)) {
        issues.push({
          file: page.path,
          rule: "broken_reference",
          message: `Referenced file "${clean}" does not exist in the project.`,
        });
      }
    }
  }

  const assets = files
    .filter((f) => !f.path.endsWith(".html"))
    .map((f) => f.path);

  return {
    valid: issues.length === 0,
    issues,
    pages,
    assets,
  };
}
