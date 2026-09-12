// Assembling the value behind LangContext: the merged string table, the locale-aware
// formatters, and the catalog lookups every screen reads through `useLang()`.
//
// Extracted from src/App.jsx's AppShell, which built all eleven of these inline before
// rendering. That put a dozen small decisions — which locales are right-to-left, what a
// missing catalog entry renders as, which badge tiers have a label — inside a component
// nothing could call. They are now one pure function of (langCode, catalog).
//
// src/lib/lang.js still owns the React context object and the useLang hook; this is only
// what goes into it.
import { LANGS } from "./lang.js";
import { APP_STRINGS } from "./appStrings.js";
import { HOME_STRINGS } from "./homeStrings.js";
import { FOLLOW_UP_STRINGS } from "./homeFollowUpStrings.js";
import { WHEN_LABEL_KEYS } from "./requestStatus.js";

// The right-to-left locales klussie ships. A set rather than an equality check, which is
// what made adding Persian a one-word edit here instead of a growing ternary.
const RTL_LANGS = new Set(["ar", "fa"]);

// Badge tiers that say something worth saying. Any other tier — including none — renders
// no badge rather than an empty one.
const PRO_BADGE_LABEL_KEYS = { top: "topRated", elite: "elitePro" };

/**
 * The lang context for a locale and a catalog.
 *
 * `catalog` is null until the fetch lands, and every lookup here tolerates that: the
 * shell renders its loading state, but nothing throws if a component reads through the
 * context first. Category and service lookups fall back to something displayable (the raw
 * id, an empty service) rather than undefined, because a missing translation should
 * degrade to a name, never to a blank screen.
 *
 * `setLangCode` is optional (every existing caller before LanguageSwitcher.jsx passes only
 * two arguments, and still gets a fully working, read-only context) — carrying it, and
 * `LANGS` itself, is what lets LanguageSwitcher.jsx render from `useLang()` alone, on any
 * screen, with no prop drilling back up to AppShell.jsx.
 */
export function buildLangContext(langCode, catalog, setLangCode) {
  const langMeta = LANGS.find((l) => l.code === langCode);

  // The homepage keeps its copy in its own modules so App's table didn't grow by ~90 keys
  // × 10 locales; merged here so `t` stays one flat lookup at every call site.
  const t = { ...APP_STRINGS[langCode], ...HOME_STRINGS[langCode], ...FOLLOW_UP_STRINGS[langCode] };

  return {
    t,
    langCode,
    LANGS,
    setLangCode,
    dir: RTL_LANGS.has(langCode) ? "rtl" : "ltr",
    // `options` passes straight through to toLocaleString — omitted, this is the same
    // bare thousands-separator formatting every existing caller (review counts, the
    // flexi-job ceiling) already relies on. PriceTag (design-system/primitives.jsx) is
    // the one caller that needs more: money always shown to the cent, never trailing a
    // dropped zero the way a bare toLocaleString() does for amounts like the platform
    // fee on a round quote (25.2 renders "25,2", not "25,20" — found live on the demo
    // invoice, Beta UX polish).
    fmt: (n, options) => Number(n).toLocaleString(langMeta.locale, options),
    // Found live during a UX review, 2026-09-12: a maintenance due date typed as
    // 1 December displayed as 30 November. Root cause — `new Date("2026-12-01")` parses a
    // bare date-only string as UTC midnight (the ES spec's own rule), and
    // toLocaleDateString() then renders it in the *viewer's* local zone; anyone west of
    // UTC (all of the Americas, and klussie's own stated multi-country ambition includes
    // exactly that) sees the previous calendar day. A full timestamp (created_at,
    // performed_at — this file's own callers pass both shapes, see langContext.test.js)
    // has no such bug: it names a real instant, and showing what local date that instant
    // falls on is correct, not a defect. Only a bare YYYY-MM-DD value — a due date, a
    // purchase date, a warranty expiry — names a calendar day with no instant attached,
    // and must render as that same day everywhere, never shifted by the viewer's offset.
    fmtDate: (ts) => {
      if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
        const [year, month, day] = ts.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(langMeta.locale);
      }
      return new Date(ts).toLocaleDateString(langMeta.locale);
    },
    CATS: catalog?.CATS ?? [],
    BASE_SERVICES: catalog?.BASE_SERVICES ?? [],
    catName: (id) => catalog?.CAT_I18N[langCode]?.[id] ?? id,
    serviceInfo: (id) => catalog?.SERVICE_I18N[langCode]?.[id] ?? { name: "", blurb: "" },
    proBadgeLabel: (tier) => t[PRO_BADGE_LABEL_KEYS[tier]] ?? null,
    whenLabel: (whenPref) => t[WHEN_LABEL_KEYS[whenPref]] ?? whenPref,
  };
}
