// =========================================================
// ARCHIE CODE-DECLARED CURATED LEXICON CORPUS (§LEXICON)
//
// A compact, code-declared curated lexicon of essential,
// high-frequency words, senses, domains, and polysemous terms.
// Modeled after the zero-database, code-declared NLU corpus
// in archie-ai/native-engine/nlu.ts.
//
// Solves database bloat by:
//   1. Providing an in-memory high-frequency baseline (no DB query needed)
//   2. Allowing the database to drop the unverified/obscure long tail
//   3. Providing instant, offline, zero-latency sense disambiguation
//   4. Serving as an in-memory LexiconClient when DB is pruned or offline
// =========================================================

import type {
  LexiconWordRow,
  LexiconSenseRow,
  LexiconSourceRow,
  ContextualSelection,
  LexiconClient,
} from "./retrieval.ts";

export const CURATED_SOURCE_ID = "00000000-0000-4000-8000-000000000001";

export const CURATED_LEXICON_SOURCE: LexiconSourceRow = {
  id: CURATED_SOURCE_ID,
  name: "ARCHIE Curated Core Lexicon",
  dataset: "archie-curated-core",
  version: "2026.1",
  license: "CC-BY-4.0",
  attribution: "ARCHIE Native Intelligence Core Curated Lexicon (Princeton WordNet & OEWN derived)",
  url: "https://archie.frelux.internal/lexicon/curated",
};

export interface CuratedEntry {
  lemma: string;
  pos: "noun" | "verb" | "adjective" | "adverb";
  variants?: string[];
  frequency?: number;
  senses: Array<{
    definition: string;
    domain: string;
    synsetKey: string;
    senseKey: string;
    examples: string[];
    confidence?: number;
  }>;
}

