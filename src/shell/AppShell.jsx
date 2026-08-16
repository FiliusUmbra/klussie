// The application chrome: the simulated phone frame, the language picker, the
// customer/professional preview switch, the toast, and the decision about which surface
// is showing.
//
// It owns exactly three pieces of state that genuinely span the whole app — locale, the
// previewed role, and the toast — plus the catalog fetch every screen reads through the
// lang context. Everything else belongs to a feature (src/customer, src/pro, src/auth).
//
// The lang context value itself is built by src/lib/langContext.js, so the formatters and
// catalog lookups are testable without rendering anything.
import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { LangContext, LANGS } from "../lib/lang";
import { buildLangContext } from "../lib/langContext.js";
import { fetchCatalog } from "../lib/catalog";
import { HOME_CSS } from "../home/homeStyles.js";
import { APP_CSS } from "./appStyles.js";
import { WelcomeScreen } from "../auth/WelcomeScreen.jsx";
import { RoleSelectionScreen } from "../auth/RoleSelectionScreen.jsx";
import { BecomeProPrompt } from "../profile/BecomeProPrompt.jsx";
import { BecomeProSheet } from "../profile/BecomeProSheet.jsx";
import { CustomerApp } from "../customer/CustomerApp.jsx";
import { ProApp } from "../pro/ProApp.jsx";
import { LoadingScreen } from "../ui/Loading.jsx";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.jsx";
import { deriveEffectiveRole } from "../lib/workspaceContext.js";

// How long a toast stays up. Long enough to read a short confirmation, short enough that
// it never sits over the thing the customer tapped next.
const TOAST_DURATION_MS = 2600;

export function AppShell() {
  const [langCode, setLangCode] = useState("nl");
  const [role, setRole] = useState("customer");
  const [toast, setToast] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [becomeProOpen, setBecomeProOpen] = useState(false);
  const toastTimer = useRef(null);
  const { session, loading: authLoading, profile, proProfile, workspaceMemberships = [], activeWorkspace } = useAuth();

  // Epic 03 WP12 — only a person with two or more REAL, resolved workspaces (today: an
  // existing pro's Personal + Professional pair, WP 03.03/03.04's backfill) gets the real
  // switcher; everyone else — zero or one membership, or an environment without Epic 03's
  // migrations, where this is always [] — keeps the exact pre-Epic-03 `role` toggle below,
  // untouched. See workspaceContext.js's resolveActiveWorkspace for why the personal
  // workspace is the default landing view rather than an unresolved choice.
  const multiWorkspace = workspaceMemberships.length >= 2;
  const effectiveRole = deriveEffectiveRole({ multiWorkspace, activeWorkspace, role });

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch((err) => setCatalogError(err.message));
  }, []);

  const ctx = buildLangContext(langCode, catalog);
  const { t, dir } = ctx;

  // Keep the document's lang attribute in sync with the selected locale —
  // index.html hardcodes lang="en", which screen readers use for
  // pronunciation rules regardless of what's actually on screen. See
  // docs/design/ACCESSIBILITY.md.
  useEffect(() => {
    document.documentElement.lang = langCode;
  }, [langCode]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  let body;
  if (authLoading || (session && !catalog && !catalogError)) {
    body = <LoadingScreen />;
  } else if (catalogError) {
    body = <div className="pad"><div className="empty-block"><p>{catalogError}</p></div></div>;
  } else if (!session) {
    body = <WelcomeScreen />;
  } else if (profile && !profile.onboarding_role_selected) {
    body = <RoleSelectionScreen onProSelected={() => setRole("pro")} />;
  } else if (effectiveRole === "pro") {
    body = proProfile ? (
      <ProApp showToast={showToast} />
    ) : (
      <BecomeProPrompt onStart={() => setBecomeProOpen(true)} />
    );
  } else {
    body = <CustomerApp showToast={showToast} />;
  }

  return (
    <LangContext.Provider value={ctx}>
      <div className="stage" dir={dir}>
        <style>{APP_CSS + HOME_CSS}</style>

        <div className="topbar">
          {session && (multiWorkspace ? (
            <WorkspaceSwitcher t={t} />
          ) : (
            <div className="role-switch">
              <span className="role-switch-label">{t.previewingAs}</span>
              <div className="segmented">
                <button className={role === "customer" ? "seg-on" : ""} onClick={() => setRole("customer")}>{t.roleCustomer}</button>
                <button className={role === "pro" ? "seg-on" : ""} onClick={() => setRole("pro")}>{t.rolePro}</button>
              </div>
            </div>
          ))}
          <div className="lang-switch">
            <Globe size={13} color="#c9d6cd" />
            <select value={langCode} onChange={(e) => setLangCode(e.target.value)}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className={`phone lang-${langCode}`}>
          <div className="notch" />
          {/* Literal escape sequences preserved verbatim — see the note in
              src/customer/ServiceSheet.jsx. */}
          <div className="statusbar"><span>9:41</span><span className="statusbar-dots">\u2022 \u2022 \u2022</span></div>
          <div className="screen">
            {body}
            {becomeProOpen && <BecomeProSheet onClose={() => setBecomeProOpen(false)} onDone={() => { setBecomeProOpen(false); setRole("pro"); }} />}
          </div>
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </LangContext.Provider>
  );
}
