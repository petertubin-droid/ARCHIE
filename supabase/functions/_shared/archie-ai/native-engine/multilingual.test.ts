// ============================================================
// ARCHIE MULTILINGUAL ENGINE — TESTS
// Detection determinism, honest notices, English never
// falsely flagged, answers never truncated.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  LANGUAGE_NAMES,
  LATIN_DETECT_THRESHOLD,
  detectLanguage,
  multilingualReply,
} from "./multilingual.ts";

describe("detectLanguage — English is never falsely flagged", () => {
  it("plain English detects as English, no notice", () => {
    const d = detectLanguage("How much cement do I need for a 20 sqm floor?");
    expect(d.language).toBe("en");
    expect(multilingualReply(d, "You need about 5 bags.")).toBe(
      "You need about 5 bags.",
    );
  });

  it("short casual English stays English", () => {
    expect(detectLanguage("yo what is the price today?").language).toBe("en");
    expect(detectLanguage("tell me about the estimate").language).toBe("en");
  });

  it("empty input defaults to English", () => {
    const d = detectLanguage("");
    expect(d.language).toBe("en");
    expect(d.method).toBe("default-english");
  });
});

describe("detectLanguage — Latin script wordlist detection", () => {
  it("French question detects", () => {
    const d = detectLanguage("Bonjour, comment est le prix du ciment aujourd'hui?");
    expect(d.language).toBe("fr");
    expect(d.confidence).toBeGreaterThanOrEqual(LATIN_DETECT_THRESHOLD);
  });

  it("Spanish question detects", () => {
    expect(detectLanguage("¿Cómo está el precio del cemento hoy?").language).toBe("es");
  });

  it("Portuguese question detects", () => {
    expect(detectLanguage("Você pode me dizer o preço do cimento?").language).toBe("pt");
  });

  it("Yoruba sentence detects", () => {
    expect(detectLanguage("Báwo ni o ṣe ṣe, ṣé o wà ní dáàbò bo?").language).toBe("yo");
  });

  it("Nigerian Pidgin detects", () => {
    expect(detectLanguage("Wetin be the price of cement, abeg no wahala").language).toBe("pcm");
  });

  it("Hausa sentence detects", () => {
    expect(detectLanguage("Yaya za a iya sanin farashin siminti a yau?").language).toBe("ha");
  });

  it("mixed/ambiguous text stays English — no false notice", () => {
    // one foreign word in an English sentence is not a language
    expect(detectLanguage("What is the meaning of bonjour in English?").language).toBe("en");
  });
});

describe("detectLanguage — script detection", () => {
  it("Arabic detects by script", () => {
    const d = detectLanguage("ما هو ثمن الأسمنت اليوم؟");
    expect(d.language).toBe("ar");
    expect(d.method).toBe("script");
  });

  it("Chinese detects by script", () => {
    expect(detectLanguage("今天水泥的价格是多少？").language).toBe("zh");
  });

  it("Russian detects by script", () => {
    expect(detectLanguage("Сколько стоит цемент сегодня?").language).toBe("ru");
  });

  it("Hindi detects by script", () => {
    expect(detectLanguage("आज सीमेंट की कीमत क्या है?").language).toBe("hi");
  });

  it("single stray script char does not trigger (needs 2+)", () => {
    expect(detectLanguage("price in naira и dollars").language).toBe("en");
  });
});

describe("multilingualReply — the honest notice contract", () => {
  it("notice precedes the untouched English answer", () => {
    const d = detectLanguage("Bonjour, comment est le prix du ciment?");
    const answer = "Cement is 4500 naira per bag in Lagos today.";
    const out = multilingualReply(d, answer);
    expect(out.startsWith("Je ne peux répondre qu'en anglais")).toBe(true);
    expect(out).toContain(answer); // answer never truncated
    expect(out).toContain(LANGUAGE_NAMES.fr);
  });

  it("is deterministic — same input, same output", () => {
    const d1 = detectLanguage("Wetin be the price abeg");
    const d2 = detectLanguage("Wetin be the price abeg");
    expect(multilingualReply(d1, "X")).toBe(multilingualReply(d2, "X"));
  });
});
