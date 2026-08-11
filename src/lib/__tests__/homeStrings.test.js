// Locale parity, checked mechanically.
//
// The app has 8 locales and one 3,900-line file where copy used to live; a key added
// to Dutch and forgotten everywhere else renders the raw key name to a French or
// Arabic customer, silently, with nothing failing. This is the check that turns that
// into a red test.
import { describe, it, expect } from "vitest";
import { HOME_STRINGS, interpolate } from "../homeStrings.js";
import { FOLLOW_UP_STRINGS } from "../homeFollowUpStrings.js";

const SUPPORTED = ["nl", "fr", "de", "en", "ar", "tr", "ru", "zh"];

describe.each([
  ["HOME_STRINGS", HOME_STRINGS],
  ["FOLLOW_UP_STRINGS", FOLLOW_UP_STRINGS],
])("%s", (_name, table) => {
  it("covers all 8 supported locales and no others", () => {
    expect(Object.keys(table).sort()).toEqual([...SUPPORTED].sort());
  });

  it("defines every Dutch key in every other locale", () => {
    const reference = Object.keys(table.nl).sort();
    for (const locale of SUPPORTED) {
      expect(Object.keys(table[locale]).sort(), `locale ${locale}`).toEqual(reference);
    }
  });

  it("has no empty or whitespace-only string anywhere", () => {
    for (const locale of SUPPORTED) {
      for (const [key, value] of Object.entries(table[locale])) {
        expect(typeof value, `${locale}.${key}`).toBe("string");
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("keeps the same placeholders in every translation of a template", () => {
    const placeholders = (s) => (s.match(/\{[a-z]+\}/gi) || []).sort();
    for (const key of Object.keys(table.nl)) {
      const expected = placeholders(table.nl[key]);
      for (const locale of SUPPORTED) {
        // A translation that drops {name} or {service} renders a sentence with a hole
        // in it — the failure mode this whole check exists for.
        expect(placeholders(table[locale][key]), `${locale}.${key}`).toEqual(expected);
      }
    }
  });
});

describe("the homepage strings that must not be Dutch-only", () => {
  it("never leaves 'apparel' anywhere near My Items — it means clothing", () => {
    for (const locale of SUPPORTED) {
      expect(HOME_STRINGS[locale].homeTabMyItems.toLowerCase()).not.toContain("apparel");
    }
  });

  it("keeps English's tab labels exactly as specified", () => {
    expect(HOME_STRINGS.en.homeTabKlussie).toBe("Klussie");
    expect(HOME_STRINGS.en.homeTabMyHome).toBe("My Home");
    expect(HOME_STRINGS.en.homeTabMyItems).toBe("My Items");
  });

  it("keeps the Dutch reference copy the brief specified verbatim", () => {
    expect(HOME_STRINGS.nl.homeQuestion).toBe("Waarmee kan Klussie je vandaag helpen?");
    expect(HOME_STRINGS.nl.todayHeading).toBe("Vandaag voor jouw woning");
    expect(HOME_STRINGS.nl.myHomeQuestion).toBe("Wat wil je over je woning bekijken of bijhouden?");
    expect(HOME_STRINGS.nl.myItemsQuestion).toBe("Wat wil je toevoegen of terugvinden?");
    expect(HOME_STRINGS.nl.homeComposerPlaceholder).toBe("Beschrijf kort wat er aan de hand is…");
  });
});

describe("interpolate", () => {
  it("fills every slot it is given", () => {
    expect(interpolate("{greeting}, {name}", { greeting: "Goedemiddag", name: "Cathy" }))
      .toBe("Goedemiddag, Cathy");
  });

  it("replaces every occurrence, not only the first", () => {
    expect(interpolate("{n} of {n}", { n: 2 })).toBe("2 of 2");
  });

  it("leaves an unfilled slot visible rather than blanking it", () => {
    // A literal "{name}" on screen is a bug somebody reports; an empty gap is a bug
    // nobody notices.
    expect(interpolate("hi {name}", {})).toBe("hi {name}");
  });

  it("survives a missing template", () => {
    expect(interpolate(undefined, { name: "x" })).toBe("");
  });
});
