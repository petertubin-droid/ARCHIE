// =========================================================
// FRELUX PHASE 8 P4, CONSENT-DRIVEN MOBILE INTELLIGENCE
//
// ARCHIE may learn from a category of device data ONLY when
// the user explicitly granted THAT category on THAT device.
// There is no whole-device grant: every category is separate,
// every grant shows a clear explanation, everything is
// revocable at any time.
//
// Hard rules (enforced, not conventions):
//   * Forbidden categories (covert mic/camera, messages,
//     calls, continuous tracking, screen monitoring, all
//     device files) do not exist as grantable capabilities.
//     Requesting one is refused AND flagged as a security
//     signal.
//   * No silent scanning: ingestion must name the exact
//     category and the explicitly selected items.
//   * A consent grant is per (device, category): one device's
//     grant never covers another device.
// =========================================================

import type {
  DeviceDataConsent,
  MobileDataCategory,
  TrustedDevice,
} from "./p4-types";
import { FORBIDDEN_DEVICE_CATEGORIES } from "./p4-types";
import { mayArchieInteract } from "./trusted-devices";

export const MOBILE_DATA_CATEGORIES: Readonly<
  Record<MobileDataCategory, { label: string; explanation: string }>
> = {
  PHOTOGRAPHS: {
    label: "Photographs",
    explanation:
      "ARCHIE can analyze photos you select (e.g. wall conditions, material samples) to extract measurements and observations.",
  },
  VIDEOS: {
    label: "Videos",
    explanation:
      "ARCHIE can analyze videos you select to understand work demonstrations and site conditions.",
  },
  PDF_DOCUMENTS: {
    label: "PDFs and documents",
    explanation:
      "ARCHIE can read PDFs you select (e.g. bills of quantities, specifications, drawings) and extract structured facts.",
  },
  VOICE_RECORDINGS: {
    label: "Voice recordings and notes",
    explanation:
      "ARCHIE can transcribe and analyze voice notes you select, such as site observations you recorded yourself.",
  },
  SELECTED_FILES: {
    label: "Selected files",
    explanation:
      "ARCHIE can process individual files you pick. Nothing is scanned without you choosing it.",
  },
  DRAWINGS: {
    label: "Drawings",
    explanation:
      "ARCHIE can analyze drawings and plans you select (e.g. plan-vision quantity takeoff).",
  },
  SCREENSHOTS: {
    label: "Screenshots",
    explanation:
      "ARCHIE can analyze screenshots you select, e.g. supplier price lists.",
  },
  MEASUREMENTS: {
    label: "Measurements",
    explanation:
      "ARCHIE can learn from measurements you enter or share, such as room dimensions from your projects.",
  },
  PROJECT_INFORMATION: {
    label: "Project information",
    explanation:
      "ARCHIE can use information from your selected FRELUX projects to reason about your work.",
  },
  CONSTRUCTION_OBSERVATIONS: {
    label: "Construction observations",
    explanation:
      "ARCHIE can learn from construction observations you record and share.",
  },
  MATERIAL_INFORMATION: {
    label: "Material information",
    explanation:
      "ARCHIE can learn material data you share, such as brands, prices and properties you observed.",
  },
  PROJECT_OUTCOMES: {
    label: "Project outcomes",
    explanation:
      "ARCHIE can learn from your completed projects' actual outcomes to improve its estimates.",
  },
  USER_CORRECTIONS: {
    label: "Your corrections",
    explanation:
      "ARCHIE can learn from corrections you make to its estimates and answers.",
  },
  AUTHORIZED_CODE_RESOURCES: {
    label: "Authorized code and resources",
    explanation:
      "ARCHIE can learn from code and technical resources you are legally authorized to share.",
  },
  OTHER_SELECTED_INFORMATION: {
    label: "Other selected information",
    explanation:
      "ARCHIE can process other information you explicitly select for it, case by case.",
  },
};

export const MOBILE_DATA_CATEGORY_KEYS = Object.keys(
  MOBILE_DATA_CATEGORIES,
) as MobileDataCategory[];

export function isGrantableCategory(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(MOBILE_DATA_CATEGORIES, category);
}

/** Grant a category on a device. The explanation shown to the
 *  user is REQUIRED and is stored with the consent record :
 *  an unexplained grant is invalid. */
export function grantDataConsent(
  device: TrustedDevice,
  category: MobileDataCategory,
  now?: string,
): { ok: boolean; error?: string; consent?: DeviceDataConsent } {
  if (FORBIDDEN_DEVICE_CATEGORIES.has(category)) {
    return {
      ok: false,
      error: `"${category}" is not a grantable capability, this request was refused and flagged`,
    };
  }
  if (!isGrantableCategory(category)) {
    return { ok: false, error: `Unknown data category "${category}"` };
  }
  if (!mayArchieInteract(device)) {
    return {
      ok: false,
      error: "Only an active, trusted, explicitly activated device can hold data consents",
    };
  }
  const t = now ?? new Date().toISOString();
  return {
    ok: true,
    consent: {
      device_id: device.id,
      user_id: device.user_id,
      category,
      granted: true,
      explanation_shown: MOBILE_DATA_CATEGORIES[category].explanation,
      granted_at: t,
      revoked_at: null,
    },
  };
}

/** Revoke a category consent at any time. Immediate effect. */
export function revokeDataConsent(
  device: TrustedDevice,
  category: MobileDataCategory,
  now?: string,
): DeviceDataConsent {
  return {
    device_id: device.id,
    user_id: device.user_id,
    category,
    granted: false,
    explanation_shown: null,
    granted_at: null,
    revoked_at: now ?? new Date().toISOString(),
  };
}

/** THE ingestion gate: category consent on THIS device, this
 *  user, not revoked. Cross-device consent never carries. */
export function mayIngestFrom(
  device: TrustedDevice,
  consents: DeviceDataConsent[],
  category: MobileDataCategory,
): { ok: boolean; error?: string } {
  if (FORBIDDEN_DEVICE_CATEGORIES.has(category)) {
    return {
      ok: false,
      error: `Category "${category}" can never be ingested, refusal recorded`,
    };
  }
  if (!mayArchieInteract(device)) {
    return { ok: false, error: "Device is not authorized for ARCHIE interaction" };
  }
  const consent = consents.find(
    (c) => c.device_id === device.id && c.category === category && c.granted,
  );
  if (!consent) {
    return {
      ok: false,
      error: `No granted consent for "${category}" on this device`,
    };
  }
  return { ok: true };
}

/** Anti-silent-scan guard: ingestion requests must name
 *  explicit categories with grants. A request for "everything",
 *  an unknown category, or a forbidden category is refused and
 *  flagged as a security signal. */
export function assertNoSilentScan(requested: string[]): {
  ok: boolean;
  refused: string[];
  flags: string[];
} {
  const refused: string[] = [];
  const flags: string[] = [];
  for (const category of requested) {
    if (FORBIDDEN_DEVICE_CATEGORIES.has(category)) {
      refused.push(category);
      flags.push(`FORBIDDEN_CATEGORY_REQUESTED:${category}`);
      continue;
    }
    if (!isGrantableCategory(category)) {
      refused.push(category);
      flags.push(`UNKNOWN_CATEGORY_REQUESTED:${category}`);
    }
  }
  return { ok: refused.length === 0, refused, flags };
}
