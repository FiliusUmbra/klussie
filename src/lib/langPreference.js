// Found live during a UX review, 2026-09-12: AppShell.jsx's own langCode state
// (`useState("nl")`) had nowhere to live but memory — every reload, for every one of the
// 10 shipped locales, silently reverted to Dutch. Not a subtle edge case: it is the whole
// point of shipping 10 languages that a non-Dutch speaker gets to keep their own.
//
// CLIENT-ONLY, DELIBERATELY — SAME REASONING AS workspacePreference.js
//
// No column on public.profiles carries a language preference today, and inventing one
// here would be exactly the kind of schema decision a work package titled "remember the
// language picker" should not make unilaterally. This module is the identical shape
// workspacePreference.js already established for the same reason.
//
// NOT PERSON-SCOPED, UNLIKE workspacePreference.js — ON PURPOSE
//
// A workspace choice is genuinely personal (which of *my* memberships am I acting as);
// a language is closer to a device setting, and the more helpful default on a shared
// device is "whatever this browser was last set to," regardless of which account is
// currently signed in — a household member switching accounts on the same phone should
// not have to re-pick Arabic every time. Wrapped in try/catch for the same private-
// browsing modes that throw on localStorage access there.
import { LANGS } from "./lang.js";

const STORAGE_KEY = "klussie.langCode";

export function getPreferredLangCode() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Never trust a stored value blindly -- a locale a past version shipped and this one
    // dropped should fall back to the default, not to a code no string table has.
    return LANGS.some((l) => l.code === stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setPreferredLangCode(langCode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, langCode);
  } catch {
    // Private-browsing modes throw. The switch still works for this session via React
    // state (AppShell) -- it just won't be remembered on the next visit.
  }
}
