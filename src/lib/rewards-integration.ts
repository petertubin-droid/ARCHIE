/**
 * Rewards Integration Layer
 *
 * Connects existing achievement tracking (localStorage-based) to the
 * server-side FRELUX Credits system. Pages call these functions which:
 * 1. Call the existing localStorage achievement tracking (unchanged)
 * 2. Fire server-side credit awards via edge functions (idempotent, secure)
 * 3. Record activity for streaks and mission progress
 *
 * This module does NOT modify existing achievement behavior.
 * All credit operations are fire-and-forget with idempotency protection.
 */

import { getSupabase } from "@/lib/supabase-lazy";
import { awardCredits, recordActivity, REWARD_EVENTS } from "@/lib/credits";

type CalcType =
  | "paint"
  | "cost"
  | "screeding"
  | "tile"
  | "pop"
  | "finish"
  | "ai"
  | "painting"
  | "tyrolene";

// Track which calculator types a user has used (for "3 different calculators" reward)
const CALC_TYPES_KEY = "frelux_calc_types_used";
const CALC_COUNT_KEY = "frelux_total_calc_count";
const _SESSION_TOKEN_KEY = "frelux_session_token";

function getCalcTypesUsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CALC_TYPES_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveCalcTypesUsed(types: string[]) {
  try {
    localStorage.setItem(CALC_TYPES_KEY, JSON.stringify(types));
  } catch {
    /* ignore */
  }
}
function getCalcCount(): number {
  return parseInt(localStorage.getItem(CALC_COUNT_KEY) ?? "0") || 0;
}
function saveCalcCount(n: number) {
  try {
    localStorage.setItem(CALC_COUNT_KEY, String(n));
  } catch {
    /* ignore */
  }
}

async function getSessionToken(): Promise<string | null> {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function getUserId(): Promise<string | null> {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Track a calculator usage with credit rewards.
 * Call this INSTEAD OF (or alongside) the existing trackCalculation.
 */
export async function trackCalculationWithRewards(
  type: CalcType,
  calculatorName?: string,
): Promise<void> {
  // 1. Record activity for streak + mission progress
  const token = await getSessionToken();
  if (!token) return; // not logged in, just skip credits

  // 2. Track calculator type diversity
  const typesUsed = getCalcTypesUsed();
  if (!typesUsed.includes(type)) {
    typesUsed.push(type);
    saveCalcTypesUsed(typesUsed);
  }

  const calcCount = getCalcCount() + 1;
  saveCalcCount(calcCount);

  // 3. Fire credit events (all idempotent via edge function)
  const today = new Date().toISOString().split("T")[0];

  // First calculator → +10
  if (calcCount === 1) {
    await awardCredits(token, REWARD_EVENTS.first_calc, `first_calc_${today}`, {
      type,
    });
  }

  // 3 different calculators → +20
  if (typesUsed.length === 3) {
    await awardCredits(
      token,
      REWARD_EVENTS.three_different_calcs,
      `three_calcs_${today}`,
      { types: typesUsed },
    );
  }

  // 5 estimates → +50
  if (calcCount === 5) {
    await awardCredits(
      token,
      REWARD_EVENTS.five_estimates,
      `five_estimates_${today}`,
      {},
    );
  }

  // Build-to-Roof estimate → +30 (call separately from the B2R page)
  // AI Photo Estimator → +20 (call separately from the AI page)

  // 4. Record activity for streak
  await recordActivity(token, "calculator_complete", "estimate_complete", {
    type,
    name: calculatorName,
  });

  // 5. Check achievement-linked credits
  // FRELUX Builder: 10 estimates → +100
  if (calcCount === 10) {
    await awardCredits(
      token,
      REWARD_EVENTS.ach_builder_10,
      `ach_builder_10_${today}`,
      {},
    );
  }
  // Estimator Pro: 25 estimates → +250
  if (calcCount === 25) {
    await awardCredits(
      token,
      REWARD_EVENTS.ach_estimator_25,
      `ach_estimator_25_${today}`,
      {},
    );
  }
  // FRELUX Master: 5 categories → +500
  if (typesUsed.length === 5) {
    await awardCredits(
      token,
      REWARD_EVENTS.ach_master_5,
      `ach_master_5_${today}`,
      {},
    );
  }
}

/** Track a project save with credit rewards */
export async function trackProjectSaveWithRewards(): Promise<void> {
  const token = await getSessionToken();
  if (!token) return;

  const today = new Date().toISOString().split("T")[0];

  // Save estimate → +10 (one per day to prevent farming)
  await awardCredits(
    token,
    REWARD_EVENTS.save_estimate,
    `save_estimate_${today}`,
    {},
  );

  // Record activity
  await recordActivity(token, "project_save", "project_save", {});
}

/** Track Build-to-Roof estimate completion → +30 */
export async function trackBuildToRoofRewards(): Promise<void> {
  const token = await getSessionToken();
  if (!token) return;

  const today = new Date().toISOString().split("T")[0];

  await awardCredits(
    token,
    REWARD_EVENTS.build_to_roof,
    `build_to_roof_${today}`,
    {},
  );
  await recordActivity(token, "build_to_roof", "estimate_complete", {});
}

/** Track AI Photo Estimator usage → +20 */
export async function trackAiPhotoEstimatorRewards(): Promise<void> {
  const token = await getSessionToken();
  if (!token) return;

  const today = new Date().toISOString().split("T")[0];

  await awardCredits(
    token,
    REWARD_EVENTS.ai_photo_estimator,
    `ai_photo_${today}`,
    {},
  );
  await recordActivity(token, "ai_photo_estimator", "estimate_complete", {});
}

/** Track a referral (when a referred user registers) → +100 */
export async function trackReferralRewards(
  referredUserId: string,
): Promise<void> {
  const token = await getSessionToken();
  if (!token) return;

  const userId = await getUserId();
  if (!userId) return;

  await awardCredits(
    token,
    REWARD_EVENTS.referral,
    `referral_${referredUserId}`,
    { referredUserId },
  );
}

/** Track return visits (3 different days) → +15 */
export async function trackReturnVisitRewards(): Promise<void> {
  const token = await getSessionToken();
  if (!token) return;

  const VISIT_DAYS_KEY = "frelux_visit_days";
  let visitDays: string[] = [];
  try {
    visitDays = JSON.parse(localStorage.getItem(VISIT_DAYS_KEY) ?? "[]");
  } catch {
    /* ignore */
  }

  const today = new Date().toISOString().split("T")[0];
  if (!visitDays.includes(today)) {
    visitDays.push(today);
    // Keep only last 30 days
    visitDays = visitDays.slice(-30);
    try {
      localStorage.setItem(VISIT_DAYS_KEY, JSON.stringify(visitDays));
    } catch {
      /* ignore */
    }
  }

  // 3 different days → +15
  if (visitDays.length === 3) {
    await awardCredits(token, REWARD_EVENTS.return_3_days, `return_3_days`, {
      days: visitDays,
    });
  }

  // Record activity for streak
  await recordActivity(token, "site_visit", undefined, {});
}
