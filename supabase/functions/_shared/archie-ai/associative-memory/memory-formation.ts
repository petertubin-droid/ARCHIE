// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — MEMORY FORMATION
// supabase/functions/_shared/archie-ai/associative-memory/memory-formation.ts
//
// Evaluates which information deserves preservation across:
//   - Working Memory (transient, active processing)
//   - Episodic Memory (meaningful experiences, events, outcomes)
//   - Semantic Memory (reusable concepts, definitions)
//   - Long-Term Memory (persistent preferences, goals, rules)
//
// First-class handling of explicit user directives:
//   - "Remember this / that"
//   - "Forget this / that"
//   - "Update what you remember"
//   - "This is no longer correct"
//
// Strict Security & Secret Sanitization:
//   - Blocks & redacts secret keys (API keys, tokens, passwords)
//   - Neutralizes prompt injection patterns
// =========================================================

import type {
  ExplicitDirectiveKind,
  ExplicitMemoryDirective,
  MemoryFormationEvaluation,
  MemoryPrivacyClass,
  MemoryProvenanceState,
  MemoryRetentionPolicy,
  MemorySystemType,
} from "./types.ts";

// Regex patterns for sensitive credentials that must never be stored raw
const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|auth|bearer)[\s:=]+([a-zA-Z0-9_\-\.]{16,})/i,
  /(?:sk-[a-zA-Z0-9]{20,})/i,
  /(?:ghp_[a-zA-Z0-9]{20,})/i,
  /(?:xox[baprs]-[a-zA-Z0-9]{10,})/i,
  /(?:postgres(?:ql)?:\/\/[^\s]+:[^\s]+@[^\s]+)/i,
];

// Patterns for potential prompt injections trying to disguise instructions as memories
const INJECTION_PATTERNS = [
  /ignore (?:all )?previous instructions/i,
  /you are now (?:dan|an unrestricted ai|a new system)/i,
  /system directive: override/i,
  /disregard safety guidelines/i,
];

export class MemoryFormationEngine {
  /**
   * Detects explicit memory directives from user input text.
   */
  detectExplicitDirective(text: string): ExplicitMemoryDirective {
    const trimmed = text.trim();

    // Check "remember this/that"
    const rememberMatch = trimmed.match(
      /^(?:please\s+)?remember\s+(?:this|that)(?:\s*[:,\-]\s*|\s+that\s+|\s+)(.+)$/i
    );
    if (rememberMatch) {
      return {
        kind: "REMEMBER_THIS",
        content: rememberMatch[1].trim(),
      };
    }

    // Check "forget this/that / forget that about / forget about"
    const forgetMatch = trimmed.match(
      /^(?:please\s+)?forget\s+(?:that\s+about|this\s+about|that|this|about)(?:\s*[:,\-]\s*|\s+)(.+)$/i
    );
    if (forgetMatch) {
      let subj = forgetMatch[1].trim();
      if (subj.toLowerCase().startsWith("about ")) {
        subj = subj.slice(6).trim();
      }
      return {
        kind: "FORGET_THIS",
        subject: subj,
      };
    }

    // Check "update what you remember"
    const updateMatch = trimmed.match(
      /^(?:please\s+)?update\s+(?:what you remember|the record|memory)(?:\s+about|\s+for|\s*[:,\-]\s*|\s+)(.+)$/i
    );
    if (updateMatch) {
      return {
        kind: "UPDATE_REMEMBERED",
        content: updateMatch[1].trim(),
      };
    }

    // Check "no longer correct / outdated"
    const noLongerCorrectMatch = trimmed.match(
      /(?:this is|that is|this information is)?\s*(?:no longer correct|outdated|obsolete|deprecated)(?:\s*[:,\-]\s*|\s+)(.+)?/i
    );
    if (noLongerCorrectMatch) {
      return {
        kind: "NO_LONGER_CORRECT",
        content: noLongerCorrectMatch[1]?.trim(),
      };
    }

    return { kind: "NONE" };
  }

