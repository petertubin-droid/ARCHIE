// =========================================================
// FRELUX AI FOUNDATION, PROPERTY QUESTION ANSWERING (Phase 5 §16)
//
// The Copilot's property-intelligence surface: deterministic intent
// classification + retrieval over the ACTUAL Property Intelligence
// report. No AI call is needed to answer, the deterministic answer
// is assembled from recorded data, and an optional AI summary may
// only relay it. Nothing is invented; missing data is reported as
// missing.
// =========================================================

import type { PropertyIntelligenceReport } from "@/lib/property-intelligence/intelligence";
import {
  REGION_UNAVAILABLE_MESSAGE,
  PROPERTY_INTELLIGENCE_DISCLAIMER,
} from "@/lib/property-intelligence/intelligence";
import { CONDITION_CATEGORY_LABELS } from "@/lib/property-intelligence/property-condition";
import { VALUE_LABEL } from "@/lib/property-intelligence/property-value";

export type PropertyQuestionKind =
  | "analyse_property"
  | "renovate_or_rebuild"
  | "missing_information"
  | "development_cost"
  | "compare_properties"
  | "biggest_risks"
  | "show_assumptions";

/** Deterministic intent classification (§16). */
export function classifyPropertyQuestion(
  question: string,
): PropertyQuestionKind | null {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.every((w) => q.includes(w));

  if (has("compare") && (has("propert") || has("these two")))
    return "compare_properties";
  if (has("missing") || has("what information") || has("what info do"))
    return "missing_information";
  if (has("assumption")) return "show_assumptions";
  if (has("risk") || has("biggest problem")) return "biggest_risks";
  if (
    (has("renovat") || has("refurb")) &&
    (has("rebuild") || has("redevelop") || has("instead") || has("or"))
  )
    return "renovate_or_rebuild";
  if (
    has("development cost") ||
    has("how much could development") ||
    has("cost to develop") ||
    has("how much would it cost")
  )
    return "development_cost";
  if (
    has("analyse") ||
    has("analyze") ||
    has("assessment of") ||
    (has("tell me about") && has("propert"))
  )
    return "analyse_property";
  return null;
}

const disclaimerLine = `\n\n${PROPERTY_INTELLIGENCE_DISCLAIMER}`;

/**
 * Answer a property question from a prebuilt Property Intelligence
 * report. Pure, deterministic retrieval, returns null when the
 * question matches no property intent.
 */
