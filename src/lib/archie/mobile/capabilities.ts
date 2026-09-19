// =========================================================
// FRELUX PHASE 8b, ARCHIE MOBILE CAPABILITY REGISTRY
//
// Free-tier mobile capabilities: every one requires an
// EXPLICIT user consent before ARCHIE may touch the device
// feature. Support is detected via the platform's normal
// APIs, Android's permission/security model is complemented,
// never bypassed. No covert or unrestricted device access
// exists anywhere in this layer.
//
// Basic Free-tier capabilities NEVER require paid AI/cloud
// services. Paid services are separate (paid-services.ts):
// modular, optional and disabled by default.
// =========================================================

import type { ArchieMobileCapability, ArchieConsent } from "./types";

export interface MobileCapabilitySpec {
  capability: ArchieMobileCapability;
  label: string;
  description: string;
  /** Browser/platform API that must exist for the capability. */
  supported: () => boolean;
  /** How Android/browser permission is requested (normal model). */
  permissionModel: "BROWSER_PROMPT" | "APP_CONSENT_ONLY" | "NONE";
  /** Whether the platform API itself must also grant access. */
  requiresPlatformPermission: boolean;
}

const has = (obj: string) =>
  typeof window !== "undefined" &&
  ((window as unknown as Record<string, unknown>)[obj] !== undefined ||
    (obj.includes(".") &&
      obj
        .split(".")
        .reduce<unknown>(
          (o: unknown, k: string) => (o as Record<string, unknown>)?.[k],
          window,
        ) !== undefined));

export const MOBILE_CAPABILITIES: Readonly<
  Record<ArchieMobileCapability, MobileCapabilitySpec>
> = {
  VOICE_INPUT: {
    capability: "VOICE_INPUT",
    label: "Voice input",
    description:
      "Speak commands and questions to ARCHIE (Android speech recognition where supported).",
    supported: () => has("SpeechRecognition") || has("webkitSpeechRecognition"),
    permissionModel: "BROWSER_PROMPT",
    requiresPlatformPermission: true,
  },
  VOICE_OUTPUT: {
    capability: "VOICE_OUTPUT",
    label: "ARCHIE voice",
    description:
      "ARCHIE speaks its responses aloud (on-device speech, output only). Nothing is recorded.",
    supported: () => has("speechSynthesis"),
    permissionModel: "APP_CONSENT_ONLY",
    requiresPlatformPermission: false,
  },
  CAMERA: {
    capability: "CAMERA",
    label: "Camera",
    description:
      "Manually invoked camera, you press the button, ARCHIE never opens it on its own.",
    supported: () =>
      has("mediaDevices.getUserMedia") || !!documentPictureCaptureSupport(),
    permissionModel: "BROWSER_PROMPT",
    requiresPlatformPermission: true,
  },
  PHOTOS: {
    capability: "PHOTOS",
    label: "Photos & images",
    description:
      "Pick existing photos from your gallery for ARCHIE to work with.",
    supported: () => typeof window !== "undefined",
    permissionModel: "APP_CONSENT_ONLY",
    requiresPlatformPermission: false,
  },
  FILES: {
    capability: "FILES",
    label: "Files & documents",
    description: "Pick documents (PDF, sheets, drawings) from your device.",
    supported: () => typeof window !== "undefined",
    permissionModel: "APP_CONSENT_ONLY",
    requiresPlatformPermission: false,
  },
  LOCATION: {
    capability: "LOCATION",
    label: "Location",
    description:
      "Optional location for regional intelligence. You choose each time.",
    supported: () => has("geolocation"),
    permissionModel: "BROWSER_PROMPT",
    requiresPlatformPermission: true,
  },
  NOTIFICATIONS: {
    capability: "NOTIFICATIONS",
    label: "Notifications",
    description: "Security alerts and ARCHIE updates.",
    supported: () => typeof Notification !== "undefined",
    permissionModel: "BROWSER_PROMPT",
    requiresPlatformPermission: true,
  },
  CLIPBOARD: {
    capability: "CLIPBOARD",
    label: "Clipboard",
    description:
      "Copy ARCHIE results, paste material into ARCHIE, with your consent.",
    supported: () => has("clipboard.readText") || has("clipboard.writeText"),
    permissionModel: "BROWSER_PROMPT",
    requiresPlatformPermission: true,
  },
  OPEN_LINKS: {
    capability: "OPEN_LINKS",
    label: "Open links",
    description: "Open FRELUX pages and supported web links.",
    supported: () => typeof window !== "undefined",
    permissionModel: "NONE",
    requiresPlatformPermission: false,
  },
  CALCULATORS: {
    capability: "CALCULATORS",
    label: "FRELUX calculators",
    description:
      "Use FRELUX's deterministic calculators and intelligence through ARCHIE.",
    supported: () => typeof window !== "undefined",
    permissionModel: "NONE",
    requiresPlatformPermission: false,
  },
  TEXT_GENERATION: {
    capability: "TEXT_GENERATION",
    label: "Text generation (on-device)",
    description:
      "ARCHIE composes text from FRELUX data with the free on-device path, no paid cloud service.",
    supported: () => typeof window !== "undefined",
    permissionModel: "APP_CONSENT_ONLY",
    requiresPlatformPermission: false,
  },
  CODE_GENERATION: {
    capability: "CODE_GENERATION",
    label: "Code generation (on-device)",
    description:
      "ARCHIE drafts code snippets from templates, free; production changes still need owner authorization.",
    supported: () => typeof window !== "undefined",
    permissionModel: "APP_CONSENT_ONLY",
    requiresPlatformPermission: false,
  },
  WEB_INTELLIGENCE: {
    capability: "WEB_INTELLIGENCE",
    label: "Web intelligence",
    description:
      "Permitted access to FRELUX's controlled web-intelligence sources.",
    supported: () => typeof window !== "undefined",
    permissionModel: "APP_CONSENT_ONLY",
    requiresPlatformPermission: false,
  },
};

function documentPictureCaptureSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "capture" in document.createElement("input")
  );
}

export const FREE_CAPABILITY_KEYS: readonly ArchieMobileCapability[] =
  Object.keys(MOBILE_CAPABILITIES) as ArchieMobileCapability[];

/** Is the capability available on THIS device right now? */
export function isCapabilitySupported(cap: ArchieMobileCapability): boolean {
  try {
    return MOBILE_CAPABILITIES[cap].supported();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// Consent gate, the single enforcement point for every device
// capability. Denial is always graceful.
// ---------------------------------------------------------
export function checkCapabilityConsent(
  capability: ArchieMobileCapability,
  consent: ArchieConsent | undefined,
): { ok: boolean; error?: string } {
  if (!consent || !consent.granted) {
    return {
      ok: false,
      error: `"${MOBILE_CAPABILITIES[capability].label}" is not enabled. Turn it on in ARCHIE Mobile settings, ARCHIE never uses device features without your explicit permission.`,
    };
  }
  if (!isCapabilitySupported(capability)) {
    return {
      ok: false,
      error: `"${MOBILE_CAPABILITIES[capability].label}" is not supported on this device.`,
    };
  }
  return { ok: true };
}

/** Only FRELUX links and a safe allowlist of web links open. */
const SAFE_LINK_ALLOWLIST = /^https?:\/\//i;

export function isSafeLink(url: string): boolean {
  if (!SAFE_LINK_ALLOWLIST.test(url)) return false;
  if (/javascript:|data:|vbscript:/i.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** User-selected device files: size + type validation (malicious file guard). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const BLOCKED_EXTENSIONS = /\.(bat|cmd|hta|vbs|exe|scr|jar|msi)$/i;

export function validateDeviceFile(
  name: string,
  size: number,
  kind: "IMAGE" | "FILE",
): { ok: boolean; error?: string } {
  if (BLOCKED_EXTENSIONS.test(name)) {
    return {
      ok: false,
      error: `"${name}" is an executable/script file type, not accepted for security reasons.`,
    };
  }
  const max = kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (size > max) {
    return {
      ok: false,
      error: `"${name}" is too large (max ${Math.round(max / (1024 * 1024))} MB).`,
    };
  }
  if (size === 0) {
    return { ok: false, error: `"${name}" is empty.` };
  }
  return { ok: true };
}
