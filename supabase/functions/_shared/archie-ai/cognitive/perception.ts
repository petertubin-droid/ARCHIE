// =========================================================
// ARCHIE COGNITIVE ENGINE — MULTIMODAL PERCEPTION
// supabase/functions/_shared/archie-ai/cognitive/perception.ts
//
// Normalizes every supported input modality — text, code,
// documents, structured data, websites, system info — into
// Percepts, the single input currency of the cognitive loop.
// Unsupported modalities (images, audio) are reported
// honestly and NEVER faked. Secrets are redacted on ingest.
// =========================================================

import { redactSecrets } from "./security-integrity.ts";
import { analyzeImage, type ImageAnalysis } from "./vision.ts";
import type { Percept, PerceptionModality } from "./types.ts";

let perceptCounter = 0;

function newPercept(
  modality: PerceptionModality,
  content: unknown,
  origin: string,
  metadata: Record<string, unknown>,
): Percept {
  perceptCounter += 1;
  return {
    id: `percept-${Date.now().toString(36)}-${perceptCounter}`,
    modality,
    content,
    origin,
    observedAt: new Date().toISOString(),
    metadata,
  };
}

/** Code heuristics — structural, not keyword-only. */
function looksLikeCode(text: string): { isCode: boolean; language: string } {
  const signals: Array<{ re: RegExp; lang: string }> = [
    {
      re: /\b(?:function|const|let|var|return|import|export)\b/,
      lang: "javascript",
    },
    { re: /\b(?:def|class|import)\b.*:\s*$/m, lang: "python" },
    {
      re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b\s+(?:\*|FROM|INTO|SET)/i,
      lang: "sql",
    },
    { re: /\b(?:interface|type)\s+\w+\s*[={]/, lang: "typescript" },
    { re: /<[a-z]+[^>]*>[\s\S]*<\/[a-z]+>/i, lang: "html" },
    { re: /\b(?:package|func)\s+\w+/, lang: "go" },
    { re: /\b(?:pub\s+fn|use\s+\w+::)/, lang: "rust" },
  ];
  const structural =
    (text.match(/[{};]/g)?.length ?? 0) >= 3 ||
    /^(?:[ \t]*[{}[\]();,]|#!)/m.test(text);
  for (const { re, lang } of signals) {
    if (re.test(text)) {
      return { isCode: true, language: lang };
    }
  }
  return { isCode: structural, language: structural ? "unknown-code" : "text" };
}

/** Parse structured data (JSON or CSV) honestly. */
function parseStructured(raw: string): {
  parsed: unknown;
  format: "json" | "csv" | null;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { parsed: JSON.parse(trimmed), format: "json" };
    } catch {
      return { parsed: null, format: null };
    }
  }
  if (trimmed.includes(",") && trimmed.includes("\n")) {
    const lines = trimmed.split("\n").filter((l) => l.trim());
    if (lines.length >= 2) {
      // FIX 20 (remediation batch 7, Level 4 kernel audit
      // 2026-09-13): CSV cells were split on EVERY comma — a
      // quoted cell like "Lagos, Nigeria" silently misparsed
      // into two wrong cells with no honesty note. Parsing is
      // now quote-aware (RFC-4180-lite: quoted cells may
      // contain commas/escapes). A line with UNBALANCED quotes
      // is refused honestly (format: null) instead of
      // misparsed silently.
      const splitRow = (line: string): string[] | null => {
        const cells: string[] = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"') {
              if (line[i + 1] === '"') {
                cur += '"';
                i++;
              } else {
                inQuotes = false;
              }
            } else {
              cur += ch;
            }
          } else if (ch === '"') {
            inQuotes = true;
          } else if (ch === ",") {
            cells.push(cur.trim());
            cur = "";
          } else {
            cur += ch;
          }
        }
        if (inQuotes) return null; // unbalanced quote — refuse
        cells.push(cur.trim());
        return cells;
      };
      const header = splitRow(lines[0]);
      if (header) {
        const rows: Array<Record<string, string>> = [];
        let refused = false;
        for (const line of lines.slice(1)) {
          const cells = splitRow(line);
          if (!cells) {
            refused = true;
            break;
          }
          const row: Record<string, string> = {};
          header.forEach((h, i) => {
            row[h] = cells[i] ?? "";
          });
          rows.push(row);
        }
        if (!refused) return { parsed: { header, rows }, format: "csv" };
      }
    }
  }
  return { parsed: null, format: null };
}