export function answerPropertyQuestion(
  report: PropertyIntelligenceReport | null,
  question: string,
): string | null {
  const kind = classifyPropertyQuestion(question);
  if (!kind) return null;
  if (!report) {
    return "No property data is available to answer this question. Add or select a property first.";
  }

  switch (kind) {
    case "analyse_property": {
      const lines: string[] = [
        `Property: ${report.profile.valid ? "profile recorded" : "profile incomplete"}`,
      ];
      if (report.location.status === "unavailable")
        lines.push(REGION_UNAVAILABLE_MESSAGE);
      lines.push(
        `Data availability: ${report.profile.dataAvailability
          .map((d) => `${d.field}, ${d.dataClass}`)
          .join("; ")}.`,
      );
      if (report.condition.findings.length > 0) {
        lines.push(
          `Condition observations (${report.condition.findings.length}):`,
        );
        for (const f of report.condition.findings) lines.push(`- ${f.finding}`);
      } else {
        lines.push(
          `No condition observations recorded. Unassessed categories: ${report.condition.unassessedCategories
            .map((c) => CONDITION_CATEGORY_LABELS[c])
            .join(", ")}.`,
        );
      }
      if (report.value) lines.push(report.value.conclusion);
      if (report.investment?.totalKnownCost !== undefined) {
        lines.push(
          `Total known development cost: ${report.investment.totalKnownCost} ${report.investment.currency}.`,
        );
      }
      lines.push(report.freshness.note);
      return lines.join("\n") + disclaimerLine;
    }

    case "renovate_or_rebuild": {
      const scenarios = report.development.scenarios?.scenarios ?? [];
      if (scenarios.length < 2) {
        return (
          "To compare renovation against rebuilding, both scenarios need construction estimates. " +
          "Run the deterministic FRELUX calculators for each proposed scope (or supply estimates with provenance), " +
          "then FRELUX will compare cost, duration, assumptions and known risks side by side. " +
          "Structural feasibility remains subject to qualified professional assessment." +
          disclaimerLine
        );
      }
      const rows = scenarios.map(
        (s) =>
          `- ${s.label}: ${s.cost.status === "estimated" ? `${s.cost.totalCost} ${s.cost.currency ?? ""} (${s.cost.source?.kind === "engine" ? "deterministic engine estimate" : "user-supplied estimate"})` : "no construction estimate available"}`,
      );
      return (
        `Scenario comparison (baseline: ${scenarios[0].label}):\n${rows.join("\n")}\n` +
        (report.development.scenarios?.note ?? "") +
        "\nStructural feasibility is subject to qualified professional assessment." +
        disclaimerLine
      );
    }

    case "missing_information": {
      const gaps = report.profile.dataAvailability.filter(
        (d) => d.dataClass === "unavailable",
      );
      const required = Object.entries(report.development.requiredInformation);
      const lines = gaps.map(
        (g) => `- ${g.field}: not recorded${g.note ? ` (${g.note})` : ""}`,
      );
      for (const [kind, reqs] of required) {
        if (reqs.length > 0)
          lines.push(
            `For the ${kind.replace("_", " ")} scenario: ${reqs.join(" ")}`,
          );
      }
      if (lines.length === 0)
        return (
          "No required information is currently missing for the recorded analyses." +
          disclaimerLine
        );
      return `Missing information:\n${lines.join("\n")}` + disclaimerLine;
    }

    case "development_cost": {
      const scenarios = report.development.scenarios?.scenarios ?? [];
      const priced = scenarios.filter((s) => s.cost.status === "estimated");
      if (priced.length === 0) {
        return (
          "No development cost estimate is available yet. " +
          (report.development.requiredInformation["extension"]?.join(" ") ??
            "Run the deterministic FRELUX calculators with the proposed dimensions, FRELUX does not invent costs.") +
          disclaimerLine
        );
      }
      return (
        `Development cost estimates:\n${priced
          .map(
            (s) => `- ${s.label}: ${s.cost.totalCost} ${s.cost.currency ?? ""}`,
          )
          .join("\n")}\nUnpriced scenarios: ${
          scenarios
            .filter((s) => s.cost.status !== "estimated")
            .map((s) => s.label)
            .join(", ") || "none"
        }. Known costs exclude contingency and unpriced items.` + disclaimerLine
      );
    }

    case "compare_properties": {
      return (
        "To compare two properties, request an analysis for each one, FRELUX will compare data availability, " +
        "recorded facts, comparable-based indicative estimates (where evidence exists) and risks side by side. " +
        "Fundamentally different properties (e.g. land vs completed building) are compared only with their limitations stated." +
        disclaimerLine
      );
    }

    case "biggest_risks": {
      if (report.risks.length === 0) {
        return (
          "No property risk flags were raised from the recorded data. This is not a claim that no risks exist, only that none are currently evidenced." +
          disclaimerLine
        );
      }
      const sorted = [...report.risks].sort(
        (a, b) => severityRank(b.severity) - severityRank(a.severity),
      );
      return (
        `Property risks (${sorted.length}), highest severity first:\n${sorted
          .map(
            (r) =>
              `- [${r.severity}] ${r.title}: ${r.reason} Affected: ${r.affectedArea}. Recommended: ${r.recommendedAction} (status: ${r.status})`,
          )
          .join("\n")}` + disclaimerLine
      );
    }

    case "show_assumptions": {
      const lines: string[] = [];
      if (report.value) {
        lines.push(`${VALUE_LABEL} assumptions:`);
        for (const a of report.value.assumptions) lines.push(`- ${a}`);
      }
      if (report.investment) {
        lines.push("Investment analysis assumptions:");
        for (const a of report.investment.assumptions) lines.push(`- ${a}`);
        if (report.investment.costView.contingency)
          lines.push(`- ${report.investment.costView.contingency.note}`);
        for (const n of report.investment.limitations)
          lines.push(`- Limitation: ${n}`);
      }
      if (lines.length === 0)
        return (
          "No estimates with assumptions are currently recorded for this property." +
          disclaimerLine
        );
      return lines.join("\n") + disclaimerLine;
    }
  }
}

function severityRank(s: string): number {
  if (s === "critical") return 3;
  if (s === "warning") return 2;
  return 1;
}

/** Compare two property reports (§16 "Compare these two properties"). */
export function comparePropertyReports(
  a: PropertyIntelligenceReport | null,
  b: PropertyIntelligenceReport | null,
): string | null {
  if (!a && !b) return null;
  if (!a || !b)
    return (
      "Two properties are required for a comparison, only one has recorded data." +
      disclaimerLine
    );

  const line = (
    label: string,
    ra: PropertyIntelligenceReport,
    rb: PropertyIntelligenceReport,
  ) => `- ${label}: ${summarise(ra)} vs ${summarise(rb)}`;

  const parts = [
    line("Location", a, b),
    line("Data completeness", a, b),
    line("Indicative value evidence", a, b),
    line("Condition observations", a, b),
    line("Known risks", a, b),
  ];
  return (
    "Comparison (recorded data only, no fabricated comparables):\n" +
    parts.join("\n") +
    "\nNote: properties of fundamentally different types are compared only with their limitations stated." +
    disclaimerLine
  );
}

function summarise(r: PropertyIntelligenceReport): string {
  const unavailable = r.profile.dataAvailability.filter(
    (d) => d.dataClass === "unavailable",
  ).length;
  const value =
    r.value?.status === "estimated"
      ? r.value.range?.median !== undefined
        ? `indicative ${r.value.range.median} ${r.value.range.currency}`
        : "insufficient data"
      : "no estimate";
  return `${r.location.country ?? "country unknown"} (missing fields: ${unavailable}; value: ${value}; risks: ${r.risks.length}; observations: ${r.condition.findings.length})`;
}
