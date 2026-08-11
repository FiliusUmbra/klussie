// The language/formatting context, split out of src/App.jsx so it can be imported
// without importing a component — the same shape src/lib/auth.jsx already uses for auth.
//
// App() is the only provider in production. It is separate from App.jsx so that tests can
// supply the same context around a single screen (Epic 03 WP12), and because a file that
// exports both a context and components breaks Fast Refresh.
import { createContext, useContext } from "react";

// The 10 supported locales. Moved here from src/App.jsx so modules outside that file
// (the speech recognizer needs the BCP-47 `locale`, not the 2-letter `code`) can read
// it without importing a component module.
//
// `code` is the key into every string table and into the database's locale columns
// (see 0017); `locale` is the BCP-47 tag used for number/date formatting and speech
// recognition. They differ on purpose: Arabic and Persian format against a plain language
// tag, the rest against the region klussie actually operates in.
//
// Each label is written in its own language, so someone who cannot read the current UI
// can still find theirs in the picker.
export const LANGS = [
  { code: "nl", label: "Nederlands", locale: "nl-BE" },
  { code: "fr", label: "Français", locale: "fr-BE" },
  { code: "de", label: "Deutsch", locale: "de-DE" },
  { code: "en", label: "English", locale: "en-GB" },
  { code: "es", label: "Español", locale: "es-ES" },
  { code: "ar", label: "العربية", locale: "ar" },
  { code: "fa", label: "فارسی", locale: "fa-IR" },
  { code: "tr", label: "Türkçe", locale: "tr-TR" },
  { code: "ru", label: "Русский", locale: "ru-RU" },
  { code: "zh", label: "中文", locale: "zh-CN" },
];

export function speechLocaleFor(langCode) {
  return (LANGS.find((l) => l.code === langCode) || LANGS[0]).locale;
}

// { t, dir, fmt, fmtDate, catName, serviceInfo, proBadgeLabel, langCode, CATS,
//   BASE_SERVICES, whenLabel } — assembled in App().
export const LangContext = createContext(null);

export function useLang() {
  return useContext(LangContext);
}
