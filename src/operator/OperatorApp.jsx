// The Operations shell (Platform Activation Slice 0, WP 0.5/0.6), rendered by
// AppShell.jsx whenever the active workspace holds the platform_operations capability
// (ADR-0030). Reuses existing shell chrome and CSS classes only — no new design-system
// component for this shell itself.
//
// UNIFIED_PRODUCT_IA_REVIEW.md §1/§9.5 — THE SAME SHELL PATTERN CUSTOMER AND PRO ALREADY
// SHARE, NOT A SEPARATE ONE
//
// This screen used to be the single biggest "separate application" signal in the
// product: its own full-page "Klussie Operations" heading (a second product identity),
// a top segmented control instead of the bottom tab bar every other experience uses, and
// a "Workspaces" tab with no equivalent of the account-actions row Customer/Pro both
// keep in their own Profile tab. Fixed to the identical pattern: BottomNav, the same
// component (src/ui/BottomNav.jsx) Customer and Pro already share, and a Profile tab
// holding exactly what src/profile/Profile.jsx (UNIFIED_PROFILE_DESIGN.md) holds
// in the same place — identity, the switcher, sign-out — not a bespoke account-actions row
// bolted onto the bottom of every tab.
//
// A SMALL "Operations" LABEL STAYS, DELIBERATELY, IN PROFILE ONLY — NOT VANITY BRANDING
//
// An operator who is also a real customer or pro (ADR-0030) can genuinely lose track of
// which mode they're in without any signal at all — Customer/Pro don't need one because
// their own tab icons and content already make that obvious; this screen's own content
// (an audit log, a workspace lookup tool) is distinctive enough day to day, but Profile
// — the one tab that's otherwise near-identical in shape to Customer/Pro's own — still
// benefits from saying so once. Reworded and demoted from a page-dominating heading to
// a small label, and moved off every tab onto the one where "who am I" already belongs.
//
// NOT ROUTED THROUGH useLang()/appStrings.js — A DELIBERATE, STATED EXEMPTION, NOT A
// SILENT ONE (UNIFIED_PRODUCT_IA_REVIEW.md §1's own open question, resolved here)
//
// Every customer- and professional-facing screen in this codebase is localized across
// ten markets. This screen is not: its audience is company staff operating the
// platform, not a customer in any market the product serves — the same distinction
// ROADMAP_C_PLATFORM_OPERATIONS.md draws throughout between the customer/professional
// experiences and Platform Operations, and the same reasoning the review's own §2
// draws when it treats "Workspace Lookup" as legitimate internal vocabulary rather
// than a word to hide: operators are the internal team, not ordinary users, and
// precise backend terms are a tool for them, not a leak. Revisit only if that audience
// assumption changes — an operator surface a customer-facing person could ever see.
import { useState } from "react";
import { ScrollText, Search, User } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { WorkspaceSwitcher } from "../shell/WorkspaceSwitcher.jsx";
import { SignOutButton } from "../profile/SignOutButton.jsx";
import { BottomNav } from "../ui/BottomNav.jsx";
import { AuditLog } from "./AuditLog.jsx";
import { WorkspaceLookup } from "./WorkspaceLookup.jsx";

// UNIFIED_PROFILE_DESIGN.md §5 step 4 — the real WorkspaceSwitcher/SignOutButton,
// not a hand-written second implementation. The switcher used to reimplement
// humanWorkspaceName's own segmented-control markup inline here; that was worse than
// duplicated, it was a *third* independent copy that had already silently drifted once
// (PR #85 fixed the shared component's fallback label, and this file needed its own,
// separate fix). This screen's own established convention is hardcoded English throughout
// (see this file's own header), so a plain object stands in for the localized `t` the
// shared component otherwise expects.
const OPERATOR_FALLBACK_LABELS = { workspaceFallbackHome: "Home", workspaceFallbackBusiness: "Business" };

const TABS = [
  { id: "audit", label: "Audit", icon: ScrollText },
  { id: "lookup", label: "Workspaces", icon: Search },
  { id: "profile", label: "Profile", icon: User },
];

export function OperatorApp() {
  const [tab, setTab] = useState("audit");
  // Bumped by WorkspaceLookup's "View audit trail" so the next Audit mount seeds its
  // workspace-id filter from it (AuditLog.jsx's own initialWorkspaceId prop) — a plain
  // id string is enough since AuditLog is remounted on every tab switch, never hidden.
  const [auditWorkspaceId, setAuditWorkspaceId] = useState(null);
  const { signOut } = useAuth();

  const viewAuditFor = (workspaceId) => {
    setAuditWorkspaceId(workspaceId);
    setTab("audit");
  };

  return (
    <div className="view">
      <div className="content">
        {tab === "audit" && (
          <div className="pad">
            <AuditLog initialWorkspaceId={auditWorkspaceId} />
          </div>
        )}

        {tab === "lookup" && (
          <div className="pad">
            <WorkspaceLookup onViewAudit={viewAuditFor} />
          </div>
        )}

        {tab === "profile" && (
          <div className="pad">
            <div className="hello" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, marginBottom: 18 }}>
              <div className="fineprint" style={{ justifyContent: "flex-start" }}>Operations</div>
              <div className="h1">Signed in as an operator</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <WorkspaceSwitcher t={OPERATOR_FALLBACK_LABELS} />
            </div>

            <SignOutButton onClick={signOut} label="Sign out" />
          </div>
        )}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={TABS} />
    </div>
  );
}
