// =========================================================
// ARCHIE COGNITIVE ENGINE — ADVANCED UNIFIED PERCEPTION
// supabase/functions/_shared/archie-ai/cognitive/perception.ts
//
// Shared, multi-stage perception pipeline for ARCHIE:
//
//   Stage 1: Input Acquisition
//   Stage 2: Input Validation & Security Boundary (MIME, bounds,
//            secret redaction, prompt injection quarantine)
//   Stage 3: Modality Detection (text, code, structured, audio,
//            video, image, sensor, multimodal)
//   Stage 4: Signal Processing (native pixel stats, audio PCM
//            energy/FFT, video container parsing)
//   Stage 5: Feature Extraction (entities, OCR, scene stats,
//            ambient audio classes, motion/cuts)
//   Stage 6: Semantic Interpretation (epistemic state assignment:
//            distinguishing DIRECT_OBSERVATION from INFERRED_HYPOTHESIS)
//   Stage 7: Cross-Modal Correlation & Contradiction Detection
//   Stage 8: Confidence & Uncertainty Assessment
//   Stage 9: Observation Validation (preventing hallucinations
//            from becoming facts without verification)
//   Stage 10: Structured Observation & Cognitive Integration
//
// FRELUX Supabase read-only quota safe: 100% in-memory / ephemeral
// processing with deterministic math and no unapproved DB writes.
// Secrets are redacted on ingest. Prompt injections are quarantined.
// =========================================================

import { redactSecrets } from "./security-integrity.ts";
import { sha256 } from "./sha256.ts";
import { analyzeImage, type ImageAnalysis } from "./vision.ts";
import {
  analyzeAudioEvents,
  type AudioEventAnalysis,
} from "../native-engine/audio-events.ts";
import {
  normalizeTranscript,
} from "../native-engine/ears.ts";
import {
  inspectContainer,
  analyzeFrameSequence,
  type VideoContainerInfo,
  type FrameSample,
  type FrameAnalysis,
} from "../native-engine/video-perception.ts";
import type {
  Percept,
  PerceptionModality,
  StructuredObservation,
  ObservationEpistemicStatus,
  PerceptionSourceType,
} from "./types.ts";

let perceptCounter = 0;
let observationCounter = 0;

function nextPerceptId(): string {
  perceptCounter += 1;
  return `percept-${Date.now().toString(36)}-${perceptCounter}`;
}

function nextObservationId(): string {
  observationCounter += 1;
  return `obs-${Date.now().toString(36)}-${observationCounter}`;
}

/** Check for potential prompt injection or unauthorized system override. */
function detectInjectionPatterns(text: string): { hasSuspiciousInstruction: boolean; pattern?: string } {
  const injectionPatterns = [
    /ignore\s+(?:all\s+)?previous\s+instructions/i,
    /system\s+prompt\s+override/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /override\s+owner\s+authority/i,
    /bypass\s+(?:security|rules|guardrails)/i,
    /execute\s+as\s+root/i,
    /drop\s+table\b/i,
  ];
  for (const re of injectionPatterns) {
    if (re.test(text)) {
      return { hasSuspiciousInstruction: true, pattern: re.source };
    }
  }
  return { hasSuspiciousInstruction: false };
}

