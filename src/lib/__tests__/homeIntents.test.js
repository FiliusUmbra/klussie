// The intent configuration decides what Klussie asks and when it stops to warn
// somebody. Both are safety-adjacent enough to be worth pinning directly.
import { describe, it, expect } from "vitest";
import {
  HOME_INTENTS, findIntent, questionsFor, detectsHazard, composeIntentTranscript,
} from "../homeIntents.js";
import { HOME_STRINGS } from "../homeStrings.js";
import { FOLLOW_UP_STRINGS } from "../homeFollowUpStrings.js";

const LOCALES = Object.keys(HOME_STRINGS);

describe("intent catalogue", () => {
  it("offers exactly the five conversation starters, in order", () => {
    expect(HOME_INTENTS.map((i) => i.id)).toEqual(["broken", "improve", "maintain", "advice", "other"]);
  });

  it("has real localized copy behind every label and every question, in all 8 locales", () => {
    for (const locale of LOCALES) {
      for (const intent of HOME_INTENTS) {
        expect(HOME_STRINGS[locale][intent.labelKey], `${locale}/${intent.labelKey}`).toBeTruthy();
        for (const q of intent.questions) {
          expect(FOLLOW_UP_STRINGS[locale][q.questionKey], `${locale}/${q.questionKey}`).toBeTruthy();
        }
      }
    }
  });

  it("gives 'something else' no script, since that is the intent that did not fit one", () => {
    expect(findIntent("other").questions).toEqual([]);
    expect(findIntent("nope")).toBeNull();
  });

  it("keeps every question answerable by typing, speaking or showing", () => {
    for (const intent of HOME_INTENTS) {
      for (const q of intent.questions) {
        expect(["text", "photo"]).toContain(q.answerMode);
      }
    }
  });
});

describe("questionsFor", () => {
  it("asks everything while Klussie knows nothing about the home — today's real state", () => {
    expect(questionsFor("broken", new Set()).map((q) => q.id))
      .toEqual(["what", "where", "photo", "since", "urgent", "when"]);
  });

  it("stops asking what the home profile already answers", () => {
    const ids = questionsFor("broken", new Set(["rooms"])).map((q) => q.id);
    expect(ids).not.toContain("where");
    expect(ids).toContain("what");
  });

  it("accepts a plain array as well as a Set, so callers need not care", () => {
    expect(questionsFor("maintain", ["installations"]).map((q) => q.id)).not.toContain("saved");
  });

  it("returns nothing for an unknown intent rather than throwing", () => {
    expect(questionsFor("nonsense", new Set())).toEqual([]);
  });
});

describe("detectsHazard", () => {
  it.each([
    ["nl", "ik ruik gas in de keuken"],
    ["fr", "il y a une fuite de gaz"],
    ["de", "es gab einen kurzschluss"],
    ["en", "there is a gas leak under the sink"],
    ["tr", "mutfakta yangın var"],
    ["ru", "у нас утечка газа"],
    ["ar", "هناك تسرب غاز"],
    ["zh", "厨房煤气味很重"],
  ])("interrupts on a %s hazard description", (_locale, text) => {
    expect(detectsHazard(text)).toBe(true);
  });

  it("matches inside a compound word, which is how these read in Dutch and German", () => {
    expect(detectsHazard("gaslek achter de boiler")).toBe(true);
    expect(detectsHazard("Wasserschaden im Keller")).toBe(true);
  });

  it("ignores case", () => {
    expect(detectsHazard("GAS LEAK")).toBe(true);
  });

  it.each([
    "de kraan in de badkamer druppelt",
    // The two that made the first draft of this list useless: a dripping tap and a
    // boiler service are the most ordinary jobs in the catalogue, and a safety warning
    // on either is one customers learn to tap straight through.
    "mijn kraan lekt al twee dagen",
    "de gasketel moet onderhouden worden",
    "le robinet fuit",
  ])("leaves an ordinary repair alone: %s", (text) => {
    expect(detectsHazard(text)).toBe(false);
  });

  it("handles no input at all", () => {
    expect(detectsHazard("")).toBe(false);
    expect(detectsHazard(null)).toBe(false);
  });
});

describe("composeIntentTranscript", () => {
  it("keeps the question with its answer, so a one-word reply still means something", () => {
    const text = composeIntentTranscript({
      intentLabel: "Er is iets kapot",
      entries: [
        { question: "Wat werkt er niet?", answer: "de boiler" },
        { question: "Waar in je woning is dat?", answer: " kelder " },
      ],
    });
    expect(text).toBe("Er is iets kapot — Wat werkt er niet? de boiler — Waar in je woning is dat? kelder");
  });

  it("drops questions that were skipped rather than sending empty pairs to the model", () => {
    const text = composeIntentTranscript({
      intentLabel: "Ik heb advies nodig",
      entries: [{ question: "Waarover twijfel je?", answer: "" }, { question: "Kosten?", answer: "ja" }],
    });
    expect(text).toBe("Ik heb advies nodig — Kosten? ja");
  });
});
