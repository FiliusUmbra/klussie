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
import { CALM_CSS } from "./calmStyles.js";
import { WelcomeScreen } from "../auth/WelcomeScreen.jsx";
import { BecomeProPrompt } from "../profile/BecomeProPrompt.jsx";
import { BecomeProSheet } from "../profile/BecomeProSheet.jsx";
import { CustomerApp } from "../customer/CustomerApp.jsx";
import { ProApp } from "../pro/ProApp.jsx";
import { OperatorApp } from "../operator/OperatorApp.jsx";
import { LoadingScreen } from "../ui/Loading.jsx";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { FamilyApp } from "../family/FamilyApp.jsx";
import { familyStrings } from "../lib/familyStrings.js";
import { deriveEffectiveRole } from "../lib/workspaceContext.js";
import { isOperatorWorkspace } from "../lib/operatorContext.js";
import { getPreferredLangCode, setPreferredLangCode } from "../lib/langPreference.js";

// How long a toast stays up. Long enough to read a short confirmation, short enough that
// it never sits over the thing the customer tapped next.
const TOAST_DURATION_MS = 2600;

// 2026-09-30 — brought in from the parallel "Klussie via ChatGPT" pass on `main`
// (docs/product/FAMILY_RELEASE.md): a private Family workspace type (shared lists,
// chores, calendar), reachable from the header on every screen and from a persistent
// `/app/family` route (App.jsx's own SignedInShell). Re-platformed onto this session's
// own `.app-header`/`.app-shell` — the source version was written against the pre-redesign
// `.stage`/`.topbar`/`.phone` chrome this file replaced (see the `.app-header` comment
// below); FamilyApp.jsx/FamilyPanels.jsx/etc. themselves needed no changes — they render
// into their own `<div className="family-app">`, entirely independent of the shell around
// them.
//
// `familyRoute`/`onOpenFamily`/`onLeaveFamily`/`customerDestination`/`onCustomerNavigate`
// are all optional: undefined for every existing caller/test that doesn't pass them (this
// component's own local `familyEntry` state and CustomerApp's own local tab state keep
// working exactly as before), and supplied only by App.jsx's <SignedInShell>, which turns
// them into real browser URLs and Back-button support.
export function AppShell({ familyRoute = false, onOpenFamily, onLeaveFamily, customerDestination, onCustomerNavigate, proTab, onProNavigate, familySection, onFamilySectionChange }) {
  // Found live during a UX review, 2026-09-12: this had nowhere to live but memory --
  // every reload reverted to Dutch, for every one of the 10 shipped locales, no matter
  // what a customer had explicitly picked. getPreferredLangCode() (langPreference.js)
  // reads whatever this browser last set; "nl" only when nothing was ever chosen yet, or
  // localStorage itself is unavailable (private browsing).
  const [langCode, setLangCode] = useState(() => getPreferredLangCode() || "nl");
  const [role, setRole] = useState("customer");
  const [toast, setToast] = useState(null);
  const [catalog, setCatalog] = useState(null);
  // A boolean, not the raw error -- see the effect below for why.
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRetryToken, setCatalogRetryToken] = useState(0);
  const [becomeProOpen, setBecomeProOpen] = useState(false);
  const [operatorCheck, setOperatorCheck] = useState({ workspaceId: null, result: false });
  // Local fallback for whoever doesn't pass familyRoute/onOpenFamily (every test, and any
  // caller that never adopts real routing) — mirrors what CustomerApp.jsx's own local
  // `tab` state does for `destination`/`onNavigate` below. `familyId` carries the specific
  // family DailyHome.jsx's own "Family" shortcut was already looking at, so opening Family
  // from there lands on that family rather than whichever one loaded first.
  const [familyEntry, setFamilyEntry] = useState(null);
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

  // Found by code audit: a failed fetch here used to set catalogError to the raw
  // err.message -- a raw Postgres error, in English only, rendered as the ENTIRE app's
  // only visible content (below) for every signed-in person, in every locale, with no
  // way back in short of reloading the page. Now a boolean; the message shown is always
  // t.catalogLoadFailed, and catalogRetryToken gives an actual way to try again without
  // a reload, the same retry idiom MyBusinessPanel.jsx already established.
  useEffect(() => {
    fetchCatalog()
      .then((data) => { setCatalog(data); setCatalogError(false); })
      .catch(() => setCatalogError(true));
  }, [catalogRetryToken]);

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
  // Scoped to this session AND this workspace: switching workspaces (or signing out and
  // back in as someone else, in a test or a shared device) must not reopen a stale
  // family entry left over from before.
  const familyEntryMatches = familyEntry?.userId === session?.user?.id && familyEntry?.workspaceId === activeWorkspaceId;
  const familyOpen = !onOpenFamily && familyEntryMatches;
  const familyVisible = familyRoute || familyOpen;

  const ctx = buildLangContext(langCode, catalog, setLangCode);
  const { t, dir } = ctx;

  // Keep the document's lang attribute in sync with the selected locale —
  // index.html hardcodes lang="en", which screen readers use for
  // pronunciation rules regardless of what's actually on screen. See
  // docs/design/ACCESSIBILITY.md.
  useEffect(() => {
    document.documentElement.lang = langCode;
  }, [langCode]);

  // Remembers an explicit choice for next time (langPreference.js) -- a separate effect
  // from the one above on purpose: one keeps the DOM in sync for accessibility, this one
  // keeps localStorage in sync for persistence, and neither should have to care about the
  // other's reason for existing. Fires on the initial "nl" default too, which is a
  // harmless no-op write (setting the key to the value it already is, or to "nl" for a
  // browser that had never chosen anything) rather than something worth special-casing.
  useEffect(() => {
    setPreferredLangCode(langCode);
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
    body = (
      <div className="pad">
        <div className="empty-block">
          <p>{t.catalogLoadFailed}</p>
          <button type="button" className="btn-secondary" onClick={() => setCatalogRetryToken((n) => n + 1)}>
            {t.retryBtn}
          </button>
        </div>
      </div>
    );
  } else if (!session) {
    body = <WelcomeScreen />;
  } else if (familyVisible || activeWorkspace?.workspace_type === "family") {
    // Checked before operator/pro/customer — Family is neither of those, and a family
    // membership grants nothing beyond family.records.* (workspace.role_permissions,
    // this migration's own grants), so none of the branches below may ever be reached
    // while looking at one.
    body = (
      <FamilyApp
        section={familySection}
        onSectionChange={onFamilySectionChange}
        initialId={familyEntryMatches && familyEntry.familyId ? familyEntry.familyId : activeWorkspace?.workspace_type === "family" ? activeWorkspace.workspace_id : undefined}
        onClose={() => {
          setFamilyEntry(null);
          onLeaveFamily?.();
          // Only relevant when Family was reached by switching the active workspace to
          // one (not the header button's own overlay) — return to whichever personal
          // workspace this person also has, the same "land back on the Personal
          // Workspace" default the rest of this file already uses.
          if (activeWorkspace?.workspace_type === "family") {
            const personal = workspaceMemberships.find((m) => m.workspace_type === "personal");
            if (personal) setActiveWorkspaceId(personal.workspace_id);
          }
        }}
      />
    );
  } else if (isOperator) {
    // Platform Activation Slice 0, WP 0.5 — checked before the customer/pro branch
    // below, and never falls through to it: the Operations Workspace is neither a
    // customer nor a professional posture, and deriveEffectiveRole() (workspaceContext.js)
    // is left completely unconsulted here, exactly as it already is for a
    // single-workspace person (see that function's own comment).
    body = <OperatorApp />;
  } else if (effectiveRole === "pro") {
    body = proProfile ? (
      <ProApp showToast={showToast} tab={proTab} onNavigate={onProNavigate} />
    ) : (
      <BecomeProPrompt onStart={() => setBecomeProOpen(true)} />
    );
  } else {
    // UNIFIED_PRODUCT_IA_REVIEW.md §5 — the real, reachable entry point into
    // BecomeProSheet, alongside the topbar-only demo toggle below (still real for a
    // desktop-width session, but never the only path now).
    body = (
      <CustomerApp
        showToast={showToast}
        onBecomePro={() => setBecomeProOpen(true)}
        destination={customerDestination}
        onNavigate={onCustomerNavigate}
        onFamily={(familyId) => {
          setFamilyEntry({ userId: session.user.id, workspaceId: activeWorkspaceId, familyId });
          onOpenFamily?.();
        }}
      />
    );
  }

  return (
    <LangContext.Provider value={ctx}>
      <div className={`app-shell lang-${langCode}`} dir={dir}>
        <style>{APP_CSS + HOME_CSS + CALM_CSS}</style>

        {/* UX redesign, 2026-09-28 — replaces the fixed 390x820 simulated phone frame
            (painted notch, painted "9:41" status bar) that used to wrap the whole app on
            every viewport, desktop included. See appStyles.js's own header on .app-shell
            for the full reasoning and the real screenshot evidence this responds to.
            The header itself is new too: the old .topbar (workspace + language switcher)
            was hidden outright below 460px — the workspace switcher, a real control a
            multi-workspace pro or operator genuinely needs, was unreachable on any real
            phone. It renders on every viewport now.
            2026-09-30 — gained a Family entry point, brought in from the parallel
            "ChatGPT" pass (this file's own header). A visible, always-there button rather
            than folded into WorkspaceSwitcher: family membership is not a role switch
            (FAMILY_RELEASE.md — "no family membership grants property or professional
            access"), so it doesn't belong in the control built for role switching. */}
        <div className="app-header">
          <div className="app-header-brand">Klussie</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginInlineStart: "auto" }}>
            {session && (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "auto", minHeight: 44 }}
                aria-pressed={familyVisible || activeWorkspace?.workspace_type === "family"}
                onClick={() => (onOpenFamily ? onOpenFamily() : setFamilyEntry(familyOpen ? null : { userId: session.user.id, workspaceId: activeWorkspaceId }))}
              >
                {familyStrings(langCode).title}
              </button>
            )}
            {session && multiWorkspace && !familyVisible && activeWorkspace?.workspace_type !== "family" && (
              <WorkspaceSwitcher t={t} onSelect={() => { setFamilyEntry(null); onLeaveFamily?.(); }} />
            )}
            {/* The header is a real, light --surface background on every viewport now,
                never the old dark .topbar this component's own default styling was
                built for — light, matching Profile.jsx's own identical reasoning.
                2026-09-30 — tucked behind a disclosure (calmStyles.js's own
                .shell-preferences) now that Family and the workspace select can share
                this header too: three always-expanded controls competed for the same
                row, and language is the one changed least often. */}
            <details className="shell-preferences">
              <summary aria-label={t.languageSwitcherLabel}>{langCode.toUpperCase()}</summary>
              <div className="shell-preferences-panel">
                <LanguageSwitcher light />
              </div>
            </details>
          </div>
        </div>

        <div className="app-body">
          {body}
        </div>

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
        {/* Found by code audit: no aria-live/role anywhere on this -- the one shared
            toast every confirmation in the app goes through (a booking confirmed, a
            review sent, a quote sent, a request accepted...) appeared and
            disappeared with zero announcement to a screen reader. Matches
            ACCESSIBILITY.md's own named-but-unfixed "No live-region announcements
            exist for async state changes" gap exactly -- this single shared render
            site closes it for every toast in the app at once, not per call site. */}
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </LangContext.Provider>
  );
}
