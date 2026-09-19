// =========================================================
// ARCHIE NATIVE ENGINE — BIP39 MNEMONIC VALIDATION &
// RECOVERY SUPPORT
// supabase/functions/_shared/archie-ai/native-engine/crypto/bip39.ts
//
// REAL BIP39 implementation for the owner's abandoned-wallet
// passphrase recovery capability (subsystem #24, owner
// directive 2026-09-11 "Blockchain & Controlled Trading
// Intelligence").
//
// What is REAL here:
//   * The canonical English BIP39 wordlist (2048 words;
//     wordlist file SHA-256:
//     2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda
//     — embedded verbatim, not fetched at runtime).
//   * Mnemonic structure validation + ENT/CS checksum
//     verification (SHA-256 first ENT/8... actually CS=ENT/32
//     bits) via WebCrypto — the real checksum, not a stub.
//   * Seed derivation PBKDF2-HMAC-SHA512(mnemonic, "mnemonic"
//     + passphrase, 2048 iters) via WebCrypto.
//
// Scope is HONEST: validation + seed derivation + candidate
// generation for owner-provided recovery. Private-key math
// lives in hd-crypto.ts. ARCHIE stores candidate passphrases
// ONLY inside an explicit owner-opened recovery job with full
// audit — never as knowledge, never in logs (see
// passphrase-recovery.ts which enforces this contract).
// =========================================================

// ---------------------------------------------------------
// 1. The canonical wordlist (sorted; index == BIP39 value)
// ---------------------------------------------------------
export const BIP39_WORDLIST: readonly string[] =
  "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo".split(
    " ",
  );

const WORD_INDEX = new Map<string, number>(
  BIP39_WORDLIST.map((w, i) => [w, i]),
);

/** True iff the word is a canonical BIP39 English word. */
export function isBip39Word(word: string): boolean {
  return WORD_INDEX.has(word);
}

/** BIP39 value for a word, or null if not canonical. */
export function wordValue(word: string): number | null {
  return WORD_INDEX.get(word) ?? null;
}

export type MnemonicCheck =
  | { kind: "invalid"; reason: string }
  | { kind: "structure_invalid"; words: string[]; reason: string }
  | { kind: "checksum_invalid"; words: string[]; entropyHex: string }
  | { kind: "valid"; words: string[]; entropyHex: string };

/** Structure + checksum validation. The checksum is computed
 *  with the REAL SHA-256 over the entropy — no shortcut. */
export async function validateMnemonic(
  mnemonic: string,
  sha256: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<MnemonicCheck> {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  const wc = words.length;
  if (![12, 15, 18, 21, 24].includes(wc)) {
    return {
      kind: "invalid",
      reason: `word count ${wc} is not a BIP39 length (12/15/18/21/24)`,
    };
  }
  const values: number[] = [];
  for (const w of words) {
    const v = WORD_INDEX.get(w);
    if (v === undefined) {
      return {
        kind: "structure_invalid",
        words,
        reason: `"${w}" is not a canonical BIP39 English word`,
      };
    }
    values.push(v);
  }
  const entBits = Math.floor((11 * wc) / 33) * 32;
  const csBits = entBits / 32;
  const entBytes = entBits / 8;
  let bitStr = "";
  for (const v of values) bitStr += v.toString(2).padStart(11, "0");
  const entropyBits = bitStr.slice(0, entBits);
  const checksumBits = bitStr.slice(entBits);
  const entropy = new Uint8Array(entBytes);
  for (let i = 0; i < entBytes; i++) {
    entropy[i] = parseInt(entropyBits.slice(i * 8, i * 8 + 8), 2);
  }
  const digest = await sha256(entropy);
  const hashBits = Array.from(digest)
    .map((b) => b.toString(2).padStart(8, "0"))
    .join("");
  const entropyHex = Array.from(entropy)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hashBits.slice(0, csBits) === checksumBits) {
    return { kind: "valid", words, entropyHex };
  }
  return { kind: "checksum_invalid", words, entropyHex };
}

