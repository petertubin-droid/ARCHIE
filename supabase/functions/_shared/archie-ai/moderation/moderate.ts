// =========================================================
// ARCHIE MODERATION — shared native moderation engine
// =========================================================
// The single moderation authority for FRELUX marketplace
// surfaces (Pro Connect + Worker Channel). Fully native and
// deterministic: ARCHIE's security verdict gate + NLU + a
// Nigerian-marketplace rule set. NO external AI provider —
// no OpenAI, no quota, no key. Every deployment runs the
// same analysis; results are explainable (rule + score).
//
// Consumers keep their own:
//   - DB-configured banned-pattern fast paths,
//   - severity thresholds (flag/remove),
//   - persistence side effects (flags, removals, logs).
// This module ONLY decides {action, score, categories, reason}.
// =========================================================

import { classifySecurityMessage } from "../security/verdict.ts";

export interface ModerationResult {
  action: "allow" | "flag" | "remove";
  score: number;
  categories: string[];
  reason: string;
}

// ---- rule set (Nigerian marketplace context) ------------
// Each rule: pattern, category, weight (0-1), reason label.
// Weights are evidence, not verdicts — the sum is capped and
// mapped against the caller's thresholds.
interface ModerationRule {
  rx: RegExp;
  category: string;
  weight: number;
  label: string;
}