export class PerceptionEngine {
  private ingested = 0;
  private redactions = 0;

  /** Ingest raw input of any supported modality. Text is the
   *  general case; code, structured data and URLs are
   *  detected and normalized. Always returns at least one
   *  percept; never returns a fake percept. */
  ingest(
    input: string,
    origin = "conversation",
  ): {
    percepts: Percept[];
    secretsRedacted: number;
  } {
    const { redacted, foundCount } = redactSecrets(input);
    this.redactions += foundCount;
    const percepts: Percept[] = [];
    this.ingested += 1;

    const urls = redacted.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    const structured = parseStructured(redacted);
    const codeCheck = structured.format
      ? { isCode: false, language: "text" }
      : looksLikeCode(redacted);

    if (codeCheck.isCode) {
      percepts.push(
        newPercept("code", redacted, origin, {
          language: codeCheck.language,
          bytes: redacted.length,
        }),
      );
    } else if (structured.format) {
      percepts.push(
        newPercept("structured-data", structured.parsed, origin, {
          format: structured.format,
        }),
      );
    } else {
      percepts.push(
        newPercept("text", redacted, origin, {
          words: redacted.split(/\s+/).filter(Boolean).length,
          urls: urls.length,
        }),
      );
    }

    for (const url of urls.slice(0, 5)) {
      percepts.push(
        newPercept("website", url, origin, {
          note: "url detected — fetch happens only through the authorized web-research pipeline",
        }),
      );
    }
    return { percepts, secretsRedacted: foundCount };
  }

  /** Ingest image bytes with NATIVE vision (audit item
   *  "native eyes"). Real pixel analysis for PNG, baseline
   *  JPEG and GIF first frames; honest structure-only for
   *  everything the native decoders refuse; honest refusal
   *  for anything else.
   *  Returns a real percept only when the analysis
   *  succeeded — never a faked one. */
  async ingestImage(
    bytes: Uint8Array,
    origin = "conversation",
  ): Promise<{
    percept: Percept | null;
    note: string;
    analysis: ImageAnalysis | null;
  }> {
    const result = await analyzeImage(bytes);
    if (!result.ok) {
      return { percept: null, note: result.note, analysis: null };
    }
    this.ingested += 1;
    return {
      percept: newPercept("image", result.analysis, origin, {
        format: result.analysis.format,
        depth: result.analysis.depth,
        width: result.analysis.width,
        height: result.analysis.height,
        bounds:
          "color/brightness/composition statistics only — no object recognition",
        ...(result.analysis.depth === "structure-only"
          ? { structuralOnly: true }
          : {}),
      }),
      note:
        result.analysis.depth === "full-pixel"
          ? `image analyzed natively (${result.analysis.format.toUpperCase()} pixels)`
          : "image parsed structurally only — pixel analysis honestly unavailable",
      analysis: result.analysis,
    };
  }

  /** Honest modality report — the heart of never-faking. */
  static supportReport(): {
    supported: PerceptionModality[];
    unsupported: Array<{ modality: string; note: string }>;
  } {
    return {
      supported: [
        "text",
        "code",
        "document",
        "structured-data",
        "website",
        "system-info",
        "image",
      ],
      unsupported: [
        {
          modality: "audio",
          note: "auditory perception is not implemented yet — reported honestly, never faked",
        },
      ],
    };
  }

  stats(): { ingested: number; secretsRedacted: number } {
    return { ingested: this.ingested, secretsRedacted: this.redactions };
  }
}
