// The application chrome: the simulated phone frame, the language picker, the toast, and
// the decision about which surface is showing.
//
// It owns exactly three pieces of state that genuinely span the whole app — locale, the
// `role` toggle (see below), and the toast — plus the catalog fetch every screen reads
// through the lang context. Everything else belongs to a feature (src/customer, src/pro,
// src/auth).
//
// UNIFIED_PRODUCT_IA_REVIEW.md §10 item 2 — THE TOPBAR'S OWN customer/pro TOGGLE, RETIRED
//
// This used to render a segmented "Bekijken als" (previewing as) control here for anyone
// with fewer than two real workspace memberships — the only way, before this session's
// own PR #83/#84, to reach BecomeProPrompt at all. It is retired now, not merely hidden,
// because every real reason to keep it is gone: `role` is still real state
// (deriveEffectiveRole, workspaceContext.js, still consults it for the same population),
// but nothing sets it away from "customer" any more except BecomeProSheet's own onDone
// handler below — which only ever fires once a real Professional Workspace already
// exists (PR #84), at which point multiWorkspace becomes true and the real
// WorkspaceSwitcher takes over instead. Checked directly against staging before removing
// this: zero real pro accounts hold fewer than two real memberships (the one case this
// toggle's own fallback existed for). The `role` state and deriveEffectiveRole()'s own
// fallback to it stay untouched — real defence-in-depth for an environment without Epic
// 03's migrations, the same restraint that function's own comment already documents —
// only the topbar control a real person could tap is gone.
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../lib/auth.jsx";
import { LangContext } from "../lib/lang";
import { buildLangContext } from "../lib/langContext.js";
import { fetchCatalog } from "../lib/catalog";
import { HOME_CSS } from "../home/homeStyles.js";
import { APP_CSS } from "./appStyles.js";
import { WelcomeScreen } from "../auth/WelcomeScreen.jsx";
import { BecomeProPrompt } from "../profile/BecomeProPrompt.jsx";
import { BecomeProSheet } from "../profile/BecomeProSheet.jsx";
import { CustomerApp } from "../customer/CustomerApp.jsx";
import { ProApp } from "../pro/ProApp.jsx";
import { OperatorApp } from "../operator/OperatorApp.jsx";
import { LoadingScreen } from "../ui/Loading.jsx";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { deriveEffectiveRole } from "../lib/workspaceContext.js";
import { isOperatorWorkspace } from "../lib/operatorContext.js";

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
  const [operatorCheck, setOperatorCheck] = useState({ workspaceId: null, result: false });
  const toastTimer = useRef(null);
  const { session, loading: authLoading, proProfile, workspaceMemberships = [], activeWorkspace, setActiveWorkspaceId } = useAuth();

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

  // Platform Activation Slice 0, WP 0.5 — is the active workspace the internal
  // Operations Workspace (ADR-0030)? Re-checked whenever the active workspace changes
  // (the switcher, WP 03.12, is how a real operator who is also an ordinary customer
  // moves between the two). Keyed by workspace id rather than a flat boolean +
  // "resolving" flag: setting the flag back to null on every change would itself be a
  // synchronous setState inside the effect body (a lint error, and the underlying
  // problem it flags — a needless extra render). Keying the stored result to the
  // workspace id it was resolved for gets the same correctness — "still resolving"
  // becomes "the stored id doesn't match the current one" — from a single state update
  // that only ever happens inside the async callback below, never synchronously.
  useEffect(() => {
    const workspaceId = activeWorkspace?.workspace_id ?? null;
    if (!workspaceId) return undefined;
    let cancelled = false;
    isOperatorWorkspace(workspaceId).then((result) => {
      if (!cancelled) setOperatorCheck({ workspaceId, result });
    });
    return () => { cancelled = true; };
  }, [activeWorkspace?.workspace_id]);

  const activeWorkspaceId = activeWorkspace?.workspace_id ?? null;
  // True only while there is a real workspace to check and its result hasn't landed yet
  // — never true for a single-workspace person (activeWorkspaceId is null) or once the
  // matching result has arrived, including for a workspace that turned out not to be
  // the Operations Workspace.
  const operatorCheckPending = activeWorkspaceId !== null && operatorCheck.workspaceId !== activeWorkspaceId;
  const isOperator = operatorCheck.workspaceId === activeWorkspaceId && operatorCheck.result;

  const ctx = buildLangContext(langCode, catalog, setLangCode);
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

  // No classification gate anywhere below, deliberately (PLATFORM_DOMAIN_MODEL.md §27:
  // "The platform never asks a person to classify themselves"). Every signed-in session
  // lands straight in CustomerApp — its Personal Workspace — the moment its profile and
  // catalog are ready. "I offer services" is never a forced first question; it's
  // src/profile/Profile.jsx's own real, reachable invitation (UNIFIED_PRODUCT_IA_REVIEW.md
  // §5), always available, exactly matching "create an account, become a pro later."
  let body;
  if (authLoading || (session && !catalog && !catalogError) || (session && operatorCheckPending)) {
    body = <LoadingScreen />;
  } else if (catalogError) {
    body = <div className="pad"><div className="empty-block"><p>{catalogError}</p></div></div>;
  } else if (!session) {
    body = <WelcomeScreen />;
  } else if (isOperator) {
    // Platform Activation Slice 0, WP 0.5 — checked before the customer/pro branch
    // below, and never falls through to it: the Operations Workspace is neither a
    // customer nor a professional posture, and deriveEffectiveRole() (workspaceContext.js)
    // is left completely unconsulted here, exactly as it already is for a
    // single-workspace person (see that function's own comment).
    body = <OperatorApp />;
  } else if (effectiveRole === "pro") {
    body = proProfile ? (
      <ProApp showToast={showToast} />
    ) : (
      <BecomeProPrompt onStart={() => setBecomeProOpen(true)} />
    );
  } else {
    // UNIFIED_PRODUCT_IA_REVIEW.md §5 — the real, reachable entry point into
    // BecomeProSheet, alongside the topbar-only demo toggle below (still real for a
    // desktop-width session, but never the only path now).
    body = <CustomerApp showToast={showToast} onBecomePro={() => setBecomeProOpen(true)} />;
  }

  return (
    <LangContext.Provider value={ctx}>
      <div className="stage" dir={dir}>
        <style>{APP_CSS + HOME_CSS}</style>

        <div className="topbar">
          {session && multiWorkspace && <WorkspaceSwitcher t={t} />}
          <LanguageSwitcher />
        </div>

        <div className={`phone lang-${langCode}`}>
          <div className="notch" />
          {/* Literal escape sequences preserved verbatim — see the note in
              src/customer/ServiceSheet.jsx. */}
          <div className="statusbar"><span>9:41</span><span className="statusbar-dots">\u2022 \u2022 \u2022</span></div>
          <div className="screen">
            {body}
            {becomeProOpen && (
              <BecomeProSheet
                onClose={() => setBecomeProOpen(false)}
                onDone={(workspaceId) => {
                  setBecomeProOpen(false);
                  setRole("pro");
                  // 0168_professional_workspace_provisioning.sql's own consequence — see
                  // becomePro()'s own comment in auth.jsx for why this is now required,
                  // not optional, the instant a real second membership exists.
                  if (workspaceId) setActiveWorkspaceId(workspaceId);
                }}
              />
            )}
          </div>
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </LangContext.Provider>
  );
}
