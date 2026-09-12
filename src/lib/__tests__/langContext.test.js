// The lang context is read by every screen, so its failure modes are everyone's failure
// modes. The cases that matter are the degraded ones: no catalog yet, and a translation
// that doesn't exist.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildLangContext } from "../langContext.js";
import { LANGS } from "../lang.js";

const catalog = {
  CATS: [{ id: "plumbing" }],
  BASE_SERVICES: [{ id: "s1", cat: "plumbing" }],
  CAT_I18N: { nl: { plumbing: "Loodgieterij" }, en: { plumbing: "Plumbing" } },
  SERVICE_I18N: { nl: { s1: { name: "Kraan", blurb: "Blurb" } }, en: {} },
};

describe("buildLangContext", () => {
  it("merges the app, homepage and follow-up tables into one flat lookup", () => {
    const { t } = buildLangContext("en", catalog);
    expect(t.navDiscover).toBe("Discover");
    // A key from src/lib/homeStrings.js, proving the merge happened.
    expect(typeof t.helpReplayTour).toBe("string");
  });

  it("marks Arabic right-to-left and everything else left-to-right", () => {
    expect(buildLangContext("ar", catalog).dir).toBe("rtl");
    expect(buildLangContext("nl", catalog).dir).toBe("ltr");
    expect(buildLangContext("en", catalog).dir).toBe("ltr");
  });

  it("formats numbers and dates in the selected locale", () => {
    const { fmt, fmtDate } = buildLangContext("nl", catalog);
    expect(fmt(1234.5)).toBe((1234.5).toLocaleString("nl-BE"));
    const ts = Date.UTC(2026, 7, 11);
    expect(fmtDate(ts)).toBe(new Date(ts).toLocaleDateString("nl-BE"));
  });

  // Found live during a UX review, 2026-09-12: a maintenance due date typed as 1 December
  // displayed as 30 November. Root cause -- new Date("2026-12-01") parses a bare date-only
  // string as UTC midnight, and toLocaleDateString() renders it in the *viewer's* local
  // zone; anyone west of UTC sees the previous calendar day. Forcing TZ here is what makes
  // this reproduce (and stay caught) regardless of which timezone CI itself runs in.
  describe("fmtDate — a bare date-only value must not shift with the viewer's timezone", () => {
    // globalThis.process, not bare `process`: this file is linted with browser globals
    // (eslint.config.js scopes Node globals to api/** only), but the test still runs
    // under Node/vitest regardless, where process really is there at runtime.
    const originalTz = globalThis.process.env.TZ;
    beforeEach(() => { globalThis.process.env.TZ = "America/Los_Angeles"; });
    afterEach(() => { globalThis.process.env.TZ = originalTz; });

    it("keeps a due date, purchase date, or warranty date on the same calendar day everywhere", () => {
      const { fmtDate } = buildLangContext("nl", catalog);
      // The reference itself is built the same local-components way the fix uses, so this
      // genuinely fails against the old `new Date(ts).toLocaleDateString()` behaviour under
      // the forced timezone above -- not just self-consistent with the fix's own formula.
      expect(fmtDate("2026-12-01")).toBe(new Date(2026, 11, 1).toLocaleDateString("nl-BE"));
    });

    it("still shows a real timestamp (created_at, performed_at) shifted to the viewer's local day — unchanged, not a bug", () => {
      const { fmtDate } = buildLangContext("nl", catalog);
      const ts = "2026-08-12T02:00:00.000Z";
      expect(fmtDate(ts)).toBe(new Date(ts).toLocaleDateString("nl-BE"));
    });
  });

  it("passes an optional second argument straight through to toLocaleString — what PriceTag needs for money to always show two decimals", () => {
    const { fmt } = buildLangContext("nl", catalog);
    expect(fmt(25.2, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      (25.2).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
    // Every existing caller passes no second argument — must keep behaving exactly as
    // before, not silently gain a default.
    expect(fmt(25.2)).toBe((25.2).toLocaleString("nl-BE"));
  });

  it("survives being built before the catalog has loaded", () => {
    // AppShell renders its loading state in this window, but nothing may throw if a
    // component reads through the context first.
    const ctx = buildLangContext("nl", null);
    expect(ctx.CATS).toEqual([]);
    expect(ctx.BASE_SERVICES).toEqual([]);
    expect(ctx.catName("plumbing")).toBe("plumbing");
    expect(ctx.serviceInfo("s1")).toEqual({ name: "", blurb: "" });
  });

  it("falls back to the raw id rather than blank when a category has no translation", () => {
    const { catName } = buildLangContext("en", catalog);
    expect(catName("plumbing")).toBe("Plumbing");
    expect(catName("unknown-category")).toBe("unknown-category");
  });

  it("falls back to an empty service rather than undefined when one is missing", () => {
    // Every call site immediately reads `.name`; undefined here is a blank screen.
    expect(buildLangContext("en", catalog).serviceInfo("s1")).toEqual({ name: "", blurb: "" });
    expect(buildLangContext("nl", catalog).serviceInfo("s1").name).toBe("Kraan");
  });

  it("labels only the badge tiers that say something", () => {
    const { proBadgeLabel, t } = buildLangContext("en", catalog);
    expect(proBadgeLabel("top")).toBe(t.topRated);
    expect(proBadgeLabel("elite")).toBe(t.elitePro);
    expect(proBadgeLabel("regular")).toBeNull();
    expect(proBadgeLabel(undefined)).toBeNull();
  });

  it("carries LANGS and setLangCode through — what LanguageSwitcher.jsx renders from useLang() alone, no prop drilling", () => {
    const setLangCode = () => {};
    const ctx = buildLangContext("nl", catalog, setLangCode);
    expect(ctx.setLangCode).toBe(setLangCode);
    expect(ctx.LANGS).toEqual(LANGS);
  });

  it("still works with no setLangCode at all — every caller before LanguageSwitcher.jsx passed only two arguments", () => {
    const ctx = buildLangContext("nl", catalog);
    expect(ctx.setLangCode).toBeUndefined();
    expect(ctx.t.navDiscover).toBeDefined();
  });

  it("labels each timing, and passes an unrecognised one straight through", () => {
    const { whenLabel, t } = buildLangContext("en", catalog);
    expect(whenLabel("this_week")).toBe(t.whenThisWeek);
    expect(whenLabel("flexible")).toBe(t.whenFlexible);
    expect(whenLabel("some_day")).toBe("some_day");
  });

  it("builds without throwing for every locale klussie ships", () => {
    for (const { code } of LANGS) {
      const ctx = buildLangContext(code, catalog);
      expect(typeof ctx.fmt(1)).toBe("string");
      expect(ctx.t.navDiscover).toBeTruthy();
    }
  });
});
