// =========================================================
// ARCHIE CLIENT-SIDE CURATED LEXICON ENGINE (§LEXICON)
//
// Offline-capable, zero-database lexical disambiguation and
// definition engine for the ARCHIE PWA and web client.
// Folded into code-declared corpora like the NLU engine.
//
// Eliminates database roundtrips for high-frequency words,
// operational construction/engineering terms, and polysemous
// disambiguation.
// =========================================================

export interface CuratedSense {
  id: string;
  definition: string;
  domain: string;
  synsetKey: string;
  senseKey: string;
  examples: string[];
  confidence: number;
}

export interface CuratedWord {
  id: string;
  canonical: string;
  normalized: string;
  pos: "noun" | "verb" | "adjective" | "adverb";
  variants: string[];
  frequency: number;
  senses: CuratedSense[];
}

export interface DisambiguationResult {
  lemma: string;
  pos: string;
  status: "MONOSEMOUS" | "DISAMBIGUATED" | "AMBIGUOUS" | "NOT_IN_LEXICON";
  primarySense: CuratedSense | null;
  competingSenses: CuratedSense[];
  matchedEvidence: string[];
}

// ---------------------------------------------------------
// Curated High-Frequency Dictionary
// ---------------------------------------------------------
export const CURATED_DICTIONARY: readonly CuratedWord[] = [
  {
    id: "w-run-v",
    canonical: "run",
    normalized: "run",
    pos: "verb",
    variants: ["ran", "running", "runs"],
    frequency: 950,
    senses: [
      {
        id: "s-run-v-comp",
        definition: "execute or operate software, a script, or a computer program",
        domain: "computing.systems",
        synsetKey: "02026854-v",
        senseKey: "run%2:41:00::",
        examples: ["run the program", "run the unit tests on the server", "the daemon runs in the background"],
        confidence: 1.0,
      },
      {
        id: "s-run-v-phys",
        definition: "move fast on foot at a speed faster than walking",
        domain: "general.motion",
        synsetKey: "01928032-v",
        senseKey: "run%2:38:00::",
        examples: ["run a marathon", "run across the yard to catch the bus"],
        confidence: 1.0,
      },
      {
        id: "s-run-v-mgmt",
        definition: "manage, direct, or oversee an operation, business, or organization",
        domain: "management.operations",
        synsetKey: "02405642-v",
        senseKey: "run%2:41:01::",
        examples: ["run a business", "run the project schedule"],
        confidence: 1.0,
      },
      {
        id: "s-run-v-fluid",
        definition: "flow or cause liquid to flow continuously in a direction",
        domain: "fluids.hydraulics",
        synsetKey: "02068944-v",
        senseKey: "run%2:38:01::",
        examples: ["run water into the pipe", "water running from the valve"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-run-n",
    canonical: "run",
    normalized: "run",
    pos: "noun",
    variants: ["runs"],
    frequency: 720,
    senses: [
      {
        id: "s-run-n-exec",
        definition: "an execution pass or operational processing instance of a software routine",
        domain: "computing.systems",
        synsetKey: "00190414-n",
        senseKey: "run%1:04:00::",
        examples: ["the test run completed in two seconds", "a production deployment run"],
        confidence: 1.0,
      },
      {
        id: "s-run-n-seq",
        definition: "a continuous series, period, or sequence of uninterrupted events",
        domain: "general.temporal",
        synsetKey: "07304724-n",
        senseKey: "run%1:28:00::",
        examples: ["a long run of good weather", "an uninterrupted run of successful builds"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-bank-n",
    canonical: "bank",
    normalized: "bank",
    pos: "noun",
    variants: ["banks"],
    frequency: 800,
    senses: [
      {
        id: "s-bank-n-fin",
        definition: "a financial institution licensed to receive deposits, manage accounts, and issue credit",
        domain: "finance.banking",
        synsetKey: "08420278-n",
        senseKey: "bank%1:14:00::",
        examples: ["deposit funds in the bank", "commercial bank lending rates", "open a savings account at the bank"],
        confidence: 1.0,
      },
      {
        id: "s-bank-n-water",
        definition: "sloping land or embankment bordering a body of water such as a river, canal, or lake",
        domain: "geography.topography",
        synsetKey: "09236472-n",
        senseKey: "bank%1:17:01::",
        examples: ["sit on the river bank", "reinforced embankment along the canal bank"],
        confidence: 1.0,
      },
      {
        id: "s-bank-n-tier",
        definition: "an ordered arrangement or row of similar instruments, servers, switches, or cylinders",
        domain: "engineering.hardware",
        synsetKey: "08420844-n",
        senseKey: "bank%1:06:00::",
        examples: ["a battery bank", "a bank of network switches", "a memory bank in the hardware rack"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-block-n",
    canonical: "block",
    normalized: "block",
    pos: "noun",
    variants: ["blocks"],
    frequency: 680,
    senses: [
      {
        id: "s-block-n-masonry",
        definition: "a solid rectangular piece of hard material like concrete, stone, or clay used in masonry construction",
        domain: "construction.materials",
        synsetKey: "02850974-n",
        senseKey: "block%1:06:00::",
        examples: ["lay concrete blocks for the wall", "interlocking cinder block foundation"],
        confidence: 1.0,
      },
      {
        id: "s-block-n-storage",
        definition: "a contiguous chunk of computer storage, memory, or grouped transactions in a blockchain ledger",
        domain: "computing.storage",
        synsetKey: "06644268-n",
        senseKey: "block%1:10:00::",
        examples: ["disk block size of 4 kilobytes", "a cryptographic block added to the ledger"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-build-v",
    canonical: "build",
    normalized: "build",
    pos: "verb",
    variants: ["built", "building", "builds"],
    frequency: 890,
    senses: [
      {
        id: "s-build-v-struct",
        definition: "construct or assemble a physical structure, foundation, or building from materials",
        domain: "construction.structural",
        synsetKey: "01654628-v",
        senseKey: "build%2:36:00::",
        examples: ["build a retaining wall", "build a two-story residential house", "build with reinforced concrete"],
        confidence: 1.0,
      },
      {
        id: "s-build-v-code",
        definition: "compile, link, and package source code into an executable or deployable software artifact",
        domain: "computing.software",
        synsetKey: "01655000-v",
        senseKey: "build%2:36:01::",
        examples: ["run npm run build to produce artifacts", "the continuous integration server builds the binary"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-charge-n",
    canonical: "charge",
    normalized: "charge",
    pos: "noun",
    variants: ["charges"],
    frequency: 640,
    senses: [
      {
        id: "s-charge-n-fee",
        definition: "a financial fee, expense, or price demanded for goods, services, or transactions",
        domain: "finance.commerce",
        synsetKey: "13303867-n",
        senseKey: "charge%1:21:00::",
        examples: ["service charge on the escrow transfer", "monthly maintenance charge"],
        confidence: 1.0,
      },
      {
        id: "s-charge-n-elec",
        definition: "the quantity of unbalanced electricity in a body, either positive or negative",
        domain: "physics.electrical",
        synsetKey: "11463167-n",
        senseKey: "charge%1:19:00::",
        examples: ["electrostatic charge", "battery holds a charge of 50 amp hours"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-discharge-v",
    canonical: "discharge",
    normalized: "discharge",
    pos: "verb",
    variants: ["discharged", "discharging", "discharges"],
    frequency: 480,
    senses: [
      {
        id: "s-discharge-v-elec",
        definition: "release stored electrical charge or energy from a battery, capacitor, or circuit",
        domain: "engineering.power",
        synsetKey: "00540000-v",
        senseKey: "discharge%2:30:00::",
        examples: ["discharge the high-voltage capacitor before servicing", "battery discharges under load"],
        confidence: 1.0,
      },
      {
        id: "s-discharge-v-fluid",
        definition: "emit or release liquid, effluent, or gas from a pipe, outlet, or reservoir",
        domain: "civil.hydraulics",
        synsetKey: "02069500-v",
        senseKey: "discharge%2:38:00::",
        examples: ["the drainage pipe discharges into the storm water basin", "discharge rate of 50 liters per second"],
        confidence: 1.0,
      },
      {
        id: "s-discharge-v-contract",
        definition: "fulfill, perform, or satisfy a legal contract, debt, or civic duty",
        domain: "legal.contracts",
        synsetKey: "02580123-v",
        senseKey: "discharge%2:41:00::",
        examples: ["discharge the escrow obligation", "the contractor was discharged upon completion"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-beam-n",
    canonical: "beam",
    normalized: "beam",
    pos: "noun",
    variants: ["beams"],
    frequency: 510,
    senses: [
      {
        id: "s-beam-n-struct",
        definition: "a horizontal or inclined structural member spanning an opening to support vertical loads by bending resistance",
        domain: "construction.structural",
        synsetKey: "02808034-n",
        senseKey: "beam%1:06:00::",
        examples: ["steel I-beam supporting the upper floor", "reinforced concrete beam spanning six meters"],
        confidence: 1.0,
      },
      {
        id: "s-beam-n-optics",
        definition: "a focused, coherent, directional stream of light or electromagnetic radiation",
        domain: "physics.optics",
        synsetKey: "11477759-n",
        senseKey: "beam%1:19:00::",
        examples: ["laser beam measurement", "beam of sunlight through the clerestory"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-column-n",
    canonical: "column",
    normalized: "column",
    pos: "noun",
    variants: ["columns"],
    frequency: 580,
    senses: [
      {
        id: "s-column-n-struct",
        definition: "a vertical structural member designed to carry axial compressive loads from slabs, beams, or roofs to foundations",
        domain: "construction.structural",
        synsetKey: "03073740-n",
        senseKey: "column%1:06:00::",
        examples: ["reinforced concrete column with vertical rebar", "tied column resisting buckling under axial load"],
        confidence: 1.0,
      },
      {
        id: "s-column-n-db",
        definition: "a vertical field or data attribute in a relational database table or spreadsheet matrix",
        domain: "computing.database",
        synsetKey: "06649876-n",
        senseKey: "column%1:10:00::",
        examples: ["add a foreign key column to the schema", "select specific columns from the table"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-foundation-n",
    canonical: "foundation",
    normalized: "foundation",
    pos: "noun",
    variants: ["foundations"],
    frequency: 620,
    senses: [
      {
        id: "s-found-n-geo",
        definition: "the lowest load-bearing substructure of a building that safely transfers structural dead and live loads to ground",
        domain: "construction.geotechnical",
        synsetKey: "03387814-n",
        senseKey: "foundation%1:06:00::",
        examples: ["strip foundation for load-bearing walls", "excavate trenches for the raft foundation"],
        confidence: 1.0,
      },
      {
        id: "s-found-n-epist",
        definition: "an underlying principle, axiom, or established basis from which a logical or cognitive system derives",
        domain: "epistemology.theory",
        synsetKey: "05898765-n",
        senseKey: "foundation%1:09:00::",
        examples: ["epistemic foundations of the reasoning engine", "mathematical foundations of cryptography"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-cure-v",
    canonical: "cure",
    normalized: "cure",
    pos: "verb",
    variants: ["cured", "curing", "cures"],
    frequency: 440,
    senses: [
      {
        id: "s-cure-v-concrete",
        definition: "maintain favorable moisture, temperature, and time conditions in fresh concrete to ensure proper hydration and maximum strength",
        domain: "construction.materials",
        synsetKey: "00289000-v",
        senseKey: "cure%2:30:00::",
        examples: ["cure concrete by wet ponding for at least 7 days", "membrane curing compound applied to the slab surface"],
        confidence: 1.0,
      },
      {
        id: "s-cure-v-med",
        definition: "restore health, heal, or eliminate a disease condition or medical pathology",
        domain: "medical.clinical",
        synsetKey: "00085800-v",
        senseKey: "cure%2:29:00::",
        examples: ["cure the infection with antibiotics"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-rebar-n",
    canonical: "rebar",
    normalized: "rebar",
    pos: "noun",
    variants: ["rebars"],
    frequency: 490,
    senses: [
      {
        id: "s-rebar-n-struct",
        definition: "deformed steel reinforcing bars cast into concrete structures to supply tensile and shearing strength",
        domain: "construction.reinforcement",
        synsetKey: "04065432-n",
        senseKey: "rebar%1:06:00::",
        examples: ["high-yield ribbed rebar grade 460", "proper concrete cover over the bottom rebar"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-token-n",
    canonical: "token",
    normalized: "token",
    pos: "noun",
    variants: ["tokens"],
    frequency: 810,
    senses: [
      {
        id: "s-token-n-auth",
        definition: "a cryptographically signed digital ticket or bearer credential representing authentication claims or permissions",
        domain: "cybersecurity.auth",
        synsetKey: "06648712-n",
        senseKey: "token%1:10:00::",
        examples: ["JWT bearer token expired", "scoped authorization token passed in HTTP Authorization header"],
        confidence: 1.0,
      },
      {
        id: "s-token-n-nlp",
        definition: "a discrete lexical symbol, word unit, or linguistic element produced by text tokenization",
        domain: "computing.nlp",
        synsetKey: "06648899-n",
        senseKey: "token%1:10:01::",
        examples: ["lexical tokens extracted from the input message", "token count for the prompt"],
        confidence: 1.0,
      },
      {
        id: "s-token-n-crypto",
        definition: "a digital asset or transferable representation of value recorded on a distributed ledger",
        domain: "crypto.blockchain",
        synsetKey: "13309876-n",
        senseKey: "token%1:21:00::",
        examples: ["native utility token", "ERC-20 token transfer transaction"],
        confidence: 1.0,
      },
    ],
  },
  {
    id: "w-audit-n",
    canonical: "audit",
    normalized: "audit",
    pos: "noun",
    variants: ["audits"],
    frequency: 670,
    senses: [
      {
        id: "s-audit-n-gov",
        definition: "a methodical, independent review and verification of records, cryptographic proofs, or security controls",
        domain: "governance.compliance",
        synsetKey: "00789123-n",
        senseKey: "audit%1:04:00::",
        examples: ["lexicon retrieval audit trail", "smart contract security audit", "financial audit of accounts"],
        confidence: 1.0,
      },
    ],
  },
];

// Lazy indexing map
let lookupMapCache: Map<string, CuratedWord[]> | null = null;

function getLookupMap(): Map<string, CuratedWord[]> {
  if (lookupMapCache) return lookupMapCache;
  const m = new Map<string, CuratedWord[]>();
  for (const item of CURATED_DICTIONARY) {
    const norm = item.normalized;
    const list = m.get(norm) ?? [];
    list.push(item);
    m.set(norm, list);
    for (const v of item.variants) {
      const vNorm = v.toLowerCase();
      if (!m.has(vNorm)) {
        m.set(vNorm, [item]);
      }
    }
  }
  lookupMapCache = m;
  return m;
}

/**
 * Direct lookup of a word in the curated code-declared lexicon.
 */
export function lookupCuratedWord(form: string): CuratedWord | null {
  const m = getLookupMap();
  const list = m.get(form.trim().toLowerCase());
  return list && list.length > 0 ? list[0] : null;
}

/**
 * Direct lookup of multiple forms.
 */
export function lookupCuratedWords(forms: string[]): CuratedWord[] {
  const m = getLookupMap();
  const results: CuratedWord[] = [];
  const seenIds = new Set<string>();
  for (const f of forms) {
    const list = m.get(f.trim().toLowerCase()) ?? [];
    for (const w of list) {
      if (!seenIds.has(w.id)) {
        seenIds.add(w.id);
        results.push(w);
      }
    }
  }
  return results;
}

/**
 * Contextual sense disambiguation over the curated dictionary without database queries.
 */
export function disambiguateWord(form: string, context: string): DisambiguationResult {
  const word = lookupCuratedWord(form);
  if (!word) {
    return {
      lemma: form,
      pos: "noun",
      status: "NOT_IN_LEXICON",
      primarySense: null,
      competingSenses: [],
      matchedEvidence: [],
    };
  }

  if (word.senses.length === 1) {
    return {
      lemma: word.canonical,
      pos: word.pos,
      status: "MONOSEMOUS",
      primarySense: word.senses[0],
      competingSenses: [],
      matchedEvidence: ["single verified sense"],
    };
  }

  // Tokenize context
  const contextTokens = new Set(
    context
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && t !== word.normalized),
  );

  const scored = word.senses.map((sense) => {
    const textToMatch = `${sense.definition} ${sense.domain} ${sense.examples.join(" ")}`.toLowerCase();
    const senseTokens = new Set(textToMatch.replace(/[^a-z0-9\s_-]/g, " ").split(/\s+/));
    let matches = 0;
    const matchedEvidence: string[] = [];
    for (const ct of contextTokens) {
      if (senseTokens.has(ct)) {
        matches++;
        matchedEvidence.push(ct);
      }
    }
    return { sense, matches, matchedEvidence };
  });

  scored.sort((a, b) => b.matches - a.matches);
  const top = scored[0];
  const second = scored[1];

  if (top.matches > 0 && top.matches >= (second?.matches ?? 0) + 1) {
    return {
      lemma: word.canonical,
      pos: word.pos,
      status: "DISAMBIGUATED",
      primarySense: top.sense,
      competingSenses: scored.slice(1).map((s) => s.sense),
      matchedEvidence: top.matchedEvidence,
    };
  }

  return {
    lemma: word.canonical,
    pos: word.pos,
    status: "AMBIGUOUS",
    primarySense: top.sense,
    competingSenses: scored.map((s) => s.sense),
    matchedEvidence: top.matchedEvidence,
  };
}

/**
 * Disambiguates polysemous words present in a message against the curated dictionary.
 */
export function disambiguateMessage(message: string): DisambiguationResult[] {
  const tokens = Array.from(
    new Set(
      message
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3),
    ),
  );

  const results: DisambiguationResult[] = [];
  for (const t of tokens) {
    const word = lookupCuratedWord(t);
    if (word && word.senses.length > 1) {
      results.push(disambiguateWord(t, message));
    }
  }
  return results;
}

/**
 * List all unique domains in the curated core lexicon.
 */
export function getCuratedLexiconDomains(): string[] {
  const domains = new Set<string>();
  for (const w of CURATED_DICTIONARY) {
    for (const s of w.senses) {
      domains.add(s.domain);
    }
  }
  return Array.from(domains).sort();
}
