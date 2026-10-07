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
// "Recognition, not reading": the option list shows the workspace's own name (set at
// creation — migration 0033/0034's backfill named every existing workspace "My Home" or
// the pro's business name), never a raw id, and — since this same review — never the raw
// backend `workspace_type` string either (humanWorkspaceName(), workspaceContext.js).
//
// A SELECT, NOT SEGMENTED BUTTONS — brought in 2026-09-30 from the parallel "Klussie via
// ChatGPT" pass ("replaced competing workspace pills with one compact selector"): once the
// header could also hold a Family entry point and a language switcher alongside this, a
// segmented button row that grows with every membership stopped being "compact" the moment
// a third or fourth real workspace existed. A native select stays one control regardless
// of how many memberships a person has.
import { useAuth } from "../lib/auth.jsx";
import { workspaceOptionLabel } from "../lib/workspaceContext.js";

export function WorkspaceSwitcher({ t, onSelect }) {
  const { workspaceMemberships, activeWorkspace, setActiveWorkspaceId } = useAuth();

  if (workspaceMemberships.length < 2) return null;

  const activeId = activeWorkspace?.workspace_id || workspaceMemberships[0].workspace_id;

  return (
    <div className="role-switch">
      <select
        className="place-picker"
        aria-label={t.workspaceSwitchAria}
        value={activeId}
        onChange={(event) => { setActiveWorkspaceId(event.target.value); onSelect?.(); }}
      >
        {workspaceMemberships.map((m) => (
          <option key={m.workspace_id} value={m.workspace_id}>
            {workspaceOptionLabel(m, t)}
          </option>
        ))}
      </select>
    </div>
  );
}