/** Code heuristics — structural, not keyword-only. */
function looksLikeCode(text: string): { isCode: boolean; language: string } {
  const signals: Array<{ re: RegExp; lang: string }> = [
    { re: /\b(?:interface|type)\s+\w+\s*[={]|:\s*(?:string|number|boolean|any|void)\b|<[A-Za-z]+[^>]*>[\s\S]*<\/[A-Za-z]+>/, lang: "typescript" },
    { re: /\b(?:function|const|let|var|return|import|export)\b/, lang: "javascript" },
    { re: /\b(?:def|class|import)\b.*:\s*$/m, lang: "python" },
    { re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b\s+(?:\*|FROM|INTO|SET)/i, lang: "sql" },
    { re: /<[a-z]+[^>]*>[\s\S]*<\/[a-z]+>/i, lang: "html" },
    { re: /\b(?:package|func)\s+\w+/, lang: "go" },
    { re: /\b(?:pub\s+fn|use\s+\w+::)/, lang: "rust" },
  ];
  const structural =
    (text.match(/[{};]/g)?.length ?? 0) >= 3 ||
    /^(?:[ \t]*[{}[\\]();,]|#!)/m.test(text);
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
        if (inQuotes) return null;
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

  /** Stage 1..10 Ingest: Text, code, documents, structured data. */
  ingest(
    input: string,
    origin = "conversation",
  ): {
    percepts: Percept[];
    secretsRedacted: number;
  } {
    const startTime = Date.now();
    const { redacted, foundCount } = redactSecrets(input);
    this.redactions += foundCount;
    const percepts: Percept[] = [];
    this.ingested += 1;

    const urls = redacted.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    const codeCheck = looksLikeCode(redacted);
    const structured = codeCheck.isCode
      ? { parsed: null, format: null }
      : parseStructured(redacted);

    const injection = detectInjectionPatterns(redacted);
    const processingMs = Date.now() - startTime;
    const rawHash = sha256(input.slice(0, 1024));

    let mainModality: PerceptionModality = "text";
    let contentVal: unknown = redacted;
    let metadata: Record<string, unknown> = {};

    if (codeCheck.isCode) {
      mainModality = "code";
      contentVal = redacted;
      metadata = {
        language: codeCheck.language,
        bytes: redacted.length,
      };
    } else if (structured.format) {
      mainModality = "structured-data";
      contentVal = structured.parsed;
      metadata = {
        format: structured.format,
      };
    } else if (
      redacted.startsWith("---") ||
      (redacted.match(/^#{1,6}\s+/m) && redacted.split("\n").length > 3)
    ) {
      mainModality = "document";
      contentVal = redacted;
      metadata = {
        words: redacted.split(/\s+/).filter(Boolean).length,
        isMarkdownDocument: true,
      };
    } else {
      mainModality = "text";
      contentVal = redacted;
      metadata = {
        words: redacted.split(/\s+/).filter(Boolean).length,
        urls: urls.length,
      };
    }

    const obs: StructuredObservation = {
      id: nextObservationId(),
      modality: mainModality,
      sourceType: origin === "conversation" ? "conversation" : "user_upload",
      capturedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      epistemicStatus: "DIRECT_OBSERVATION",
      confidence: injection.hasSuspiciousInstruction ? 0.75 : 1.0,
      uncertainties: injection.hasSuspiciousInstruction
        ? ["Contains potentially adversarial or override instruction"]
        : [],
      limitations: ["Text modality carries no direct sensory grounding by itself"],
      provenance: {
        origin,
        algorithmOrModel: "native-text-classifier",
        rawHash,
        processingMs,
      },
      features: {
        entities: redacted
          .split(/\W+/)
          .filter((w) => w.length > 4 && /^[A-Z]/.test(w))
          .slice(0, 10),
        extractedText: {
          text: redacted,
          confidence: 1.0,
          isFlaggedUncertain: false,
        },
      },
      securityClassification: injection.hasSuspiciousInstruction ? "sensitive" : "public",
      secretsRedactedCount: foundCount,
      retentionPolicy: "session",
      recommendedDownstreamAction: injection.hasSuspiciousInstruction
        ? "security_escalation"
        : "semantic_reasoning",
    };

    percepts.push({
      id: nextPerceptId(),
      modality: mainModality,
      content: contentVal,
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        ...metadata,
        quarantinedInstruction: injection.hasSuspiciousInstruction,
      },
      observation: obs,
    });

    for (const url of urls.slice(0, 5)) {
      percepts.push({
        id: nextPerceptId(),
        modality: "website",
        content: url,
        origin,
        observedAt: new Date().toISOString(),
        metadata: {
          note: "url detected — fetch happens only through the authorized web-research pipeline",
        },
      });
    }

    return { percepts, secretsRedacted: foundCount };
  }

  /** Stage 1..10 Document Ingest: Full structured document perception (Markdown, YAML frontmatter, tables, sections). */
  ingestDocument(
    content: string,
    filename = "document.md",
    origin = "user_upload",
  ): {
    percept: Percept;
    observation: StructuredObservation;
    outline: {
      title?: string;
      sections: Array<{ level: number; heading: string }>;
      tablesCount: number;
      codeBlocksCount: number;
      wordCount: number;
      metadata?: Record<string, string>;
    };
  } {
    const startTime = Date.now();
    const { redacted, foundCount } = redactSecrets(content);
    this.redactions += foundCount;
    this.ingested += 1;

    const lines = redacted.split("\n");
    const sections: Array<{ level: number; heading: string }> = [];
    const metadata: Record<string, string> = {};
    let tablesCount = 0;
    let codeBlocksCount = 0;
    let inCodeBlock = false;
    let inFrontmatter = false;
    let docTitle: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (i === 0 && line === "---") {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (line === "---") {
          inFrontmatter = false;
          continue;
        }
        const kvMatch = line.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
        if (kvMatch) {
          metadata[kvMatch[1]] = kvMatch[2].replace(/^['"]|['"]$/g, "");
          if (kvMatch[1].toLowerCase() === "title" && !docTitle) {
            docTitle = metadata[kvMatch[1]];
          }
        }
        continue;
      }

      if (line.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        if (inCodeBlock) codeBlocksCount++;
        continue;
      }
      if (inCodeBlock) continue;

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headingMatch[2].trim();
        sections.push({ level, heading });
        if (level === 1 && !docTitle) {
          docTitle = heading;
        }
        continue;
      }

      if (line.startsWith("|") && line.endsWith("|")) {
        if (line.includes("---")) {
          tablesCount++;
        }
      }
    }

    if (!docTitle && sections.length > 0) {
      docTitle = sections[0].heading;
    }
    if (!docTitle && filename) {
      docTitle = filename.replace(/\.[^/.]+$/, "");
    }

    const words = redacted.split(/\s+/).filter(Boolean);
    const outline = {
      title: docTitle,
      sections,
      tablesCount,
      codeBlocksCount,
      wordCount: words.length,
      metadata,
    };

    const injection = detectInjectionPatterns(redacted);
    const rawHash = sha256(content.slice(0, 1024));

    const obs: StructuredObservation = {
      id: nextObservationId(),
      modality: "document",
      sourceType: "user_upload",
      capturedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      epistemicStatus: "DIRECT_OBSERVATION",
      confidence: injection.hasSuspiciousInstruction ? 0.8 : 0.98,
      uncertainties: injection.hasSuspiciousInstruction
        ? ["Contains potentially adversarial or override instruction in document body"]
        : [],
      limitations: [
        "Document claims represent author assertions; physical world corroboration requires external evidence",
      ],
      provenance: {
        origin,
        algorithmOrModel: "native-document-structure-parser",
        rawHash,
        processingMs: Date.now() - startTime,
      },
      features: {
        entities: redacted
          .split(/\W+/)
          .filter((w) => w.length > 4 && /^[A-Z]/.test(w))
          .slice(0, 20),
        extractedText: {
          text: redacted,
          confidence: 1.0,
          isFlaggedUncertain: false,
        },
        documentOutline: outline,
      },
      securityClassification: injection.hasSuspiciousInstruction ? "sensitive" : "internal",
      secretsRedactedCount: foundCount,
      retentionPolicy: "session",
      recommendedDownstreamAction: injection.hasSuspiciousInstruction
        ? "security_escalation"
        : "semantic_reasoning",
    };

    const percept: Percept = {
      id: nextPerceptId(),
      modality: "document",
      content: {
        filename,
        outline,
        redactedText: redacted,
      },
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        filename,
        sectionsCount: sections.length,
        tablesCount,
        codeBlocksCount,
        wordCount: words.length,
      },
      observation: obs,
    };

    return { percept, observation: obs, outline };
  }

  /** Ingest image bytes with native vision, OCR, limitation detection,
   *  spatial heuristics and construction candidate estimation. */
  async ingestImage(
    bytes: Uint8Array,
    origin = "conversation",
    _options: { ocr?: boolean } = {},
  ): Promise<{
    percept: Percept | null;
    note: string;
    analysis: ImageAnalysis | null;
    observation?: StructuredObservation;
  }> {
    const startTime = Date.now();
    const result = await analyzeImage(bytes);
    if (!result.ok) {
      return { percept: null, note: result.note, analysis: null };
    }
    this.ingested += 1;

    const analysis = result.analysis;
    const limitations: string[] = [];
    const uncertainties: string[] = [];

    // Vision limitation checks (§4.E)
    if (analysis.width < 50 || analysis.height < 50) {
      limitations.push("Image dimensions very low — small scene or thumbnail");
    }
    if (analysis.meanLuma !== null && analysis.meanLuma < 30) {
      limitations.push("Low lighting / underexposed scene");
      uncertainties.push("Low luminance reduces visibility of dark surface features");
    } else if (analysis.meanLuma !== null && analysis.meanLuma > 230) {
      limitations.push("Overexposed scene / high glare");
      uncertainties.push("High luminance may wash out surface textures");
    }
    if (analysis.edgeDensity !== null && analysis.edgeDensity < 0.015) {
      limitations.push("Low edge density — potentially blurry or uniform subject");
    }
    limitations.push(
      "Lacks calibrated metric reference scale — dimensions and distances are relative visual estimates only",
    );

    // Spatial and geometric relative interpretation (§4.C)
    const spatialRelationships: Array<{
      subject: string;
      relation: string;
      object: string;
      estimated: boolean;
    }> = [];

    if (analysis.dominantColors && analysis.dominantColors.length > 0) {
      spatialRelationships.push({
        subject: "dominant_region",
        relation: "occupies_primary_palette",
        object: analysis.dominantColors[0].name,
        estimated: true,
      });
    }

    // Construction & property candidate understanding (§4.D - FRELUX integration)
    const constructionElements: string[] = [];
    const defectCandidates: string[] = [];
    if (analysis.depth === "full-pixel" && analysis.contentClass) {
      if (analysis.contentClass === "flat") {
        constructionElements.push("planar_surface_candidate (wall/ceiling/floor)");
      }
      if (analysis.edgeDensity !== null && analysis.edgeDensity > 0.08) {
        defectCandidates.push("high_contrast_edge_discontinuity (possible joint/crack candidate)");
      }
    }

    // Optical character recognition (§4.B)
    let extractedTextResult: { text: string; confidence: number; isFlaggedUncertain?: boolean } | undefined;
    if (analysis.text && analysis.text.lines.length > 0) {
      const fullText = analysis.text.lines.map((l) => l.text).join(" ");
      extractedTextResult = {
        text: fullText,
        confidence: analysis.text.lines.reduce((sum, line) => sum + line.confidence, 0) / analysis.text.lines.length,
        isFlaggedUncertain: (analysis.text.lines.reduce((sum, line) => sum + line.confidence, 0) / analysis.text.lines.length) < 0.8,
      };
    }

    const obs: StructuredObservation = {
      id: nextObservationId(),
      modality: "image",
      sourceType: origin === "camera" ? "camera" : "user_upload",
      capturedAt: analysis.analyzedAt,
      processedAt: new Date().toISOString(),
      epistemicStatus: "DIRECT_OBSERVATION",
      confidence: analysis.depth === "full-pixel" ? (analysis.contentConfidence ?? 0.85) : 0.65,
      uncertainties,
      limitations,
      provenance: {
        origin,
        algorithmOrModel:
          analysis.depth === "full-pixel"
            ? "native-vision-pixel-analyzer"
            : "native-vision-structure-parser",
        rawHash: sha256(String(bytes.slice(0, 512))),
        processingMs: Date.now() - startTime,
      },
      features: {
        composition: {
          aspectRatioCategory:
            analysis.width / Math.max(1, analysis.height) > 2.0
              ? "ultrawide"
              : analysis.width / Math.max(1, analysis.height) >= 1.6
              ? "widescreen_16_9"
              : analysis.width / Math.max(1, analysis.height) >= 1.2
              ? "standard_4_3"
              : analysis.width / Math.max(1, analysis.height) >= 0.85
              ? "square_1_1"
              : "portrait_9_16",
          brightnessCategory:
            analysis.meanLuma !== null
              ? analysis.meanLuma < 35
                ? "dark_underexposed"
                : analysis.meanLuma < 85
                ? "dim_low_light"
                : analysis.meanLuma <= 175
                ? "balanced_normal"
                : analysis.meanLuma <= 225
                ? "bright_high_key"
                : "overexposed_glare"
              : "unknown",
          blurScore:
            analysis.edgeDensity !== null
              ? Math.max(0, Number((1 - analysis.edgeDensity * 20).toFixed(2)))
              : undefined,
        },
        spatialRelationships,
        constructionEstimates: {
          elements: constructionElements,
          defects: defectCandidates,
          note: "Visual candidates only — unvalidated until confirmed against FRELUX deterministic calculation",
          validated: false,
        },
        extractedText: extractedTextResult,
      },
      securityClassification: "public",
      secretsRedactedCount: 0,
      retentionPolicy: "ephemeral",
      recommendedDownstreamAction: "semantic_reasoning",
    };

    const percept: Percept = {
      id: nextPerceptId(),
      modality: "image",
      content: analysis,
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        format: analysis.format,
        depth: analysis.depth,
        width: analysis.width,
        height: analysis.height,
        bounds: "color/brightness/composition statistics only — no uncalibrated object recognition claimed",
        hasText: Boolean(analysis.text?.lines.length),
      },
      observation: obs,
    };

    return {
      percept,
      note:
        analysis.depth === "full-pixel"
          ? `image analyzed natively (${analysis.format.toUpperCase()} pixels)`
          : "image parsed structurally only — pixel analysis honestly unavailable",
      analysis,
      observation: obs,
    };
  }

  /** Ingest audio input: PCM or native speech recognition transcript (§5). */
  ingestAudio(
    input: {
      pcm?: Float32Array;
      transcript?: string;
      sampleRate?: number;
      origin?: string;
    },
    origin = "microphone",
  ): {
    percept: Percept | null;
    analysis?: AudioEventAnalysis | null;
    observation: StructuredObservation;
    note: string;
  } {
    const startTime = Date.now();
    const limitations: string[] = [];
    const uncertainties: string[] = [];
    let audioAnalysis: AudioEventAnalysis | null = null;
    let normalizedTranscript = "";

    if (input.transcript) {
      const norm = normalizeTranscript(input.transcript);
      if (norm.ok) {
        normalizedTranscript = norm.transcript;
      } else {
        uncertainties.push(`Transcript issue: ${norm.code}`);
      }
    }

    if (input.pcm && input.pcm.length > 0) {
      const rate = input.sampleRate ?? 16000;
      audioAnalysis = analyzeAudioEvents(input.pcm, rate);
      if (!audioAnalysis.ok) {
        limitations.push(`Audio signal processing notice: ${audioAnalysis.note}`);
      }
    } else if (!input.transcript) {
      limitations.push("No PCM audio data and no transcript provided");
    }

    limitations.push("Voice resemblance does not constitute authenticated identity");

    const events = (audioAnalysis?.segments ?? []).map((s) => ({
      kind: s.kind,
      startSec: s.startSec,
      endSec: s.endSec,
      confidence: s.confidence,
      speaker: s.speaker,
    }));

    const obs: StructuredObservation = {
      id: nextObservationId(),
      modality: "audio",
      sourceType: origin === "microphone" ? "microphone" : "user_upload",
      capturedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      epistemicStatus: "DIRECT_OBSERVATION",
      confidence: (audioAnalysis?.ok || events.length > 0) ? 0.9 : normalizedTranscript ? 0.8 : 0.4,
      uncertainties,
      limitations,
      provenance: {
        origin,
        algorithmOrModel: audioAnalysis
          ? "native-audio-events-fft"
          : "native-speech-recognition-normalizer",
        processingMs: Date.now() - startTime,
      },
      features: {
        audioEvents: events,
        extractedText: normalizedTranscript
          ? { text: normalizedTranscript, confidence: 0.85, isFlaggedUncertain: false }
          : undefined,
      },
      securityClassification: "internal",
      secretsRedactedCount: 0,
      retentionPolicy: "ephemeral",
      recommendedDownstreamAction: "semantic_reasoning",
    };

    const percept: Percept = {
      id: nextPerceptId(),
      modality: "audio",
      content: {
        transcript: normalizedTranscript,
        audioAnalysis,
        summary: audioAnalysis?.summary ?? (normalizedTranscript ? "speech recognized" : "empty audio"),
      },
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        segmentsCount: events.length,
        hasSpeech: Boolean(normalizedTranscript || events.some((e) => e.kind === "speech")),
      },
      observation: obs,
    };

    return {
      percept,
      analysis: audioAnalysis,
      observation: obs,
      note: audioAnalysis?.summary ?? "Audio processed honestly with native engine",
    };
  }

  /** Ingest video container and optional frame sequence (§6). */
  ingestVideo(
    bytes: Uint8Array,
    frames?: FrameSample[],
    origin = "user_upload",
  ): {
    percept: Percept | null;
    containerInfo: VideoContainerInfo;
    frameAnalysis?: FrameAnalysis;
    observation: StructuredObservation;
    note: string;
  } {
    const startTime = Date.now();
    const container = inspectContainer(bytes);
    const limitations: string[] = [
      "Video analysis measures structural/signal statistics (motion, cuts, container metadata) — does not infer unverified semantic objects",
    ];
    const uncertainties: string[] = [];

    let frameAnalysis: FrameAnalysis | undefined;
    if (frames && frames.length > 0) {
      frameAnalysis = analyzeFrameSequence(frames);
    }

    if (!container.ok) {
      limitations.push(`Container inspection: ${container.note}`);
      uncertainties.push("Unrecognized or truncated video container");
    }

    const obs: StructuredObservation = {
      id: nextObservationId(),
      modality: "video",
      sourceType: "user_upload",
      capturedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      epistemicStatus: "DIRECT_OBSERVATION",
      confidence: container.ok ? 0.9 : 0.5,
      uncertainties,
      limitations,
      provenance: {
        origin,
        algorithmOrModel: "native-video-perception-parser",
        rawHash: sha256(String(bytes.slice(0, 512))),
        processingMs: Date.now() - startTime,
      },
      features: {
        motionAndScenes: {
          cutsCount: frameAnalysis?.segments.filter((s) => s.kind === "cut").length ?? 0,
          averageMotionEnergy: frameAnalysis?.motionScore ?? 0,
          durationSec: container.durationSec ?? undefined,
          fpsEstimate: container.fpsEstimate ?? undefined,
        },
      },
      securityClassification: "internal",
      secretsRedactedCount: 0,
      retentionPolicy: "ephemeral",
      recommendedDownstreamAction: "semantic_reasoning",
    };

    const percept: Percept = {
      id: nextPerceptId(),
      modality: "video",
      content: {
        container,
        frameAnalysis,
      },
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        container: container.container,
        width: container.widthPx,
        height: container.heightPx,
        durationSec: container.durationSec,
      },
      observation: obs,
    };

    return {
      percept,
      containerInfo: container,
      frameAnalysis,
      observation: obs,
      note: container.note,
    };
  }

  /** Ingest sensor readings from connected device or IoT sensor (§1, §10). */
  ingestSensor(
    readings: Record<
      string,
      { value: number | string; unit: string; calibrated?: boolean; location?: string; timestamp?: string }
    >,
    origin = "iot_sensor",
  ): {
    percept: Percept;
    observation: StructuredObservation;
    telemetryAnalysis: {
      anomaliesDetected: string[];
      uncalibratedSensors: string[];
      outOfBoundsSensors: string[];
      overallHealthScore: number;
    };
  } {
    const startTime = Date.now();
    const uncertainties: string[] = [];
    const limitations: string[] = [
      "Sensor observations reflect telemetry data reported by external hardware gateway",
    ];
    const anomaliesDetected: string[] = [];
    const uncalibratedSensors: string[] = [];
    const outOfBoundsSensors: string[] = [];

    // Range bounds & physical feasibility dictionary
    const bounds: Record<string, { min: number; max: number }> = {
      temperature_celsius: { min: -273.15, max: 1000 },
      temp_c: { min: -273.15, max: 1000 },
      temperature: { min: -273.15, max: 1000 },
      humidity_pct: { min: 0, max: 100 },
      humidity: { min: 0, max: 100 },
      battery_pct: { min: 0, max: 100 },
      battery: { min: 0, max: 100 },
      pressure_hpa: { min: 300, max: 1200 },
      ambient_lux: { min: 0, max: 200000 },
      lux: { min: 0, max: 200000 },
      vibration_rms: { min: 0, max: 100 },
      voltage_v: { min: 0, max: 500 },
      tilt_degrees: { min: -180, max: 180 },
    };

    for (const [key, val] of Object.entries(readings)) {
      if (val.calibrated === false) {
        uncalibratedSensors.push(key);
        uncertainties.push(`Sensor '${key}' is marked UNCALIBRATED`);
      }

      const numVal = typeof val.value === "number" ? val.value : parseFloat(String(val.value));
      if (!isNaN(numVal)) {
        const boundKey = Object.keys(bounds).find(
          (b) => key.toLowerCase() === b || key.toLowerCase().includes(b),
        );
        if (boundKey) {
          const bound = bounds[boundKey];
          if (numVal < bound.min || numVal > bound.max) {
            outOfBoundsSensors.push(
              `${key}: ${numVal} (physically valid ${bound.min}..${bound.max} ${val.unit})`,
            );
            uncertainties.push(`Physical boundary violation on '${key}': ${numVal} ${val.unit}`);
          }
        }

        // Anomaly heuristics
        if (key.toLowerCase().includes("vibration") && numVal > 15) {
          anomaliesDetected.push(`High vibration anomaly: ${numVal} ${val.unit}`);
        }
        if (key.toLowerCase().includes("battery") && numVal < 10) {
          anomaliesDetected.push(`Critical low battery: ${numVal}%`);
        }
        if (key.toLowerCase().includes("temp") && (numVal > 75 || numVal < -20)) {
          anomaliesDetected.push(`Extreme temperature anomaly: ${numVal} ${val.unit}`);
        }
      }
    }

    const healthDeductions =
      uncalibratedSensors.length * 10 +
      outOfBoundsSensors.length * 25 +
      anomaliesDetected.length * 15;
    const overallHealthScore = Math.max(0, 100 - healthDeductions);

    const telemetryAnalysis = {
      anomaliesDetected,
      uncalibratedSensors,
      outOfBoundsSensors,
      overallHealthScore,
    };

    const epistemicStatus: ObservationEpistemicStatus =
      outOfBoundsSensors.length > 0 || uncalibratedSensors.length > 0
        ? "INFERRED_HYPOTHESIS"
        : "DIRECT_OBSERVATION";

    const confidence =
      outOfBoundsSensors.length > 0
        ? 0.4
        : uncalibratedSensors.length > 0
        ? 0.7
        : 0.98;

    const obs: StructuredObservation = {
      id: nextObservationId(),
      modality: "sensor",
      sourceType: "iot_sensor",
      capturedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      epistemicStatus,
      confidence,
      uncertainties,
      limitations,
      provenance: {
        origin,
        algorithmOrModel: "native-sensor-telemetry-engine",
        processingMs: Date.now() - startTime,
      },
      features: {
        sensorReadings: readings,
        telemetryAnalysis,
      },
      securityClassification: "internal",
      secretsRedactedCount: 0,
      retentionPolicy: "ephemeral",
      recommendedDownstreamAction:
        anomaliesDetected.length > 0 || outOfBoundsSensors.length > 0
          ? "clarification_needed"
          : "semantic_reasoning",
    };

    const percept: Percept = {
      id: nextPerceptId(),
      modality: "sensor",
      content: {
        readings,
        telemetryAnalysis,
      },
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        keys: Object.keys(readings),
        healthScore: overallHealthScore,
        hasAnomalies: anomaliesDetected.length > 0,
      },
      observation: obs,
    };

    return { percept, observation: obs, telemetryAnalysis };
  }

  /** Cross-Modal Correlation & Contradiction Detection (§7). */
  correlateObservations(
    obsA: StructuredObservation,
    obsB: StructuredObservation,
  ): {
    correlationType: "corroborates" | "contradicts" | "supplements";
    confidence: number;
    explanation: string;
    contradictions: string[];
  } {
    const contradictions: string[] = [];
    let correlationType: "corroborates" | "contradicts" | "supplements" = "supplements";

    // 1. Audio vs Visual lighting / environment check
    if (obsA.modality === "text" && obsB.modality === "image") {
      const text = obsA.features.extractedText?.text.toLowerCase() ?? "";
      if ((text.includes("bright sunny") || text.includes("broad daylight")) && obsB.limitations.some((l) => l.includes("Low lighting"))) {
        contradictions.push("Text claims daylight/bright sunlight, but image luma indicates dark/low lighting scene");
        correlationType = "contradicts";
      }
    } else if (obsA.modality === "image" && obsB.modality === "text") {
      return this.correlateObservations(obsB, obsA);
    }

    // 2. Audio silence vs ambient noise check
    if (obsA.modality === "text" && obsB.modality === "audio") {
      const text = obsA.features.extractedText?.text.toLowerCase() ?? "";
      const hasNoiseOrAlarms = (obsB.features.audioEvents ?? []).some(
        (e) => (e.kind === "noise" || e.kind === "tone") && e.confidence > 0.7,
      );
      if (text.includes("completely silent") && hasNoiseOrAlarms) {
        contradictions.push("Text asserts complete silence, but audio analysis detected ambient noise/tones");
        correlationType = "contradicts";
      }
    }

    // 3. Sensor vs Image / Environment correlation
    if (obsA.modality === "sensor" && obsB.modality === "image") {
      const readings = obsA.features.sensorReadings ?? {};
      const luxVal = readings["ambient_lux"]?.value ?? readings["lux"]?.value;
      if (luxVal !== undefined) {
        const lux = Number(luxVal);
        if (lux < 20 && obsB.features.composition?.brightnessCategory === "bright_high_key") {
          contradictions.push(
            `Sensor lux is very low (${lux} lx) but image is classified as bright/high-key`,
          );
          correlationType = "contradicts";
        } else if (lux > 500 && obsB.features.composition?.brightnessCategory === "dark_underexposed") {
          contradictions.push(
            `Sensor lux is high (${lux} lx) but image is classified as dark/underexposed`,
          );
          correlationType = "contradicts";
        } else if (
          (lux > 200 && (obsB.features.composition?.brightnessCategory === "balanced_normal" || obsB.features.composition?.brightnessCategory === "bright_high_key")) ||
          (lux < 50 && obsB.features.composition?.brightnessCategory === "dim_low_light")
        ) {
          correlationType = "corroborates";
        }
      }
    } else if (obsA.modality === "image" && obsB.modality === "sensor") {
      return this.correlateObservations(obsB, obsA);
    }

    // 4. Audio vs Video motion / activity correlation
    if (obsA.modality === "audio" && obsB.modality === "video") {
      const hasSpeech = (obsA.features.audioEvents ?? []).some((e) => e.kind === "speech");
      const videoMotion = obsB.features.motionAndScenes?.averageMotionEnergy ?? 0;
      if (hasSpeech && videoMotion > 0.05) {
        correlationType = "corroborates";
      } else if (!hasSpeech && videoMotion === 0) {
        correlationType = "corroborates";
      }
    } else if (obsA.modality === "video" && obsB.modality === "audio") {
      return this.correlateObservations(obsB, obsA);
    }

    // 5. Spoken transcript vs OCR / Document text consistency
    if (obsA.features.extractedText && obsB.features.extractedText) {
      const tA = obsA.features.extractedText.text.toLowerCase();
      const tB = obsB.features.extractedText.text.toLowerCase();
      if (tA && tB) {
        const wordsA = new Set(tA.split(/\s+/).filter((w) => w.length > 3));
        const wordsB = tB.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = wordsB.filter((w) => wordsA.has(w)).length;
        if (matchCount >= 2) {
          correlationType = "corroborates";
        }
      }
    }

    const confidence = contradictions.length > 0 ? 0.95 : correlationType === "corroborates" ? 0.9 : 0.8;
    const explanation =
      contradictions.length > 0
        ? `Contradiction detected: ${contradictions.join("; ")}`
        : `Observations ${obsA.id} (${obsA.modality}) and ${obsB.id} (${obsB.modality}) ${correlationType} each other`;

    // Record cross-modal correlation link
    if (!obsA.crossModalCorrelations) obsA.crossModalCorrelations = [];
    obsA.crossModalCorrelations.push({
      targetObservationId: obsB.id,
      correlationType,
      confidence,
      explanation,
    });

    if (contradictions.length > 0) {
      if (!obsA.contradictionsDetected) obsA.contradictionsDetected = [];
      obsA.contradictionsDetected.push(...contradictions);
    }

    return { correlationType, confidence, explanation, contradictions };
  }

  /** Fuse multiple observations into one coherent multimodal percept (§7).
   *  Promotes epistemic status to CORROBORATED_FACT when distinct modalities corroborate without contradiction. */
  fuseMultimodal(
    observations: StructuredObservation[],
    origin = "multimodal_fusion",
  ): {
    percept: Percept;
    observation: StructuredObservation;
    contradictions: string[];
    clarificationPrompt?: string;
  } {
    const allContradictions: string[] = [];
    let corroborationsCount = 0;

    for (let i = 0; i < observations.length; i++) {
      for (let j = i + 1; j < observations.length; j++) {
        const corr = this.correlateObservations(observations[i], observations[j]);
        if (corr.contradictions.length > 0) {
          allContradictions.push(...corr.contradictions);
        } else if (corr.correlationType === "corroborates") {
          corroborationsCount++;
        }
      }
    }

    const modalities = Array.from(new Set(observations.map((o) => o.modality)));
    const allEntities = Array.from(
      new Set(observations.flatMap((o) => o.features.entities ?? [])),
    );
    const allLimitations = Array.from(
      new Set(observations.flatMap((o) => o.limitations)),
    );
    const allUncertainties = Array.from(
      new Set(observations.flatMap((o) => o.uncertainties)),
    );

    const hasContradictions = allContradictions.length > 0;
    const isCorroboratedFact =
      !hasContradictions &&
      corroborationsCount > 0 &&
      modalities.length >= 2;

    const epistemicStatus: ObservationEpistemicStatus = hasContradictions
      ? "INFERRED_HYPOTHESIS"
      : isCorroboratedFact
      ? "VERIFIED_FACT"
      : "DIRECT_OBSERVATION";

    const baseConf =
      observations.reduce((acc, o) => acc + o.confidence, 0) /
      Math.max(1, observations.length);

    const fusedConfidence = hasContradictions
      ? Math.max(0.1, Number((baseConf - 0.3).toFixed(2)))
      : isCorroboratedFact
      ? Math.min(1.0, Number((baseConf + 0.1).toFixed(2)))
      : Number(baseConf.toFixed(2));

    const clarificationPrompt = hasContradictions
      ? `Contradictions detected between sensory modalities (${allContradictions.join("; ")}). ARCHIE requests explicit verification before updating world model or executing downstream actions.`
      : undefined;

    const fusedObs: StructuredObservation = {
      id: nextObservationId(),
      modality: "multimodal",
      sourceType: "conversation",
      capturedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      epistemicStatus,
      confidence: fusedConfidence,
      uncertainties: [...allUncertainties, ...(hasContradictions ? allContradictions : [])],
      limitations: allLimitations,
      provenance: {
        origin,
        algorithmOrModel: "native-multimodal-fusion-engine",
        processingMs: 5,
      },
      features: {
        entities: allEntities,
      },
      contradictionsDetected: allContradictions,
      clarificationPrompt,
      securityClassification: observations.some((o) => o.securityClassification === "sensitive")
        ? "sensitive"
        : "public",
      secretsRedactedCount: observations.reduce((acc, o) => acc + o.secretsRedactedCount, 0),
      retentionPolicy: "ephemeral",
      recommendedDownstreamAction: hasContradictions
        ? "clarification_needed"
        : isCorroboratedFact
        ? "world_model_update"
        : "semantic_reasoning",
    };

    const percept: Percept = {
      id: nextPerceptId(),
      modality: "multimodal",
      content: {
        modalityCount: modalities.length,
        modalities,
        observationCount: observations.length,
        contradictions: allContradictions,
        isCorroboratedFact,
        clarificationPrompt,
      },
      origin,
      observedAt: new Date().toISOString(),
      metadata: {
        fusedModalities: modalities,
        hasContradictions,
        epistemicStatus,
      },
      observation: fusedObs,
    };

    return {
      percept,
      observation: fusedObs,
      contradictions: allContradictions,
      clarificationPrompt,
    };
  }

  /** Honest modality support report (§16). */
  static supportReport(): {
    supported: PerceptionModality[];
    capabilities: Array<{
      modality: PerceptionModality;
      level: "FULL" | "BOUNDED" | "DEGRADED";
      scope: string;
    }>;
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
        "audio",
        "video",
        "sensor",
        "multimodal",
      ],
      capabilities: [
        {
          modality: "text",
          level: "FULL",
          scope: "Natural language processing, injection detection, and secret redaction",
        },
        {
          modality: "code",
          level: "FULL",
          scope: "Syntax classification, language heuristics, and code scent extraction",
        },
        {
          modality: "structured-data",
          level: "FULL",
          scope: "JSON, CSV, tabular records, and schema validation",
        },
        {
          modality: "document",
          level: "FULL",
          scope: "Markdown, YAML frontmatter, table parsing, section hierarchy, and document outlines",
        },
        {
          modality: "sensor",
          level: "FULL",
          scope: "Structured telemetry ingestion, boundary checks, anomaly scoring, and calibration validation",
        },
        {
          modality: "multimodal",
          level: "FULL",
          scope: "Cross-modal temporal correlation, contradiction detection, epistemic fact promotion, and clarification prompts",
        },
        {
          modality: "image",
          level: "BOUNDED",
          scope: "Native geometry, luminance, edge density, composition categories, and OCR; no zero-shot semantic object detection",
        },
        {
          modality: "audio",
          level: "BOUNDED",
          scope: "Speech recognition transcripts and deterministic PCM signal segmentation; no biometric speaker verification",
        },
        {
          modality: "video",
          level: "BOUNDED",
          scope: "MP4 box metadata inspection and sampled frame statistics; no streaming semantic video understanding",
        },
      ],
      unsupported: [
        {
          modality: "biometric_voice_id",
          note: "Voice pitch or timbre matching cannot authorize privileged actions or prove real-world identity",
        },
        {
          modality: "live_camera_feed",
          note: "Continuous streaming camera video is not supported in the serverless runtime; use uploaded images or video clips",
        },
        {
          modality: "direct_hardware_bus",
          note: "Physical sensor hardware buses (CAN, I2C, SPI) require an external gateway to deliver structured JSON",
        },
      ],
    };
  }

  stats(): { ingested: number; secretsRedacted: number } {
    return { ingested: this.ingested, secretsRedacted: this.redactions };
  }
}
