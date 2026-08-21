// The Operations Workspace shell (Platform Activation Slice 0, WP 0.5/0.6) — a minimal
// landing surface distinguishing "you are in Klussie Operations" from every other
// context, rendered by AppShell.jsx whenever the active workspace holds the
// platform_operations capability (ADR-0030). Reuses existing shell chrome and CSS
// classes only — no new design-system component for this shell itself.
//
// NOT ROUTED THROUGH useLang()/appStrings.js
//
// Every customer- and professional-facing screen in this codebase is localized across
// ten markets (src/lib/appStrings.js). This screen is not: its audience is company
// staff operating the platform, not a customer in any market the product serves — the
// same distinction ROADMAP_C_PLATFORM_OPERATIONS.md draws throughout between the
// customer/professional experiences and Platform Operations. Revisit this if that
// audience assumption ever changes.
//
// A REAL DEAD END, FOUND AND FIXED HERE — NOT JUST A DESIGN GAP
//
// This screen had no way to leave at all: no sign-out, no workspace switch, nothing.
// AppShell's own topbar (where WorkspaceSwitcher normally renders) is display:none below
// 460px — every real phone — so an operator who is also a real customer or pro (ADR-0030:
// "one identity, one login... a second membership the same way anyone gains a second
// workspace") had no way back to their own personal workspace on an actual device, and no
// way to sign out at all, on any device. Fixed with a minimal account-actions row, in
// this screen's own established hardcoded-English convention, not routed through
// WorkspaceSwitcher.jsx (which takes a localized `t` this screen deliberately has none of).
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { AuditLog } from "./AuditLog.jsx";
import { WorkspaceLookup } from "./WorkspaceLookup.jsx";

const TABS = [
  { id: "audit", label: "Audit" },
  { id: "workspaces", label: "Workspaces" },
];

export function OperatorApp() {
  const [tab, setTab] = useState("audit");
  // Bumped by WorkspaceLookup's "View audit trail" so the next Audit mount seeds its
  // workspace-id filter from it (AuditLog.jsx's own initialWorkspaceId prop) — a plain
  // id string is enough since AuditLog is remounted on every tab switch, never hidden.
  const [auditWorkspaceId, setAuditWorkspaceId] = useState(null);
  const { workspaceMemberships, activeWorkspace, setActiveWorkspaceId, signOut } = useAuth();

  const viewAuditFor = (workspaceId) => {
    setAuditWorkspaceId(workspaceId);
    setTab("audit");
  };

  return (
    <div className="pad">
      <div className="hello" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 22 }}>
        <div className="h1">Klussie Operations</div>
        <div className="fineprint" style={{ justifyContent: "flex-start" }}>Signed in as an operator.</div>
      </div>

      {workspaceMemberships.length >= 2 && (
        <div className="role-switch" style={{ marginBottom: 16 }}>
          <span className="role-switch-label">Workspace</span>
          <div className="segmented">
            {workspaceMemberships.map((m) => (
              <button
                key={m.workspace_id}
                className={activeWorkspace?.workspace_id === m.workspace_id ? "seg-on" : ""}
                onClick={() => setActiveWorkspaceId(m.workspace_id)}
              >
                {m.workspace_name || m.workspace_type}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Operations">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "seg-on" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "audit" && (
        <div style={{ marginTop: 16 }}>
          <AuditLog initialWorkspaceId={auditWorkspaceId} />
        </div>
      )}

      {tab === "workspaces" && (
        <div style={{ marginTop: 16 }}>
          <WorkspaceLookup onViewAudit={viewAuditFor} />
        </div>
      )}

      <button className="btn-secondary" style={{ marginTop: 20 }} onClick={signOut}><LogOut size={13} /> Sign out</button>
    </div>
  );
}
