// The language picker — every locale this platform serves. Not only in AppShell's own
// topbar, which is display:none below 460px (appStyles.js) — every real phone; see
// WorkspaceSwitcher.jsx's own header comment for the identical reasoning, found and fixed
// the same way (WP "activate the engine" pass, 2026-08-22).
//
// Reads langCode/setLangCode/LANGS from useLang() rather than props — buildLangContext()
// (langContext.js) is where they join the shared `t` lookup every call site already reads
// through, so any screen renders one of these with no prop drilling back up to AppShell.
//
// `light`: the topbar's own styling (white text on semi-transparent white) is built for
// its dark background specifically; a second, differently-lit render site needs the light
// variant (.lang-switch-light) or the text is invisible — the identical concern
// WorkspaceSwitcher's own reuse in Profile already raised, resolved the same way.
import { Globe } from "lucide-react";
import { useLang } from "../lib/lang";

export function LanguageSwitcher({ light = false }) {
  const { langCode, setLangCode, LANGS } = useLang();

  return (
    <div className={light ? "lang-switch lang-switch-light" : "lang-switch"}>
      <Globe size={13} />
      <select value={langCode} onChange={(e) => setLangCode(e.target.value)} aria-label="Language">
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
