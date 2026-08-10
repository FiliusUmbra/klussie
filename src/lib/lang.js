// The language/formatting context, split out of src/App.jsx so it can be imported
// without importing a component — the same shape src/lib/auth.jsx already uses for auth.
//
// App() is the only provider in production. It is separate from App.jsx so that tests can
// supply the same context around a single screen (Epic 03 WP12), and because a file that
// exports both a context and components breaks Fast Refresh.
import { createContext, useContext } from "react";

// { t, dir, fmt, fmtDate, catName, serviceInfo, proBadgeLabel, langCode, CATS,
//   BASE_SERVICES, whenLabel } — assembled in App().
export const LangContext = createContext(null);

export function useLang() {
  return useContext(LangContext);
}
