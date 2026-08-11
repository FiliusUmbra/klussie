// Locale parity, checked mechanically.
//
// A key added to Dutch and forgotten everywhere else renders the raw key name to a
// French or Persian customer, silently, with nothing failing. This is the check that
// turns that into a red test.
//
// The locale list is derived from LANGS rather than repeated here on purpose: LANGS is
// what fills the language picker, so a locale offered to customers but missing from a
// string table now fails here instead of shipping a screen full of key names. Adding a
// language means adding it in one place and being told exactly what is still missing.
import { describe, it, expect } from "vitest";
import { HOME_STRINGS, interpolate } from "../homeStrings.js";
import { FOLLOW_UP_STRINGS } from "../homeFollowUpStrings.js";
import { APP_STRINGS } from "../appStrings.js";
import { LANGS } from "../lang.js";

const SUPPORTED = LANGS.map((l) => l.code);

describe.each([
  ["APP_STRINGS", APP_STRINGS],
  ["HOME_STRINGS", HOME_STRINGS],
  ["FOLLOW_UP_STRINGS", FOLLOW_UP_STRINGS],
])("%s", (_name, table) => {
  it("covers every locale the language picker offers, and no others", () => {
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

describe("right-to-left locales", () => {
  it("ships a string table for every RTL language the picker offers", () => {
    // Arabic and Persian share a script but not a language; a Persian customer getting
    // Arabic copy would be the shortcut worth failing over.
    for (const code of ["ar", "fa"]) {
      expect(SUPPORTED, `${code} missing from LANGS`).toContain(code);
      expect(HOME_STRINGS[code], `${code} missing from HOME_STRINGS`).toBeDefined();
    }
    expect(HOME_STRINGS.fa.homeTabMyHome).not.toBe(HOME_STRINGS.ar.homeTabMyHome);
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
