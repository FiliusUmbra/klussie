// The language/formatting context, split out of src/App.jsx so it can be imported
// without importing a component — the same shape src/lib/auth.jsx already uses for auth.
//
// App() is the only provider in production. It is separate from App.jsx so that tests can
// supply the same context around a single screen (Epic 03 WP12), and because a file that
// exports both a context and components breaks Fast Refresh.
import { createContext, useContext } from "react";

// The 8 supported locales. Moved here from src/App.jsx so modules outside that file
// (the speech recognizer needs the BCP-47 `locale`, not the 2-letter `code`) can read
// it without importing a 3,900-line component module.
export const LANGS = [
  { code: "nl", label: "Nederlands", locale: "nl-BE" },
  { code: "fr", label: "Français", locale: "fr-BE" },
  { code: "de", label: "Deutsch", locale: "de-DE" },
  { code: "en", label: "English", locale: "en-GB" },
  { code: "ar", label: "العربية", locale: "ar" },
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
