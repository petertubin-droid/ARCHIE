// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — LANGUAGE DETECTOR
// supabase/functions/_shared/archie-ai/semantic-engine/language-detector.ts
//
// Identifies input language without mutating technical numbers,
// units, or proper nouns. Distinguishes detection from translation.
// =========================================================

export interface DetectedLanguage {
  code: string;
  name: string;
  confidence: number;
  isSupported: boolean;
}

const LANGUAGE_INDICATORS: Array<{
  code: string;
  name: string;
  strongPatterns: RegExp[];
  weakPatterns: RegExp[];
  weight: number;
}> = [
  {
    code: "yo",
    name: "Yoruba",
    strongPatterns: [/\b(bawo|se|kini|elo|odara|pupo|jowo|ejo|ile|eko|owo|ise|funmi|simenti|apo)\b/i, /[ẹọṣ]/i],
    weakPatterns: [/\b(da|ni|ti|si)\b/i],
    weight: 0.95,
  },
  {
    code: "ig",
    name: "Igbo",
    strongPatterns: [/\b(kedu|gini|olee|nnoo|biko|ego|ulo|nwere|onye|otu|anyi|mma|siminti)\b/i, /[ịọụ]/i],
    weakPatterns: [/\b(na|ka|ya)\b/i],
    weight: 0.95,
  },
  {
    code: "ha",
    name: "Hausa",
    strongPatterns: [/\b(sannu|yaya|nawa|ina|don|allah|gida|aiki|kudi|kyau|siminti)\b/i],
    weakPatterns: [/\b(da|ga|mai)\b/i],
    weight: 0.90,
  },
  {
    code: "fr",
    name: "French",
    strongPatterns: [/\b(calculer|combien|coute|materiaux|ciment|piece|mur|hauteur|largeur|longueur|sacs|dalle|beton|armee)\b/i, /[àâçéèêëîïôûùüÿœæ]/i],
    weakPatterns: [/\b(le|la|les|un|une|des|pour|dans|avec|sur)\b/i],
    weight: 0.90,
  },
  {
    code: "es",
    name: "Spanish",
    strongPatterns: [/\b(calcular|cuanto|cuesta|materiales|cemento|habitacion|pared|altura|ancho|largo|ladrillos|bolsas)\b/i, /[áéíóúñ¿¡]/i],
    weakPatterns: [/\b(el|la|los|las|un|una|por|para|con|de)\b/i],
    weight: 0.90,
  },
  {
    code: "de",
    name: "German",
    strongPatterns: [/\b(berechne|wieviel|kostet|materialien|zement|zimmer|wand|hoehe|breite|laenge|fuer|bitte)\b/i, /[äöüß]/i],
    weakPatterns: [/\b(der|die|das|und|in|mit)\b/i],
    weight: 0.90,
  },
  {
    code: "it",
    name: "Italian",
    strongPatterns: [/\b(calcola|quanto|costa|materiali|cemento|stanza|muro|parete|altezza|larghezza|lunghezza|per\s+favore)\b/i, /[àèéìòù]/i],
    weakPatterns: [/\b(il|la|gli|le|con|in)\b/i],
    weight: 0.90,
  },
  {
    code: "pt",
    name: "Portuguese",
    strongPatterns: [/\b(calcular|quanto|custa|materiais|cimento|quarto|parede|altura|largura|comprimento|tijolos)\b/i, /[ãõáéíóúç]/i],
    weakPatterns: [/\b(o|a|os|as|com|em)\b/i],
    weight: 0.90,
  },
  {
    code: "zh",
    name: "Chinese",
    strongPatterns: [/([\u4e00-\u9fa5]{2,})/],
    weakPatterns: [],
    weight: 0.95,
  },
  {
    code: "ar",
    name: "Arabic",
    strongPatterns: [/([\u0600-\u06FF]{2,})/],
    weakPatterns: [],
    weight: 0.95,
  },
];

export function detectLanguage(text: string): DetectedLanguage {
  const clean = text.trim();
  if (!clean) {
    return { code: "en", name: "English", confidence: 1.0, isSupported: true };
  }

  let bestLang: DetectedLanguage | null = null;
  let highestScore = 0;

  for (const lang of LANGUAGE_INDICATORS) {
    let strongMatches = 0;
    let weakMatches = 0;

    for (const pat of lang.strongPatterns) {
      if (pat.test(clean)) strongMatches++;
    }
    for (const pat of lang.weakPatterns) {
      if (pat.test(clean)) weakMatches++;
    }

    const score = strongMatches * 3 + weakMatches * 0.5;
    if (score > highestScore && strongMatches > 0) {
      highestScore = score;
      const conf = Math.min(0.99, lang.weight * (strongMatches / lang.strongPatterns.length + 0.4));
      bestLang = {
        code: lang.code,
        name: lang.name,
        confidence: Number(conf.toFixed(2)),
        isSupported: ["en", "es", "fr", "de", "yo", "ig", "ha"].includes(lang.code),
      };
    }
  }

  if (bestLang) {
    return bestLang;
  }

  // Default to English
  return {
    code: "en",
    name: "English",
    confidence: 0.90,
    isSupported: true,
  };
}