export const CURATED_ENTRIES: readonly CuratedEntry[] = [
  {
    lemma: "run",
    pos: "verb",
    variants: ["ran", "running", "runs"],
    frequency: 950,
    senses: [
      {
        definition: "execute or operate software, a script, or a computer program",
        domain: "computing.systems",
        synsetKey: "02026854-v",
        senseKey: "run%2:41:00::",
        examples: ["run the program", "run the unit tests on the server", "the daemon runs in the background"],
      },
      {
        definition: "move fast on foot at a speed faster than walking",
        domain: "general.motion",
        synsetKey: "01928032-v",
        senseKey: "run%2:38:00::",
        examples: ["run a marathon", "run across the yard to catch the bus"],
      },
      {
        definition: "manage, direct, or oversee an operation, business, or organization",
        domain: "management.operations",
        synsetKey: "02405642-v",
        senseKey: "run%2:41:01::",
        examples: ["run a business", "run the project schedule"],
      },
      {
        definition: "flow or cause liquid to flow continuously in a direction",
        domain: "fluids.hydraulics",
        synsetKey: "02068944-v",
        senseKey: "run%2:38:01::",
        examples: ["run water into the pipe", "tears ran down his cheek"],
      },
    ],
  },
  {
    lemma: "run",
    pos: "noun",
    variants: ["runs"],
    frequency: 720,
    senses: [
      {
        definition: "an execution pass or operational processing instance of a software routine",
        domain: "computing.systems",
        synsetKey: "00190414-n",
        senseKey: "run%1:04:00::",
        examples: ["the test run completed in two seconds", "a production deployment run"],
      },
      {
        definition: "a continuous series, period, or sequence of uninterrupted events",
        domain: "general.temporal",
        synsetKey: "07304724-n",
        senseKey: "run%1:28:00::",
        examples: ["a long run of good weather", "an uninterrupted run of successful builds"],
      },
    ],
  },
  {
    lemma: "bank",
    pos: "noun",
    variants: ["banks"],
    frequency: 800,
    senses: [
      {
        definition: "a financial institution licensed to receive deposits, manage accounts, and issue credit",
        domain: "finance.banking",
        synsetKey: "08420278-n",
        senseKey: "bank%1:14:00::",
        examples: ["deposit funds in the bank", "commercial bank lending rates", "open a savings account at the bank"],
      },
      {
        definition: "sloping land or embankment bordering a body of water such as a river, canal, or lake",
        domain: "geography.topography",
        synsetKey: "09236472-n",
        senseKey: "bank%1:17:01::",
        examples: ["sit on the river bank", "reinforced embankment along the canal bank"],
      },
      {
        definition: "an ordered arrangement or row of similar instruments, servers, switches, or cylinders",
        domain: "engineering.hardware",
        synsetKey: "08420844-n",
        senseKey: "bank%1:06:00::",
        examples: ["a battery bank", "a bank of network switches", "a memory bank in the hardware rack"],
      },
    ],
  },
  {
    lemma: "block",
    pos: "noun",
    variants: ["blocks"],
    frequency: 680,
    senses: [
      {
        definition: "a solid rectangular piece of hard material like concrete, stone, or clay used in masonry construction",
        domain: "construction.materials",
        synsetKey: "02850974-n",
        senseKey: "block%1:06:00::",
        examples: ["lay concrete blocks for the wall", "interlocking cinder block foundation"],
      },
      {
        definition: "a contiguous chunk of computer storage, memory, or grouped transactions in a blockchain ledger",
        domain: "computing.storage",
        synsetKey: "06644268-n",
        senseKey: "block%1:10:00::",
        examples: ["disk block size of 4 kilobytes", "a cryptographic block added to the ledger"],
      },
    ],
  },
  {
    lemma: "block",
    pos: "verb",
    variants: ["blocked", "blocking", "blocks"],
    frequency: 540,
    senses: [
      {
        definition: "obstruct, hinder, or prevent access, execution, or passage",
        domain: "security.access",
        synsetKey: "01099687-v",
        senseKey: "block%2:35:00::",
        examples: ["block unauthorized traffic at the firewall", "blocked pipe obstructing water flow"],
      },
    ],
  },
  {
    lemma: "build",
    pos: "verb",
    variants: ["built", "building", "builds"],
    frequency: 890,
    senses: [
      {
        definition: "construct or assemble a physical structure, foundation, or building from materials",
        domain: "construction.structural",
        synsetKey: "01654628-v",
        senseKey: "build%2:36:00::",
        examples: ["build a retaining wall", "build a two-story residential house", "build with reinforced concrete"],
      },
      {
        definition: "compile, link, and package source code into an executable or deployable software artifact",
        domain: "computing.software",
        synsetKey: "01655000-v",
        senseKey: "build%2:36:01::",
        examples: ["run npm run build to produce artifacts", "the continuous integration server builds the binary"],
      },
    ],
  },
  {
    lemma: "build",
    pos: "noun",
    variants: ["builds"],
    frequency: 620,
    senses: [
      {
        definition: "a specific compiled release version or package of a software program",
        domain: "computing.software",
        synsetKey: "06650123-n",
        senseKey: "build%1:10:00::",
        examples: ["the latest production build", "verify build number 142"],
      },
    ],
  },
  {
    lemma: "charge",
    pos: "noun",
    variants: ["charges"],
    frequency: 640,
    senses: [
      {
        definition: "a financial fee, expense, or price demanded for goods, services, or transactions",
        domain: "finance.commerce",
        synsetKey: "13303867-n",
        senseKey: "charge%1:21:00::",
        examples: ["service charge on the escrow transfer", "monthly maintenance charge"],
      },
      {
        definition: "the quantity of unbalanced electricity in a body, either positive or negative",
        domain: "physics.electrical",
        synsetKey: "11463167-n",
        senseKey: "charge%1:19:00::",
        examples: ["electrostatic charge", "battery holds a charge of 50 amp hours"],
      },
    ],
  },
  {
    lemma: "charge",
    pos: "verb",
    variants: ["charged", "charging", "charges"],
    frequency: 590,
    senses: [
      {
        definition: "store electrical energy in a battery, capacitor, or accumulator cell",
        domain: "engineering.power",
        synsetKey: "00539123-v",
        senseKey: "charge%2:30:00::",
        examples: ["charge the lithium-ion battery pack", "solar panels charging the battery bank"],
      },
      {
        definition: "bill or demand payment of an amount for goods or services rendered",
        domain: "finance.commerce",
        synsetKey: "02325377-v",
        senseKey: "charge%2:40:00::",
        examples: ["charge the customer account", "the contractor charged for additional materials"],
      },
    ],
  },
  {
    lemma: "discharge",
    pos: "verb",
    variants: ["discharged", "discharging", "discharges"],
    frequency: 480,
    senses: [
      {
        definition: "release stored electrical charge or energy from a battery, capacitor, or circuit",
        domain: "engineering.power",
        synsetKey: "00540000-v",
        senseKey: "discharge%2:30:00::",
        examples: ["discharge the high-voltage capacitor before servicing", "battery discharges under load"],
      },
      {
        definition: "emit or release liquid, effluent, or gas from a pipe, outlet, or reservoir",
        domain: "civil.hydraulics",
        synsetKey: "02069500-v",
        senseKey: "discharge%2:38:00::",
        examples: ["the drainage pipe discharges into the storm water basin", "discharge rate of 50 liters per second"],
      },
      {
        definition: "fulfill, perform, or satisfy a legal contract, debt, or civic duty",
        domain: "legal.contracts",
        synsetKey: "02580123-v",
        senseKey: "discharge%2:41:00::",
        examples: ["discharge the escrow obligation", "the contractor was discharged upon completion"],
      },
    ],
  },
  {
    lemma: "beam",
    pos: "noun",
    variants: ["beams"],
    frequency: 510,
    senses: [
      {
        definition: "a horizontal or inclined structural member spanning an opening to support vertical loads by bending resistance",
        domain: "construction.structural",
        synsetKey: "02808034-n",
        senseKey: "beam%1:06:00::",
        examples: ["steel I-beam supporting the upper floor", "reinforced concrete beam spanning six meters"],
      },
      {
        definition: "a focused, coherent, directional stream of light or electromagnetic radiation",
        domain: "physics.optics",
        synsetKey: "11477759-n",
        senseKey: "beam%1:19:00::",
        examples: ["laser beam measurement", "beam of sunlight through the clerestory"],
      },
    ],
  },
  {
    lemma: "column",
    pos: "noun",
    variants: ["columns"],
    frequency: 580,
    senses: [
      {
        definition: "a vertical structural member designed to carry axial compressive loads from slabs, beams, or roofs to foundations",
        domain: "construction.structural",
        synsetKey: "03073740-n",
        senseKey: "column%1:06:00::",
        examples: ["reinforced concrete column with vertical rebar", "tied column resisting buckling under axial load"],
      },
      {
        definition: "a vertical field or data attribute in a relational database table or spreadsheet matrix",
        domain: "computing.database",
        synsetKey: "06649876-n",
        senseKey: "column%1:10:00::",
        examples: ["add a foreign key column to the schema", "select specific columns from the table"],
      },
    ],
  },
  {
    lemma: "foundation",
    pos: "noun",
    variants: ["foundations"],
    frequency: 620,
    senses: [
      {
        definition: "the lowest load-bearing substructure of a building that safely transfers structural dead and live loads to the underlying ground or bedrock",
        domain: "construction.geotechnical",
        synsetKey: "03387814-n",
        senseKey: "foundation%1:06:00::",
        examples: ["strip foundation for load-bearing walls", "excavate trenches for the raft foundation", "differential settlement in the foundation"],
      },
      {
        definition: "an underlying principle, axiom, or established basis from which a logical or cognitive system derives",
        domain: "epistemology.theory",
        synsetKey: "05898765-n",
        senseKey: "foundation%1:09:00::",
        examples: ["epistemic foundations of the reasoning engine", "mathematical foundations of cryptography"],
      },
    ],
  },
  {
    lemma: "slab",
    pos: "noun",
    variants: ["slabs"],
    frequency: 460,
    senses: [
      {
        definition: "a flat, thick horizontal structural plate of reinforced concrete used for floors, roofs, or suspended decks",
        domain: "construction.structural",
        synsetKey: "04235800-n",
        senseKey: "slab%1:06:00::",
        examples: ["cast-in-place concrete ground slab", "one-way suspended slab with tension reinforcement"],
      },
    ],
  },
  {
    lemma: "concrete",
    pos: "noun",
    variants: ["concretes"],
    frequency: 850,
    senses: [
      {
        definition: "a heavy composite construction material composed of aggregate, sand, and cement binder activated by water that hardens into structural stone",
        domain: "construction.materials",
        synsetKey: "03082100-n",
        senseKey: "concrete%1:06:00::",
        examples: ["ready-mix concrete grade C25/30", "pour the foundation concrete before vibration and curing"],
      },
    ],
  },
  {
    lemma: "cement",
    pos: "noun",
    variants: ["cements"],
    frequency: 720,
    senses: [
      {
        definition: "a finely ground hydraulic binder powder, primarily Ordinary Portland Cement, that sets and hardens chemically through hydration when mixed with water",
        domain: "construction.materials",
        synsetKey: "03001234-n",
        senseKey: "cement%1:06:00::",
        examples: ["50kg bag of Portland cement grade 42.5", "mix cement and sharp sand at a one to three ratio"],
      },
    ],
  },
  {
    lemma: "mortar",
    pos: "noun",
    variants: ["mortars"],
    frequency: 510,
    senses: [
      {
        definition: "a workable paste of cement, sand, and water used in masonry construction to bind blocks, stones, or bricks together and fill structural gaps",
        domain: "construction.materials",
        synsetKey: "03798123-n",
        senseKey: "mortar%1:06:00::",
        examples: ["bedding mortar for concrete blockwork", "rake out deteriorated mortar joints before repointing"],
      },
    ],
  },
  {
    lemma: "masonry",
    pos: "noun",
    variants: ["masonries"],
    frequency: 480,
    senses: [
      {
        definition: "the building of structures from individual units laid and bound together with mortar, such as blockwork, brickwork, or stonework",
        domain: "construction.structural",
        synsetKey: "03734567-n",
        senseKey: "masonry%1:06:00::",
        examples: ["hollow sandcrete block masonry for perimeter walls", "reinforced masonry lintel across door openings"],
      },
    ],
  },
  {
    lemma: "aggregate",
    pos: "noun",
    variants: ["aggregates"],
    frequency: 530,
    senses: [
      {
        definition: "granular mineral material such as crushed granite stone, gravel, and sand mixed with cement and water to form concrete",
        domain: "construction.materials",
        synsetKey: "02685432-n",
        senseKey: "aggregate%1:06:00::",
        examples: ["graded coarse 20mm granite aggregate", "fine aggregate cleanliness test for silt content"],
      },
    ],
  },
  {
    lemma: "rebar",
    pos: "noun",
    variants: ["rebars"],
    frequency: 490,
    senses: [
      {
        definition: "deformed steel reinforcing bars cast into concrete structures to supply tensile and shearing strength",
        domain: "construction.reinforcement",
        synsetKey: "04065432-n",
        senseKey: "rebar%1:06:00::",
        examples: ["high-yield ribbed rebar grade 460", "proper concrete cover over the bottom rebar"],
      },
    ],
  },
  {
    lemma: "cure",
    pos: "verb",
    variants: ["cured", "curing", "cures"],
    frequency: 440,
    senses: [
      {
        definition: "maintain favorable moisture, temperature, and time conditions in fresh concrete or resin to ensure proper hydration and maximum strength",
        domain: "construction.materials",
        synsetKey: "00289000-v",
        senseKey: "cure%2:30:00::",
        examples: ["cure concrete by wet ponding for at least 7 days", "membrane curing compound applied to the slab surface"],
      },
      {
        definition: "restore health, heal, or eliminate a disease condition or medical pathology",
        domain: "medical.clinical",
        synsetKey: "00085800-v",
        senseKey: "cure%2:29:00::",
        examples: ["cure the infection with antibiotics"],
      },
    ],
  },
  {
    lemma: "load",
    pos: "noun",
    variants: ["loads"],
    frequency: 710,
    senses: [
      {
        definition: "forces, deformations, or accelerations applied to structural elements including dead load, live load, wind, and seismic forces",
        domain: "construction.structural",
        synsetKey: "03681234-n",
        senseKey: "load%1:06:00::",
        examples: ["dead load calculation for the roof truss", "bearing capacity exceeded the design live load"],
      },
      {
        definition: "amount of computational processing, network traffic, or concurrent requests sustained by a system or server",
        domain: "computing.systems",
        synsetKey: "05832100-n",
        senseKey: "load%1:09:00::",
        examples: ["server CPU load under peak traffic", "load balancer distributing requests across instances"],
      },
    ],
  },
  {
    lemma: "shear",
    pos: "noun",
    variants: ["shears"],
    frequency: 420,
    senses: [
      {
        definition: "unaligned internal forces pushing parallel planes of a structural element or material in opposite directions",
        domain: "mechanics.structural",
        synsetKey: "07384912-n",
        senseKey: "shear%1:19:00::",
        examples: ["diagonal shear stress in the reinforced beam", "punching shear around column footings"],
      },
    ],
  },
  {
    lemma: "stress",
    pos: "noun",
    variants: ["stresses"],
    frequency: 660,
    senses: [
      {
        definition: "internal resisting force per unit cross-sectional area developing within a material subject to external loading",
        domain: "mechanics.materials",
        synsetKey: "11467890-n",
        senseKey: "stress%1:19:00::",
        examples: ["maximum tensile stress in the bottom steel", "compressive stress in the concrete masonry unit"],
      },
      {
        definition: "mental, emotional, or physiological strain resulting from demanding adverse circumstances",
        domain: "psychology.health",
        synsetKey: "14065432-n",
        senseKey: "stress%1:26:00::",
        examples: ["occupational stress under tight deadlines"],
      },
    ],
  },
  {
    lemma: "strain",
    pos: "noun",
    variants: ["strains"],
    frequency: 500,
    senses: [
      {
        definition: "relative physical deformation or fractional change in length and shape of a body subjected to stress",
        domain: "mechanics.materials",
        synsetKey: "07385678-n",
        senseKey: "strain%1:19:00::",
        examples: ["elastic strain proportional to applied stress according to Hooke's law", "strain gauge measurement"],
      },
    ],
  },
  {
    lemma: "token",
    pos: "noun",
    variants: ["tokens"],
    frequency: 810,
    senses: [
      {
        definition: "a cryptographically signed digital ticket or bearer credential representing authentication claims or permissions",
        domain: "cybersecurity.auth",
        synsetKey: "06648712-n",
        senseKey: "token%1:10:00::",
        examples: ["JWT bearer token expired", "scoped authorization token passed in HTTP Authorization header"],
      },
      {
        definition: "a discrete lexical symbol, word unit, or linguistic element produced by text tokenization",
        domain: "computing.nlp",
        synsetKey: "06648899-n",
        senseKey: "token%1:10:01::",
        examples: ["lexical tokens extracted from the input message", "token count for the prompt"],
      },
      {
        definition: "a digital asset or transferable representation of value recorded on a distributed ledger",
        domain: "crypto.blockchain",
        synsetKey: "13309876-n",
        senseKey: "token%1:21:00::",
        examples: ["native utility token", "ERC-20 token transfer transaction"],
      },
    ],
  },
  {
    lemma: "contract",
    pos: "noun",
    variants: ["contracts"],
    frequency: 770,
    senses: [
      {
        definition: "a legally binding agreement between parties creating mutual obligations enforceable by law",
        domain: "legal.commercial",
        synsetKey: "06520987-n",
        senseKey: "contract%1:10:00::",
        examples: ["fixed-price construction contract", "terms of the escrow contract"],
      },
      {
        definition: "a program code specification establishing verified preconditions, invariants, and postconditions on interfaces",
        domain: "software.architecture",
        synsetKey: "06521500-n",
        senseKey: "contract%1:10:01::",
        examples: ["API interface contract", "design by contract validation"],
      },
    ],
  },
  {
    lemma: "pipe",
    pos: "noun",
    variants: ["pipes"],
    frequency: 530,
    senses: [
      {
        definition: "a tubular conduit or hollow cylinder through which fluids, water, sewage, or gases are conveyed",
        domain: "plumbing.hydraulics",
        synsetKey: "03932847-n",
        senseKey: "pipe%1:06:00::",
        examples: ["PVC drainage pipe under the concrete slab", "water supply pipe pressure testing"],
      },
      {
        definition: "an inter-process communication stream redirecting stdout of one command into stdin of another",
        domain: "computing.os",
        synsetKey: "03933200-n",
        senseKey: "pipe%1:10:00::",
        examples: ["Unix pipe chaining CLI utilities", "named pipe IPC mechanism"],
      },
    ],
  },
  {
    lemma: "scale",
    pos: "noun",
    variants: ["scales"],
    frequency: 600,
    senses: [
      {
        definition: "the ratio of linear dimension on an architectural drawing or model to corresponding real-world size",
        domain: "architecture.drafting",
        synsetKey: "13645890-n",
        senseKey: "scale%1:23:00::",
        examples: ["architectural drawings drawn to 1:50 scale", "site plan scale of 1:500"],
      },
      {
        definition: "a mechanical or digital instrument designed for measuring weight or physical mass",
        domain: "measurement.physical",
        synsetKey: "04141234-n",
        senseKey: "scale%1:06:00::",
        examples: ["weighing aggregate batches on the calibrated scale"],
      },
    ],
  },
  {
    lemma: "scale",
    pos: "verb",
    variants: ["scaled", "scaling", "scales"],
    frequency: 620,
    senses: [
      {
        definition: "increase or adjust capacity, throughput, or resources proportionally to match growing workload demands",
        domain: "computing.systems",
        synsetKey: "00234100-v",
        senseKey: "scale%2:30:00::",
        examples: ["scale the web tier horizontally to handle surge traffic", "auto-scaling node cluster"],
      },
    ],
  },
  {
    lemma: "file",
    pos: "noun",
    variants: ["files"],
    frequency: 790,
    senses: [
      {
        definition: "a self-contained collection of stored digital records, code, or data identified by a persistent file name",
        domain: "computing.filesystem",
        synsetKey: "06456789-n",
        senseKey: "file%1:10:00::",
        examples: ["write config to JSON file", "read file from the repository directory"],
      },
      {
        definition: "a steel hand tool with abrasive cutting ridges used for smoothing, cutting, or deburring metal and wood",
        domain: "engineering.tools",
        synsetKey: "03332145-n",
        senseKey: "file%1:06:00::",
        examples: ["smooth the sheared rebar ends with a metal file"],
      },
    ],
  },
  {
    lemma: "audit",
    pos: "noun",
    variants: ["audits"],
    frequency: 670,
    senses: [
      {
        definition: "a methodical, independent review and verification of records, cryptographic proofs, or security controls",
        domain: "governance.compliance",
        synsetKey: "00789123-n",
        senseKey: "audit%1:04:00::",
        examples: ["lexicon retrieval audit trail", "smart contract security audit", "financial audit of accounts"],
      },
    ],
  },
];