const RULES: ModerationRule[] = [
  // -- off-platform transaction steering (marketplace killer) --
  {
    rx: /(whatsapp|wa|call|text)\s*(me|us)?\s*(only|directly|outside|off)\b/i,
    category: "off_platform",
    weight: 0.7,
    label: "steers contact off-platform",
  },
  {
    rx: /\b(avoid|skip|bypass|no)\s+(the\s+)?(platform|site|app)\s+(fee|charge|commission|payment)/i,
    category: "off_platform",
    weight: 0.9,
    label: "circumvents platform payment/fees",
  },
  {
    rx: /\b(pay|send|transfer|deposit)\s+(money|payment|the\s+[\d,]+|deposit)\s+(to|into|via)\s+(my|his|her|our)\s+(account|acct|bank)/i,
    category: "off_platform",
    weight: 0.85,
    label: "directs payment to a private account",
  },

  // -- advance-fee / 419 patterns (Nigerian context) --
  {
    rx: /\b(processing fee|clearing fee|activation fee|release fee|fee to (claim|receive|unlock))\b/i,
    category: "scam",
    weight: 0.85,
    label: "advance-fee demand",
  },
  {
    rx: /\b(you (have )?(won|been selected|qualified for)|congratulations,? (you|your)\b).*(prize|grant|inherit|lottery|giveaway|reward)/i,
    category: "scam",
    weight: 0.8,
    label: "prize/inheritance bait",
  },
  {
    rx: /\b(double|2x|make)\s+(your|u r|ur)?\s*(money| ₦|naira|\$|usd)\b|\b(forex|crypto|bitcoin|binary)\s+(signal|trade|investment|profit)\b|\b(roi|returns?)\s+(of|guaranteed)\b/i,
    category: "scam",
    weight: 0.85,
    label: "investment/guaranteed-return scheme",
  },
  {
    rx: /\b(bank (details|login|otp|pin|password|bvn|cvv))\b|\b(send\s+(your\s+)?(otp|pin|password|bvn))\b/i,
    category: "scam",
    weight: 0.95,
    label: "credential/financial-detail harvesting",
  },

  // -- fake job offers / recruitment fraud --
  {
    rx: /\b(job|employment)\s+(offer|vacancy)\b.*\b(send|pay|registration|fee)\b/i,
    category: "scam",
    weight: 0.8,
    label: "job offer requiring payment",
  },
  {
    rx: /\b(work from home)\b.*\b(earn|make)\s+(₦|ngn)?\s?\d{4,}\b/i,
    category: "scam",
    weight: 0.6,
    label: "work-from-home earnings bait",
  },

  // -- spam --
  {
    rx: /\b(click (this |the )?link|visit (our|my) (page|site|channel))\b/i,
    category: "spam",
    weight: 0.5,
    label: "link-bait solicitation",
  },
  {
    rx: /(https?:\/\/\S+){3,}/i,
    category: "spam",
    weight: 0.6,
    label: "link flooding",
  },
  {
    rx: /\b(follower|likes|subscribers|views)\s+(for sale|cheap|buy)\b/i,
    category: "spam",
    weight: 0.6,
    label: "engagement-selling spam",
  },

  // -- harassment / hate / sexual --
  {
    rx: /\b(you are|ur|you're)\s+(an?\s+)?(idiot|fool|stupid|useless|bastard|mumu|olodo|oloshi)\b/i,
    category: "harassment",
    weight: 0.6,
    label: "abusive personal attack",
  },
  {
    rx: /\b(i will|am going to|go and)\s+(beat|kill|deal with|hunt|find)\s+(you|ur family)\b/i,
    category: "harassment",
    weight: 0.9,
    label: "threat of violence",
  },
  {
    rx: /\b(tribe|ethnic|religious)\s+(insult|slur)\b|\b(yoruba|igbo|hausa|fulani)\b\s+(people\s+are|are)\s+(all\s+)?(stupid|fools?|dirty|criminals?)/i,
    category: "hate_speech",
    weight: 0.9,
    label: "ethnic/religious group attack",
  },
  {
    rx: /\b(send|trade|want)\b.*\b(nudes?|naked pics?|sex(ual)? (photos|pics|chat|video))\b|\b(escort|hook ?up|sugar mummy|sugar daddy)\b/i,
    category: "offensive",
    weight: 0.85,
    label: "sexual solicitation/content",
  },

  // -- attempts to impersonate platform/staff --
  {
    rx: /\b(i am|i'm|this is)\s+(the\s+)?(admin|administrator|owner|staff|support team|official)\s+(of|from)\s+(frelux|the platform|this site)\b/i,
    category: "scam",
    weight: 0.85,
    label: "platform impersonation",
  },
];

// Strong SAFE signals — normal professional negotiation, scheduling,
// project discussion. These reduce the score toward allow, because
// commerce chat must not be over-blocked.
const SAFE_RULES: Array<{ rx: RegExp; relief: number }> = [
  {
    rx: /\b(quote|quotation|estimate|invoice|budget|price|pricing|negotiate|discount)\b/i,
    relief: 0.2,
  },
  {
    rx: /\b(schedule|appointment|monday|tuesday|wednesday|thursday|friday|saturday|site visit|inspection)\b/i,
    relief: 0.2,
  },
  {
    rx: /\b(paint|painting|screed(ing|ing)|pop|tile|plaster|coats?|buckets?|rooms?|sqm|m2|finish)\b/i,
    relief: 0.2,
  },
];

function clampScore(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// =========================================================
// moderateWithArchie — the shared native verdict
// =========================================================
export function moderateWithArchie(
  content: string,
  opts: { surface?: string } = {},
): ModerationResult {
  const text = String(content ?? "");
  const surface = opts.surface ?? "marketplace";

  const hits: ModerationRule[] = [];
  const categories = new Set<string>();

  // 1. ARCHIE SECURITY VERDICT GATE — the same gate that
  //    guards ARCHIE's own operations. Forbidden-class content
  //    (weapons, malware, fraud instructions) is an immediate
  //    maximum-severity moderation hit.
  const verdict = classifySecurityMessage(text);
  if (!verdict.allowed || verdict.hardRefused) {
    return {
      action: "remove",
      score: 1,
      categories: ["security", verdict.label].filter((c): c is string =>
        Boolean(c),
      ),
      reason: `ARCHIE security gate: ${verdict.reason}`,
    };
  }

  // 2. Deterministic marketplace rules.
  for (const rule of RULES) {
    if (rule.rx.test(text)) hits.push(rule);
  }

  if (hits.length === 0) {
    // No violation evidence. NLU-intent check for mixed signals
    // that pattern rules missed (long suspicious
    // credential-plus-urgency combos score a low-confidence flag).
    const urgency =
      /\b(urgent|immediately|right now|now now|before (anyone|others) (see|hear))\b/i;
    const credential =
      /\b(otp|pin|password|bvn|card details?|account details?)\b/i;
    if (urgency.test(text) && credential.test(text)) {
      return {
        action: "flag",
        score: 0.65,
        categories: ["scam"],
        reason:
          "ARCHIE NLU: urgency + credential pressure pattern — flagged for review",
      };
    }
    return {
      action: "allow",
      score: 0,
      categories: ["safe"],
      reason: "No violations detected (ARCHIE native analysis)",
    };
  }

  // Accumulate evidence: strongest hit dominates, repeats add.
  const byCategory = new Map<string, number>();
  for (const h of hits) {
    categories.add(h.category);
    byCategory.set(
      h.category,
      Math.max(byCategory.get(h.category) ?? 0, h.weight),
    );
  }
  let score = 0;
  for (const w of byCategory.values()) score += w;
  score = clampScore(score);

  // Relief for normal-business signals (quote, schedule, project
  // vocabulary) — commerce chat is SAFE; only subtract once.
  const relief = SAFE_RULES.reduce(
    (acc, s) => (s.rx.test(text) ? Math.max(acc, s.relief) : acc),
    0,
  );
  if (
    relief > 0 &&
    categories.size === 1 &&
    !categories.has("hate_speech") &&
    !categories.has("harassment")
  ) {
    // relief only applies when the ONLY evidence is a single
    // low-weight pattern (e.g. one soft "whatsapp me") in an
    // otherwise business message.
    const maxW = Math.max(...byCategory.values());
    if (maxW <= 0.7) score = clampScore(score - relief);
  }

  const labels = hits
    .map((h) => h.label)
    .slice(0, 4)
    .join("; ");
  const reason = `ARCHIE native moderation (${surface}): ${labels || "policy violation"}`;

  // Thresholds are applied by the caller (config-driven), but we
  // suggest an action from the shared default thresholds so the
  // module is self-contained for callers that don't override.
  const action: ModerationResult["action"] =
    score >= 0.85 ? "remove" : score >= 0.6 ? "flag" : "allow";

  return {
    action,
    score,
    categories: [...categories],
    reason,
  };
}
