// A key added to nl and forgotten in ar renders `undefined` to a real customer in a
// language nobody on the team reads. This is the check that makes that fail in CI
// instead — the reason the table was worth extracting into a module of its own.
import { describe, it, expect } from "vitest";
import { APP_STRINGS } from "../appStrings.js";
import { HOME_STRINGS } from "../homeStrings.js";
import { FOLLOW_UP_STRINGS } from "../homeFollowUpStrings.js";
import { LANGS } from "../lang.js";

const REFERENCE_LOCALE = "nl";

describe("APP_STRINGS", () => {
  it("covers every locale klussie offers in its language picker", () => {
    for (const { code } of LANGS) {
      expect(APP_STRINGS[code], `missing locale ${code}`).toBeDefined();
    }
  });

  it("defines exactly the same keys in every locale", () => {
    const reference = Object.keys(APP_STRINGS[REFERENCE_LOCALE]).sort();
    for (const code of Object.keys(APP_STRINGS)) {
      const missing = reference.filter((k) => !(k in APP_STRINGS[code]));
      const extra = Object.keys(APP_STRINGS[code]).filter((k) => !reference.includes(k));
      expect(missing, `${code} is missing keys`).toEqual([]);
      expect(extra, `${code} has keys no other locale has`).toEqual([]);
    }
  });

  it("has no empty strings, which render as an invisible label", () => {
    for (const [code, table] of Object.entries(APP_STRINGS)) {
      for (const [key, value] of Object.entries(table)) {
        expect(typeof value, `${code}.${key} is not a string`).toBe("string");
        expect(value.trim(), `${code}.${key} is blank`).not.toBe("");
      }
    }
  });
});

describe("the merged lookup AppShell builds", () => {
  // The three tables are spread into one flat `t`. A key defined in two of them means one
  // silently wins — which is fine as an accident today and a bug the day someone edits
  // the losing copy and sees nothing change.
  it("keeps the app, homepage and follow-up tables free of overlapping keys", () => {
    for (const code of Object.keys(APP_STRINGS)) {
      const app = new Set(Object.keys(APP_STRINGS[code]));
      const home = Object.keys(HOME_STRINGS[code] ?? {});
      const followUp = Object.keys(FOLLOW_UP_STRINGS[code] ?? {});

      expect(home.filter((k) => app.has(k)), `${code}: homeStrings collides with appStrings`).toEqual([]);
      expect(followUp.filter((k) => app.has(k)), `${code}: followUpStrings collides with appStrings`).toEqual([]);
      expect(
        followUp.filter((k) => home.includes(k)),
        `${code}: followUpStrings collides with homeStrings`
      ).toEqual([]);
    }
  });
});
