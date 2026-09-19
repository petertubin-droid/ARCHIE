// =========================================================
// FRELUX ARCHIE — LIFE-SAFETY HARD GATE (SHARED, RUNTIME)
// supabase/functions/_shared/archie-ai/security/life-safety.ts
//
// THE LIFE-SAFETY HARD GATE (owner directive 2026-09-11).
//
// Any action, recommendation, automation, code change, device
// interaction, financial action, construction decision or
// external operation that could reasonably cause death,
// serious injury or life-threatening harm is a CRITICAL
// SAFETY EVENT. This module is the code-enforced first layer:
//
//   1. STOP or prevent the action where technically possible.
//   2. Never bypass safety controls to complete the task.
//   3. Escalate to the Owner or a qualified human authority.
//   4. Name the hazard, the uncertainty and the reason.
//   5. Preserve evidence and audit records (the call site
//      writes a security event on every stop).
//   6. Resume only after the required human authorization and
//      safety conditions are satisfied.
//
// Optimization, autonomy, speed, convenience, financial gain
// and task completion are NEVER more important than human
// life and physical safety. This gate is higher priority than
// ordinary autonomous execution and CANNOT be disabled by
// ARCHIE itself (the module is on the evolution PROTECTED_
// SURFACES list; the rule is also constitution article
// `life_safety`, immutable in the DB by trigger).
//
// HONEST BOUNDS (stated in every verdict):
//   * Detection is PATTERN-BASED. Absence of a detected
//     pattern is NOT proof that an operation is safe — the
//     uncertainty is carried in the verdict.
//   * STUDY of any safety-relevant topic is always free; the
//     gate only stops execution, endorsement and instruction
//     of credibly lethal operations.
//   * The gate has NO authorization override: owner or
//     registry claims cannot switch it off. Resumption is a
//     human protocol, not a flag — when the owner explicitly
//     states that a qualified human authority has authorized
//     the work and safety conditions are satisfied, the gate
//     downgrades to a recorded caution and names the hazard
//     in the response; it never silently releases.
//
// Enforcement points (defense in depth):
//   * archie-chat owner path — classifies the owner message
//     BEFORE the security verdict gate (this gate is higher
//     priority by the owner's directive).
//   * kernel VERIFY — classifies ARCHIE's own outgoing
//     response before presentation; a blocked response is
//     replaced with the safety stop, honestly recorded.
// =========================================================

// ---------------------------------------------------------
// 1. Hazard lexicons — credible life-threatening categories.
//    High-precision patterns only; construction vocabulary
//    in ordinary estimating talk must pass freely.
// ---------------------------------------------------------
export interface HazardPattern {
  rx: RegExp;
  hazard: string;
  /** Who must authorize/supervise — the escalation authority. */
  authority: string;
}