// ---------------------------------------------------------
// 2. Seed derivation (the REAL PBKDF2-HMAC-SHA512)
// ---------------------------------------------------------
export const BIP39_PBKDF2_ITERATIONS = 2048;

export async function deriveSeedFromMnemonic(
  mnemonic: string,
  passphrase: string,
  pbkdf2Sha512: (
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keyBits: number,
  ) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const norm = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  const enc = (s: string) =>
    new Uint8Array(Array.from(new TextEncoder().encode(s)));
  return pbkdf2Sha512(
    enc(norm),
    enc("mnemonic" + passphrase),
    BIP39_PBKDF2_ITERATIONS,
    512,
  );
}

/** WebCrypto SHA-256 helper (Node 20 / Deno / browsers). */
export function sha256WebCrypto(bytes: Uint8Array): Promise<Uint8Array> {
  const ct = (b: Uint8Array) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return crypto.subtle
    .digest("SHA-256", ct(bytes))
    .then((buf) => new Uint8Array(buf));
}

/** WebCrypto PBKDF2-HMAC-SHA512 helper. */
export function pbkdf2Sha512WebCrypto(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyBits: number,
): Promise<Uint8Array> {
  const subtle = crypto.subtle;
  const ct = (b: Uint8Array) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return subtle
    .importKey("raw", ct(password), "PBKDF2", false, ["deriveBits"])
    .then((key) =>
      subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-512", salt: ct(salt), iterations },
        key,
        keyBits,
      ),
    )
    .then((bits) => new Uint8Array(bits));
}

// ---------------------------------------------------------
// 3. Candidate generation for recovery jobs
//    A recovery job supplies a TEMPLATE: known words, blanks,
//    and owner-supplied candidate fill words. The engine
//    enumerates deterministically and filters by the REAL
//    checksum (1/16 survive) — never invents words the owner
//    did not supply.
// ---------------------------------------------------------
export interface RecoveryTemplate {
  /** One entry per mnemonic position. null = blank. */
  slots: (string | null)[];
  /** Owner-supplied candidate words for blanks (in order). */
  candidates: string[];
}

export interface RecoveryCandidate {
  mnemonic: string;
  entropyHex: string;
}

/** Deterministic, bounded candidate enumeration for a
 *  recovery template, checksum-filtered. */
export async function enumerateRecoveryCandidates(
  template: RecoveryTemplate,
  limit: number,
): Promise<RecoveryCandidate[]> {
  const slotCount = template.slots.length;
  if (![12, 15, 18, 21, 24].includes(slotCount)) {
    throw new Error(`template has ${slotCount} slots - not a BIP39 length`);
  }
  const blankIdx: number[] = [];
  template.slots.forEach((s, i) => {
    if (s === null) blankIdx.push(i);
  });
  if (blankIdx.length === 0) {
    const check = await validateMnemonic(
      template.slots.join(" "),
      sha256WebCrypto,
    );
    if (check.kind !== "valid") return [];
    return [{ mnemonic: check.words.join(" "), entropyHex: check.entropyHex }];
  }
  const n = template.candidates.length;
  if (n === 0) return [];
  const results: RecoveryCandidate[] = [];
  const maxTried = Math.min(limit * 64, 2_000_000); // checksum ~1/16
  const counters = new Array(blankIdx.length).fill(0);
  let done = false;
  let tried = 0;
  while (!done && results.length < limit && tried < maxTried) {
    const words = template.slots.slice();
    for (let b = 0; b < blankIdx.length; b++) {
      words[blankIdx[b]] = template.candidates[counters[b] % n];
    }
    tried++;
    const mnemonic = words.join(" ");
    const check = await validateMnemonic(mnemonic, sha256WebCrypto);
    if (check.kind === "valid") {
      results.push({ mnemonic, entropyHex: check.entropyHex });
    }
    // odometer increment from the LAST blank
    let pos = blankIdx.length - 1;
    while (pos >= 0) {
      counters[pos]++;
      if (counters[pos] % n !== 0) break;
      if (pos === 0) done = true;
      pos--;
    }
  }
  return results;
}