  /**
   * Sanitizes prompt injections.
   */
  sanitizePromptInjections(text: string): { sanitized: string; stripped: boolean } {
    let sanitized = text;
    let stripped = false;
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, "[UNTRUSTED_INSTRUCTION_STRIPPED]");
        stripped = true;
      }
    }
    return { sanitized, stripped };
  }

  /**
   * Evaluates input text and decides memory placement, importance, and security bounds.
   */
  evaluateFormation(
    text: string,
    context: {
      userId?: string;
      projectId?: string;
      role?: "owner" | "archie" | "system";
      taskActive?: boolean;
    } = {}
  ): MemoryFormationEvaluation {
    const directive = this.detectExplicitDirective(text);
    const reasons: string[] = [];
    const entities = this.extractCandidateEntities(text);

    // 1. Security check: Sensitive credentials
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(text)) {
        return {
          shouldRemember: false,
          system: "working",
          importance: 0.0,
          confidence: 0.0,
          provenance: "SYSTEM_OBSERVED",
          privacy: "ephemeral",
          retentionPolicy: "session_only",
          directive,
          entities: [],
          reasons: ["Refused to store raw secret/credential in persistent memory"],
          sanitizedContent: "[REDACTED_SENSITIVE_CREDENTIAL]",
          isSensitiveRefused: true,
          refusalReason: "Input contains sensitive credentials (API key, token, or connection string).",
        };
      }
    }

    // 2. Prompt Injection Neutralization
    const injectionCheck = this.sanitizePromptInjections(text);
    let sanitizedContent = injectionCheck.sanitized;
    if (injectionCheck.stripped) {
      reasons.push("Stripped potential prompt injection instructions");
    }

    // If directive has content, sanitize that too
    if (directive.content) {
      const sanitizedDirective = this.sanitizePromptInjections(directive.content);
      directive.content = sanitizedDirective.sanitized;
      if (sanitizedDirective.stripped && !reasons.includes("Stripped potential prompt injection instructions")) {
        reasons.push("Stripped potential prompt injection instructions");
      }
    }

    // 3. Priority to Explicit Directives
    if (directive.kind === "REMEMBER_THIS") {
      reasons.push("Explicit user directive: REMEMBER_THIS takes maximum precedence");
      return {
        shouldRemember: true,
        system: "long_term",
        importance: 1.0,
        confidence: 1.0,
        provenance: "USER_PROVIDED",
        privacy: "private_owner",
        retentionPolicy: "permanent",
        directive,
        entities,
        reasons,
        sanitizedContent: directive.content || sanitizedContent,
        isSensitiveRefused: false,
      };
    }

    if (directive.kind === "FORGET_THIS" || directive.kind === "NO_LONGER_CORRECT") {
      return {
        shouldRemember: false,
        system: "long_term",
        importance: 0.0,
        confidence: 1.0,
        provenance: "USER_PROVIDED",
        privacy: "private_owner",
        retentionPolicy: "session_only",
        directive,
        entities,
        reasons: ["Explicit directive to forget or mark invalid"],
        sanitizedContent,
        isSensitiveRefused: false,
      };
    }

    // 4. Automated Importance & System Scoring
    let system: MemorySystemType = "episodic";
    let importance = 0.5;
    let confidence = 0.8;
    let provenance: MemoryProvenanceState = context.role === "owner" ? "USER_PROVIDED" : "SYSTEM_OBSERVED";
    let retentionPolicy: MemoryRetentionPolicy = "project_lifetime";
    let privacy: MemoryPrivacyClass = "project_shared";

    // Detect preference patterns
    if (/\b(?:i prefer|always use|never use|my preference|default to)\b/i.test(text)) {
      system = "long_term";
      importance = 0.85;
      provenance = "USER_PROVIDED";
      retentionPolicy = "permanent";
      privacy = "private_owner";
      reasons.push("Detected durable user preference");
    }
    // Detect operational/architectural rules
    else if (/\b(?:rule:|requirement:|architecture:|standard:|convention:)\b/i.test(text)) {
      system = "long_term";
      importance = 0.95;
      retentionPolicy = "permanent";
      reasons.push("Detected architectural operational rule");
    }
    // Detect milestone or completion
    else if (/\b(?:completed|shipped|finished|passed|milestone achieved|resolved)\b/i.test(text)) {
      system = "episodic";
      importance = 0.8;
      provenance = "ACTUAL_OUTCOME";
      retentionPolicy = "permanent";
      reasons.push("Detected milestone or task completion outcome");
    }
    // Detect technical concept definitions
    else if (/\b(?:is defined as|refers to|means that|concept of)\b/i.test(text)) {
      system = "semantic";
      importance = 0.75;
      provenance = "EXTERNALLY_VERIFIED";
      reasons.push("Detected semantic concept definition");
    }
    // Active transient work
    else if (context.taskActive) {
      system = "working";
      importance = 0.6;
      retentionPolicy = "session_only";
      reasons.push("Transient context during active task");
    }

    return {
      shouldRemember: importance >= 0.4,
      system,
      importance,
      confidence,
      provenance,
      privacy,
      retentionPolicy,
      directive,
      entities,
      reasons,
      sanitizedContent,
      isSensitiveRefused: false,
    };
  }

  /**
   * Simple entity candidate extractor.
   */
  private extractCandidateEntities(text: string): string[] {
    const candidates = new Set<string>();
    const matches = text.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g);
    if (matches) {
      for (const m of matches) {
        if (!["The", "This", "That", "When", "What", "Here", "There", "With", "From"].includes(m)) {
          candidates.add(m);
        }
      }
    }
    return Array.from(candidates);
  }
}
