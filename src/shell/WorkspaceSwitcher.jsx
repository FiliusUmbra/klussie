// Epic 03 WP12 — the identity switcher, PLATFORM_DOMAIN_MODEL.md §27.
//
// Renders nothing for fewer than two live memberships — "invisible for the single-workspace
// case... no switcher, no label, no explanation" (§27's own words). AppShell only mounts
// this component once it has already checked that count itself, so the null branch below is
// belt-and-braces, not the only guard.
//
// NO PRECEDING LABEL — UNIFIED_PRODUCT_IA_REVIEW.md §3, THE CPO MANDATE'S OWN "THE WORD
// WORKSPACE SHOULD DISAPPEAR"
//
// This used to render a `t.workspaceSwitchLabel` ("Workspace") above the pills — the one
// user-facing appearance of the word in the whole product, contradicting this exact
// component's own established "recognition, not reading" philosophy one line below: real
// names ("My Home", a business's own name) need no caption explaining what they are.
//
// "Recognition, not reading": buttons show the workspace's own name (set at creation —
// migration 0033/0034's backfill named every existing workspace "My Home" or the pro's
// business name), never a raw id, and — since this same review — never the raw
// backend `workspace_type` string either (humanWorkspaceName(), workspaceContext.js).
import { useAuth } from "../lib/auth.jsx";
import { humanWorkspaceName } from "../lib/workspaceContext.js";

export function WorkspaceSwitcher({ t }) {
  const { workspaceMemberships, activeWorkspace, setActiveWorkspaceId } = useAuth();

  if (workspaceMemberships.length < 2) return null;

  return (
    <div className="role-switch">
      <div className="segmented">
        {workspaceMemberships.map((m) => (
          <button
            key={m.workspace_id}
            className={activeWorkspace?.workspace_id === m.workspace_id ? "seg-on" : ""}
            onClick={() => setActiveWorkspaceId(m.workspace_id)}
          >
            {humanWorkspaceName(m, t)}
          </button>
        ))}
      </div>
    </div>
  );
}
