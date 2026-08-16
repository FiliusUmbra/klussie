// Epic 03 WP12 — the workspace switcher, PLATFORM_DOMAIN_MODEL.md §27.
//
// Renders nothing for fewer than two live memberships — "invisible for the single-workspace
// case... no switcher, no label, no explanation" (§27's own words). AppShell only mounts
// this component once it has already checked that count itself, so the null branch below is
// belt-and-braces, not the only guard.
//
// "Recognition, not reading": buttons show the workspace's own name (set at creation —
// migration 0033/0034's backfill named every existing workspace "My Home" or the pro's
// business name), never a raw id. A null name — nothing populates that today, but the
// column has always been nullable (migration 0030) — falls back to the type, so a button
// is never blank.
import { useAuth } from "../lib/auth.jsx";

export function WorkspaceSwitcher({ t }) {
  const { workspaceMemberships, activeWorkspace, setActiveWorkspaceId } = useAuth();

  if (workspaceMemberships.length < 2) return null;

  return (
    <div className="role-switch">
      <span className="role-switch-label">{t.workspaceSwitchLabel}</span>
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
  );
}
