// Platform Activation Slice 1, WP 1.1a — Workspace lookup's read-only half
// (PLATFORM_ACTIVATION_PROGRAMME.md's own Slice 1 entry). Reads through
// api.search_workspaces() (migration 0138). Same plain, compliance-surface treatment as
// AuditLog.jsx — Card, Badge, no JobCard-style warmth — and the same loading idiom
// (result keyed by the exact query it was fetched for, never a synchronous setState in
// the effect body).
//
// "View audit trail" hands a workspace id to the Audit tab rather than duplicating any
// of AuditLog's own fetch/render logic here — one read surface per real question, per
// the same restraint every other panel in this codebase already holds.
//
// "Request access" (Support access, WP S.1) opens SupportAccessSheet in place, self-
// contained here rather than threaded up to OperatorApp.jsx the way "View audit trail"
// is — unlike that button, granting access never needs to change what this screen's own
// search results show, so there is no cross-component state to lift.
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, Badge } from "../design-system";
import { useAuth } from "../lib/auth.jsx";
import { searchWorkspaces, WORKSPACE_LOOKUP_PAGE_SIZE } from "../lib/workspaceLookup";
import { SupportAccessSheet } from "./SupportAccessSheet.jsx";

function truncateId(id) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function WorkspaceLookup({ onViewAudit }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [accessWorkspace, setAccessWorkspace] = useState(null);
  // Keyed by the exact `appliedQuery` value the fetch was made for — the same identity/
  // value-comparison shape AuditLog.jsx's own `result` state already uses, avoiding a
  // synchronous setState inside the effect body (react-hooks/set-state-in-effect).
  // `query: null` on purpose, not "" — it must never equal the initial `appliedQuery`
  // value, or `loading` below would read false before the first fetch has even started.
  const [result, setResult] = useState({ query: null, profiles: [], hasMore: false });

  useEffect(() => {
    let cancelled = false;
    searchWorkspaces({ query: appliedQuery, offset: 0 }).then((page) => {
      if (cancelled) return;
      setResult({ query: appliedQuery, profiles: page, hasMore: page.length === WORKSPACE_LOOKUP_PAGE_SIZE });
    });
    return () => { cancelled = true; };
  }, [appliedQuery]);

  const loading = result.query !== appliedQuery;
  const { profiles, hasMore } = result;

  const loadMore = async () => {
    const page = await searchWorkspaces({ query: appliedQuery, offset: profiles.length });
    setResult((prev) => ({ ...prev, profiles: [...prev.profiles, ...page], hasMore: page.length === WORKSPACE_LOOKUP_PAGE_SIZE }));
  };

  const applyQuery = (e) => {
    e.preventDefault();
    setAppliedQuery(query);
  };

  const clearQuery = () => {
    setQuery("");
    setAppliedQuery("");
  };

  return (
    <div>
      <form onSubmit={applyQuery} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Name, owner, property or workspace id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search workspaces"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn-primary">
          <Search size={14} /> Search
        </button>
        <button type="button" className="btn-secondary" onClick={clearQuery}>Clear</button>
      </form>

      {loading && <div className="empty-block"><p>Loading…</p></div>}

      {!loading && profiles.length === 0 && (
        <div className="empty-block"><p>No matching workspaces.</p></div>
      )}

      {!loading && profiles.map((profile) => (
        <Card key={profile.id} className="workspace-lookup-card" style={{ marginBottom: 10, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>{profile.name || "(unnamed workspace)"}</strong>
            <Badge tone={profile.archivedAt ? "amber" : "sage"}>{profile.type}</Badge>
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
            {truncateId(profile.id)} · owner {profile.ownerName || "—"}
            {profile.ownerEmail ? ` (${profile.ownerEmail})` : ""}
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 2 }}>
            {profile.propertyCount} {profile.propertyCount === 1 ? "property" : "properties"} ·{" "}
            {profile.membershipCount} {profile.membershipCount === 1 ? "member" : "members"} · created{" "}
            {formatDate(profile.createdAt)}
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 2 }}>
            last activity {formatDate(profile.lastActivityAt)}
            {profile.archivedAt ? ` · archived ${formatDate(profile.archivedAt)}` : ""}
          </div>
          {profile.capabilityKeys.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {profile.capabilityKeys.map((key) => (
                <Badge key={key} tone="forest">{key}</Badge>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {onViewAudit && (
              <button type="button" className="btn-secondary" onClick={() => onViewAudit(profile.id)}>
                View audit trail
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => setAccessWorkspace({ id: profile.id, name: profile.name })}>
              Request access
            </button>
          </div>
        </Card>
      ))}

      {!loading && hasMore && (
        <button type="button" className="btn-secondary" onClick={loadMore} style={{ width: "100%" }}>
          Load more
        </button>
      )}

      {accessWorkspace && (
        <SupportAccessSheet
          workspaceId={accessWorkspace.id}
          workspaceName={accessWorkspace.name}
          actorRef={user.id}
          onClose={() => setAccessWorkspace(null)}
        />
      )}
    </div>
  );
}