export const HAZARD_PATTERNS: ReadonlyArray<HazardPattern> = [
  // STRUCTURAL — removing or cutting load-bearing elements
  // (forward order: "remove the load-bearing wall").
  {
    rx: /(remove|cut (through|away|out)?|demolish|break|knock (out|down)|take (out|down)|take away).{0,40}(load[- ]bearing|column|pillar|beam|supporting (wall|column|structure)|structural (wall|column|beam)|cantilever|suspended slab)/i,
    hazard:
      "structural collapse risk — removing or cutting a load-bearing element without a licensed structural engineer's design",
    authority: "a licensed structural engineer",
  },
  // STRUCTURAL — reverse-order endorsement ("the load-bearing
  // wall can be removed" / "that column is fine to cut").
  {
    rx: /(load[- ]bearing (wall|column|structure)|supporting (wall|column|structure)|structural (wall|column|beam)|that (column|pillar|beam)|the column|the beam).{0,40}(can|could|is|are|it'?s|will be).{0,25}(be )?(safely |carefully )?(removed|cut|taken (out|down)|knocked (out|down)|demolished)/i,
    hazard:
      "structural collapse risk — removing or cutting a load-bearing element without a licensed structural engineer's design",
    authority: "a licensed structural engineer",
  },
  // HAZMAT — reverse-order endorsement ("the asbestos can be
  // removed ourselves").
  {
    rx: /(asbestos|silica|lead[- ]based paint).{0,50}(can|could|we|is it).{0,25}(be )?(safely )?(removed|broken|sanded|stripped|scraped|cut|drilled)( ourselves| ourselves)?/i,
    hazard:
      "hazardous-material exposure risk — unlicensed asbestos/silica/lead work",
    authority: "a licensed hazardous-materials remover",
  },
  // STRUCTURAL — de-propping / stripping formwork before cure.
  {
    rx: /(remove|strip|take (out|off)).{0,30}(formwork|shuttering|props).{0,50}(before|prior to|without|early|uncured|still (wet|green))/i,
    hazard:
      "structural collapse risk — stripping formwork/props before the concrete has cured to design strength",
    authority: "a licensed structural engineer",
  },
  // STRUCTURAL — working in unshored/unsloped excavation.
  {
    rx: /((enter|work|work in|dig|climb (down )?into).{0,40}(trench|excavat\w+).{0,50}(without|no).{0,25}(shoring|shores|battering|sloping|supports?)|(trench|excavat\w+).{0,60}(without|no).{0,25}(shoring|battering|sloping))/i,
    hazard: "trench collapse risk — entering an unshored, unsloped excavation",
    authority: "a competent excavation supervisor",
  },
  // ELECTRICAL — live work.
  {
    rx: /(work (on|at)|touch|repair|fix|swap|wire|connect|disconnect|solder).{0,40}(live|energised|energized|mains|distribution board|breaker panel|busbar|overhead line)|while (it is |it's )?(still )?(live|on|energised|energized)|bypass (the )?(rcd|earth|ground|breaker|circuit protection)/i,
    hazard: "electrocution risk — live electrical work",
    authority: "a licensed electrician with lockout/isolation confirmed",
  },
  // GAS — unlicensed gas line work.
  {
    rx: /(fix|repair|replace|cut|cap|extend|solder|weld|braze|tap).{0,40}gas (pipe|line|regulator|hose|cylinder|bottle)|weld.{0,40}near (the )?(gas|petrol|fuel)|ignit\w+.{0,40}(gas|leak)/i,
    hazard: "fire/explosion risk — working on gas installations or near a leak",
    authority: "a licensed gas engineer",
  },
  // FIRE SYSTEMS — disabling protection or blocking egress.
  {
    rx: /(disable|remove|block|take (out|down)|tape (over|up)|cover).{0,40}(smoke (alarm|detector)|fire (alarm|exit|door|extinguisher|sprinkler|suppression)|emergency (exit|lighting))|block (the )?(fire exit|emergency exit)/i,
    hazard: "fire casualty risk — disabling fire protection or blocking egress",
    authority: "a fire safety officer",
  },
  // HEIGHT — unprotected work at height.
  {
    rx: /((work|walk|climb|stand).{0,40}(on the|on a|the|at) ?(roof|ledge|parapet|edge|steel|beam|scaffold).{0,60}(without|no|don'?t need).{0,30}(harness|guard[- ]?rail|edge protection|safety line|fall arrest|scaffold|platform)|no harness (needed|required))/i,
    hazard:
      "fall-from-height risk — working above ground without certified fall protection",
    authority: "a competent height-work supervisor",
  },
  // SCAFFOLD — erection/use outside competent design.
  {
    rx: /(erect|build|modify|extend).{0,40}scaffold.{0,50}(without|no).{0,35}(design|engineer|competent|scaffold erector|inspection)|(scaffold|platform).{0,40}(overload|exceed|more than).{0,25}(the )?(safe|rated|maximum)/i,
    hazard:
      "scaffold collapse risk — erection or loading outside a competent person's design",
    authority: "a certified scaffold erector/inspector",
  },
  // HAZMAT — unlicensed hazardous material removal.
  {
    rx: /(break|remove|strip|sand|cut|drill|demolish|scrape).{0,40}(asbestos|silica|lead[- ]based paint|fibreglass insulation)|remove (the |that )?asbestos (myself|ourselves)/i,
    hazard:
      "hazardous-material exposure risk — unlicensed asbestos/silica/lead work",
    authority: "a licensed hazardous-materials remover",
  },
];

// Execution/endorsement markers — the request wants the
// operation DONE (by ARCHIE, by the owner, by workers), not
// just studied.
const EXECUTION_MARKERS =
  /(for me|myself|do it|go ahead|can i (just |safely )?|is it (safe|ok|fine) to|you can|just (remove|cut|wire|connect|cap|strip|disable|climb|enter|work)|on site|we('ll| will)|start (tomorrow|now|today))/i;

// Study markers — knowledge work stays free.
const STUDY_MARKERS =
  /(explain|how does|what is|teach|learn|study|concept|theory|guide|walk me through|regulation|code say|standard say|why is|what does the (code|standard))/i;

// Release protocol (owner-stated human authorization + safety
// conditions). NOT an override the system can pass — it must
// appear explicitly in the owner's own words.
const HUMAN_AUTHORIZATION_MARKERS =
  /((structural )?engineer|electrician|gas (safe|engineer)|licensed|qualified|competent (person|supervisor)|fire (safety )?officer|scaffold (erector|inspector)|safety officer|architect).{0,60}(has |have |already |will be )?(approved|signed (off|up)|authorized|authorised|certified|inspected|supervis\w+|present|on site)/i;

export interface LifeSafetyVerdict {
  /** True = the operation must NOT proceed or be endorsed. */
  blocked: boolean;
  /** True = hazard detected but explicit human authorization
   *  stated by the owner downgrades the stop to a recorded
   *  caution; the hazard is still named. Never silent. */
  caution: boolean;
  /** "STOP" | "CAUTION" | "STUDY" | "PASS" */
  action: "STOP" | "CAUTION" | "STUDY" | "PASS";
  /** The matched hazard description, if any. */
  hazard?: string;
  /** The qualified authority the event escalates to. */
  escalationAuthority?: string;
  /** Honest statement of the gate's detection limits. */
  uncertainty: string;
  /** Full machine-citable reason (hazard + why + protocol). */
  reason: string;
}

const UNCERTAINTY =
  "Detection is pattern-based; a hazard that matches no known pattern is not certified safe — final judgment on life safety always belongs to a qualified human.";

/** Human-readable resumption protocol (the owner's path
 *  around a STOP is human, not a flag). */
export const LIFE_SAFETY_RESUME_PROTOCOL =
  "To resume: confirm that a qualified human authority (e.g. a licensed structural engineer, electrician or the relevant officer named above) has reviewed and authorized the work, state the safety conditions that are in place, and ask again with that confirmation.";

/**
 * Classify text (an owner request OR one of ARCHIE's own
 * responses) under the life-safety hard gate. Pure function —
 * evidence preservation happens at the call site (security
 * event write).
 */
export function classifyLifeSafety(text: string): LifeSafetyVerdict {
  const t = String(text ?? "");

  for (const p of HAZARD_PATTERNS) {
    if (!p.rx.test(t)) continue;

    // Explicit owner-stated human authorization + supervision:
    // recorded caution, never a silent release.
    if (HUMAN_AUTHORIZATION_MARKERS.test(t)) {
      return {
        blocked: false,
        caution: true,
        action: "CAUTION",
        hazard: p.hazard,
        escalationAuthority: p.authority,
        uncertainty: UNCERTAINTY,
        reason:
          `Life-safety caution: ${p.hazard}. The owner has stated that ${p.authority} is involved; ` +
          `proceed only within that authorization and the stated safety conditions. ${UNCERTAINTY}`,
      };
    }

    // Study framing without execution markers = knowledge work.
    // Study + execution markers ("how do I remove asbestos
    // myself") is an instruction request — still stopped.
    if (STUDY_MARKERS.test(t) && !EXECUTION_MARKERS.test(t)) {
      return {
        blocked: false,
        caution: false,
        action: "STUDY",
        hazard: p.hazard,
        escalationAuthority: p.authority,
        uncertainty: UNCERTAINTY,
        reason:
          `Life-safety-relevant knowledge request (${p.hazard}) — study is always free; ` +
          `the gate stops only execution, endorsement or instruction of the operation. ${UNCERTAINTY}`,
      };
    }

    // Execution / endorsement / instruction: CRITICAL SAFETY
    // EVENT — STOP.
    return {
      blocked: true,
      caution: false,
      action: "STOP",
      hazard: p.hazard,
      escalationAuthority: p.authority,
      uncertainty: UNCERTAINTY,
      reason:
        `CRITICAL SAFETY EVENT — STOPPED: ${p.hazard}. ` +
        `ARCHIE will not perform, endorse, instruct or automate this. ` +
        `It must be reviewed, authorized and supervised by ${p.authority}. ` +
        `${LIFE_SAFETY_RESUME_PROTOCOL} ${UNCERTAINTY}`,
    };
  }

  return {
    blocked: false,
    caution: false,
    action: "PASS",
    uncertainty: UNCERTAINTY,
    reason: "No credibly life-threatening operation detected. " + UNCERTAINTY,
  };
}

/** Compose the owner-facing safety-stop message from a verdict. */
export function lifeSafetyStopMessage(v: LifeSafetyVerdict): string {
  return (
    `⛔ STOPPED BY THE LIFE-SAFETY GATE.\n\n${v.reason}\n\n` +
    `This stop, the hazard and this exchange are recorded in the security audit log. ` +
    `Nothing about this task is more important than human life and physical safety.`
  );
}
