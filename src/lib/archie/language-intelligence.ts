// =========================================================
// FRELUX PHASE 9, ARCHIE LANGUAGE INTELLIGENCE
//
// Multilingual, location-aware language layer:
//
//   LOCATION → LANGUAGE SUGGESTION (advisory)
//   USER SELECTION → AUTHORITATIVE PREFERENCE (final)
//
// The language registry is DATA, not an enum: languages are
// addable at runtime through the admin/architecture without
// redesign (spec §4). Terminology follows the existing
// LEARN → VERIFY → VERSION → USE architecture; unverified
// terminology is never authoritative in outputs.
// =========================================================

import type {
  ArchieLanguage,
  LanguageResolution,
  RegionalProfile,
  TerminologyEntry,
} from "./phase9-types";

/**
 * Seed registry (DB table frelux_archie_languages is the
 * source of truth; admin-extensible, NO fixed language count).
 */
export const ARCHIE_SEED_LANGUAGES: readonly ArchieLanguage[] = [
  {
    code: "en",
    label: "English",
    native_label: "English",
    common_regions: ["NG", "GB", "US"],
    active: true,
  },
  {
    code: "pcm",
    label: "Nigerian Pidgin",
    native_label: "Naija Pidgin",
    common_regions: ["NG"],
    active: true,
  },
  {
    code: "ha",
    label: "Hausa",
    native_label: "Hausa",
    common_regions: ["NG"],
    active: true,
  },
  {
    code: "yo",
    label: "Yoruba",
    native_label: "Yorùbá",
    common_regions: ["NG"],
    active: true,
  },
  {
    code: "ig",
    label: "Igbo",
    native_label: "Igbo",
    common_regions: ["NG"],
    active: true,
  },
  {
    code: "fr",
    label: "French",
    native_label: "Français",
    common_regions: ["FR"],
    active: true,
  },
  {
    code: "sw",
    label: "Swahili",
    native_label: "Kiswahili",
    common_regions: ["KE", "TZ"],
    active: true,
  },
  {
    code: "es",
    label: "Spanish",
    native_label: "Español",
    common_regions: ["ES", "US"],
    active: true,
  },
];

/** In-memory registry mirroring the DB; extensible, no ceiling. */
export class ArchieLanguageRegistry {
  private languages = new Map<string, ArchieLanguage>();

  constructor(seed: readonly ArchieLanguage[] = ARCHIE_SEED_LANGUAGES) {
    for (const l of seed) this.languages.set(l.code, { ...l });
  }

  /** Any legitimate language can be registered (spec §4). */
  register(language: ArchieLanguage): void {
    if (this.languages.has(language.code)) {
      throw new Error(`Language "${language.code}" already registered`);
    }
    this.languages.set(language.code, { ...language });
  }

  isActive(code: string): boolean {
    return this.languages.get(code)?.active ?? false;
  }

  get(code: string): ArchieLanguage | undefined {
    return this.languages.get(code);
  }

  list(): ArchieLanguage[] {
    return [...this.languages.values()].filter((l) => l.active);
  }
}

export const archieLanguages = new ArchieLanguageRegistry();

/**
 * LOCATION → LANGUAGE SUGGESTION. Advisory only: picks the
 * first active language whose common regions include the
 * profile's country, falling back to English.
 */
export function suggestLanguage(
  profile: RegionalProfile,
  registry: ArchieLanguageRegistry = archieLanguages,
): string {
  const cc = profile.country_code;
  if (cc) {
    for (const code of profile.suggested_languages) {
      const lang = registry.get(code);
      if (lang && lang.active) return code;
    }
    const byRegion = registry.list().find((l) => l.common_regions.includes(cc));
    if (byRegion) return byRegion.code;
  }
  return "en";
}

/**
 * Resolve the session language (spec §4, §18.4): the user's
 * selection is AUTHORITATIVE; the location suggestion is used
 * only when the user has not chosen.
 */
export function resolveLanguage(input: {
  user_selection?: string | null;
  profile: RegionalProfile;
  registry?: ArchieLanguageRegistry;
}): LanguageResolution {
  const registry = input.registry ?? archieLanguages;
  if (input.user_selection) {
    if (!registry.isActive(input.user_selection)) {
      throw new Error(
        `Selected language "${input.user_selection}" is not registered/active.`,
      );
    }
    return {
      language_code: input.user_selection,
      source: "USER_SELECTION",
      authoritative: true,
    };
  }
  const suggested = suggestLanguage(input.profile, registry);
  return {
    language_code: suggested,
    source: "LOCATION_SUGGESTION",
    authoritative: false,
  };
}

/**
 * TERMINOLOGY: LEARN → VERIFY → VERSION → USE.
 * A new term for an existing domain+language+canonical term
 * VERSIONS the entry (never silently overwrites).
 */
export class TerminologyBook {
  private entries = new Map<string, TerminologyEntry>();

  private key(domain: string, lang: string, canonical: string): string {
    return `${domain}::${lang}::${canonical.toLowerCase()}`;
  }

  /** LEARN step: records/versions an entry as UNVERIFIED. */
  learn(
    entry: Omit<TerminologyEntry, "version" | "verification_status">,
  ): TerminologyEntry {
    const k = this.key(entry.domain, entry.language_code, entry.canonical_term);
    const existing = this.entries.get(k);
    const versioned: TerminologyEntry = {
      ...(existing ?? entry),
      ...entry,
      version: existing ? existing.version + 1 : 1,
      verification_status: "UNVERIFIED",
    };
    this.entries.set(k, versioned);
    return versioned;
  }

  /** VERIFY step: only explicit verification flips status. */
  verify(domain: string, lang: string, canonical: string): void {
    const e = this.entries.get(this.key(domain, lang, canonical));
    if (!e) throw new Error("Cannot verify unknown terminology entry.");
    e.verification_status = "VERIFIED";
  }

  /**
   * USE step: VERIFIED terminology is authoritative; UNVERIFIED
   * may only be surfaced with an explicit unverified flag;
   * REJECTED is never returned.
   */
  lookup(
    domain: string,
    lang: string,
    canonical: string,
  ): { entry: TerminologyEntry; authoritative: boolean } | null {
    const e = this.entries.get(this.key(domain, lang, canonical));
    if (!e || e.verification_status === "REJECTED") return null;
    return {
      entry: e,
      authoritative: e.verification_status === "VERIFIED",
    };
  }

  list(): TerminologyEntry[] {
    return [...this.entries.values()];
  }
}