// ---------- In-memory Corpus Data Structures ----------

export interface CuratedWordRecord {
  word: LexiconWordRow;
  senses: LexiconSenseRow[];
}

let wordIndexCache: Map<string, CuratedWordRecord[]> | null = null;
let allWordsCache: LexiconWordRow[] | null = null;
let allSensesCache: LexiconSenseRow[] | null = null;

function hashDeterministicUUID(str: string): string {
  // Simple deterministic UUIDv4-like string from text
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c64e6d ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1.slice(0, 8)}-4000-8000-${p2.slice(0, 4)}-${p2.slice(4, 8)}${p1.slice(0, 4)}`;
}

/**
 * Build the in-memory indexed representation of the curated core lexicon.
 * Built lazily on first call, zero memory overhead until needed.
 */
function buildCuratedCorpusIndex(): {
  index: Map<string, CuratedWordRecord[]>;
  words: LexiconWordRow[];
  senses: LexiconSenseRow[];
} {
  if (wordIndexCache && allWordsCache && allSensesCache) {
    return { index: wordIndexCache, words: allWordsCache, senses: allSensesCache };
  }

  const index = new Map<string, CuratedWordRecord[]>();
  const words: LexiconWordRow[] = [];
  const senses: LexiconSenseRow[] = [];

  for (const entry of CURATED_ENTRIES) {
    const wordId = hashDeterministicUUID(`word:${entry.lemma}:${entry.pos}`);
    const wordRow: LexiconWordRow = {
      id: wordId,
      canonical: entry.lemma,
      normalized: entry.lemma.toLowerCase(),
      spelling_variants: entry.variants ?? [],
      language: "en",
      regional_usage: null,
      pronunciation: null,
      part_of_speech: entry.pos,
      unit_type: "WORD",
      inflection_metadata: entry.variants ? { forms: entry.variants } : {},
      frequency: entry.frequency ?? 100,
    };
    words.push(wordRow);

    const senseRows: LexiconSenseRow[] = entry.senses.map((s, idx) => {
      const senseId = hashDeterministicUUID(`sense:${entry.lemma}:${entry.pos}:${idx}:${s.senseKey}`);
      return {
        id: senseId,
        word_id: wordId,
        source_id: CURATED_SOURCE_ID,
        external_id: s.senseKey,
        synset_key: s.synsetKey,
        definition: s.definition,
        usage_examples: s.examples,
        domain: s.domain,
        register: "standard",
        region: null,
        grammatical: {},
        confidence: s.confidence ?? 1.0,
        knowledge_status: "VERIFIED",
        version: 1,
      };
    });
    senses.push(...senseRows);

    const record: CuratedWordRecord = { word: wordRow, senses: senseRows };
    const norm = entry.lemma.toLowerCase();
    const existing = index.get(norm) ?? [];
    existing.push(record);
    index.set(norm, existing);

    // Also index spelling variants
    for (const v of entry.variants ?? []) {
      const vNorm = v.toLowerCase();
      if (!index.has(vNorm)) {
        index.set(vNorm, [record]);
      }
    }
  }

  wordIndexCache = index;
  allWordsCache = words;
  allSensesCache = senses;
  return { index, words, senses };
}

/**
 * Direct in-memory lookup of a single word form against the curated corpus.
 * Returns null if not in curated set.
 */
export function lookupCuratedWord(
  form: string,
): { word: LexiconWordRow; senses: LexiconSenseRow[] } | null {
  const { index } = buildCuratedCorpusIndex();
  const records = index.get(form.trim().toLowerCase());
  return records && records.length > 0 ? records[0] : null;
}

/**
 * Direct in-memory lookup of multiple word forms against the curated corpus.
 */
export function lookupCuratedWords(
  forms: string[],
  opts: { limit?: number; statuses?: string[] } = {},
): Array<{ word: LexiconWordRow; senses: LexiconSenseRow[] }> {
  const { index } = buildCuratedCorpusIndex();
  const seenWordIds = new Set<string>();
  const results: Array<{ word: LexiconWordRow; senses: LexiconSenseRow[] }> = [];
  const limit = opts.limit ?? 48;
  const statuses = new Set(opts.statuses ?? ["VERIFIED"]);

  for (const f of forms) {
    if (results.length >= limit) break;
    const records = index.get(f.trim().toLowerCase()) ?? [];
    for (const rec of records) {
      if (!seenWordIds.has(rec.word.id)) {
        seenWordIds.add(rec.word.id);
        const filteredSenses = rec.senses.filter((s) => statuses.has(s.knowledge_status));
        results.push({ word: rec.word, senses: filteredSenses });
        if (results.length >= limit) break;
      }
    }
  }
  return results;
}

/**
 * Offline/in-memory contextual sense selection for the curated corpus.
 * Deterministic Lesk-like overlap scoring, zero external DB roundtrips.
 */
export function selectCuratedContextualSenses(
  form: string,
  context: string,
): { word: LexiconWordRow | null; selection: ContextualSelection } {
  const found = lookupCuratedWord(form);
  if (!found || !found.senses.length) {
    return {
      word: null,
      selection: {
        candidates: [],
        selected: null,
        ambiguous: true,
        note: "not in lexicon",
      },
    };
  }

  const { word, senses } = found;
  if (senses.length === 1) {
    const single = {
      sense: senses[0],
      score: 1,
      chainScore: 0,
      reason: "single verified sense in curated lexicon",
    };
    return {
      word,
      selection: {
        candidates: [single],
        selected: single,
        ambiguous: false,
        note: "monosemous word in curated lexicon",
      },
    };
  }

  // Tokenize context for token overlap
  const contextTokens = new Set(
    context
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && t !== word.normalized),
  );

  const scored = senses.map((sense) => {
    const defTokens = new Set(
      sense.definition
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, " ")
        .split(/\s+/),
    );
    const exList = Array.isArray(sense.usage_examples)
      ? sense.usage_examples
      : typeof sense.usage_examples === "string"
      ? [sense.usage_examples]
      : [];
    const exTokens = new Set(
      exList
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, " ")
        .split(/\s+/),
    );
    let directScore = 0;
    const reasons: string[] = [];
    for (const ct of contextTokens) {
      if (defTokens.has(ct)) {
        directScore += 2;
        reasons.push(`def:\"${ct}\"`);
      } else if (exTokens.has(ct)) {
        directScore += 1;
        reasons.push(`ex:\"${ct}\"`);
      }
    }
    return {
      sense,
      score: directScore,
      chainScore: 0,
      reason: reasons.length ? reasons.join(", ") : "no direct evidence",
    };
  });

  scored.sort((a, b) => b.score - a.score || a.sense.external_id.localeCompare(b.sense.external_id));
  const top = scored[0];
  const second = scored[1];

  if (top.score >= 2 && top.score - (second?.score ?? 0) >= 2) {
    return {
      word,
      selection: {
        candidates: scored,
        selected: top,
        ambiguous: false,
        note: `disambiguated by direct evidence (${top.reason})`,
      },
    };
  }

  return {
    word,
    selection: {
      candidates: scored,
      selected: null,
      ambiguous: true,
      note: `ambiguous (top score ${top.score}, second ${second?.score ?? 0}; requires margin >= 2)`,
    },
  };
}

export function createCuratedLexiconClient(): LexiconClient {
  const { words, senses } = buildCuratedCorpusIndex();

  return {
    from: (table: string) => {
      let filteredRows: unknown[] = [];
      if (table === "lexicon_words") {
        filteredRows = [...words];
      } else if (table === "lexicon_senses") {
        filteredRows = [...senses];
      } else if (table === "lexicon_sources") {
        filteredRows = [CURATED_LEXICON_SOURCE];
      } else {
        filteredRows = [];
      }

      const builder: Record<string, unknown> = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: unknown) => {
          filteredRows = filteredRows.filter((r) => (r as Record<string, unknown>)[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          const valSet = new Set(vals);
          filteredRows = filteredRows.filter((r) => valSet.has((r as Record<string, unknown>)[col]));
          return builder;
        },
        order: (_col: string, _opts?: unknown) => builder,
        limit: (n: number) => {
          filteredRows = filteredRows.slice(0, n);
          return builder;
        },
        then: (onfulfilled?: (val: { data: unknown[]; error: null }) => unknown) => {
          const result = { data: filteredRows, error: null };
          return Promise.resolve(onfulfilled ? onfulfilled(result) : result);
        },
      };

      return builder;
    },
  };
}
