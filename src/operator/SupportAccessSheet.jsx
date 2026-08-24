// Support access, WP S.1 — the "Request access" flow ROADMAP_C_PLATFORM_OPERATIONS.md
// §3.2 names ("a button that starts the same time-boxed, scoped, consent-governed
// membership flow a contractor uses") and Phase C2 never actually built. Reads through
// api.support_access_grants(), writes through api.grant_support_access()/
// api.end_support_access() (migration 0172, WP S.0). Not localized — OperatorApp.jsx's
// own stated, deliberate exemption (see that file's own header).
//
// A REAL, STATED PURPOSE AND A BOUNDED DURATION — THE TWO THINGS
// ROADMAP_C §3.2 NAMES UNCONDITIONALLY
//
// Workspace-configurable consent (the third, conditional thing §3.2 names — "where the
// workspace's own settings require it") is not built here — SUPPORT_ACCESS_DESIGN.md
// §1.4's own named, deferred gap: no setting exists yet to gate it on.
import { useEffect, useState } from "react";
import { Drawer, Card, Badge } from "../design-system";
import { fetchSupportAccessGrants, grantSupportAccess, endSupportAccess } from "../lib/supportAccess.js";

const DURATION_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "72 hours" },
];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function statusTone(status) {
  if (status === "active") return "forest";
  if (status === "expired") return "amber";
  return "sage";
}

export function SupportAccessSheet({ workspaceId, workspaceName, actorRef, onClose }) {
  const [grants, setGrants] = useState(null);
  const [purpose, setPurpose] = useState("");
  const [durationHours, setDurationHours] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const refresh = () => fetchSupportAccessGrants(workspaceId).then(setGrants);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const submitGrant = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await grantSupportAccess({ workspaceId, purpose, durationHours, actorRef });
      setPurpose("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const endGrant = async (membershipId) => {
    setSubmitting(true);
    setError(null);
    try {
      await endSupportAccess({ membershipId, actorRef });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = purpose.trim().length > 0;

  return (
    <Drawer onClose={onClose}>
      <div className="sheet-title">Support access</div>
      <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
        {workspaceName || "(unnamed workspace)"}
      </div>

      <div className="section-title" style={{ marginTop: 14 }}>Request access</div>
      <textarea
        className="textarea"
        rows={2}
        placeholder="Purpose (required — why this session needs access)"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
      />
      <div className="segmented segmented-block" style={{ marginTop: 8 }}>
        {DURATION_OPTIONS.map((opt) => (
          <button key={opt.hours} className={durationHours === opt.hours ? "seg-on" : ""} onClick={() => setDurationHours(opt.hours)}>
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="fineprint" style={{ color: "var(--danger, #b3261e)", justifyContent: "flex-start", marginTop: 6 }}>{error}</p>}

      <button className="btn-primary" style={{ marginTop: 10 }} disabled={!canSubmit || submitting} onClick={submitGrant}>
        {submitting ? "Requesting…" : "Request access"}
      </button>

      <div className="section-title" style={{ marginTop: 18 }}>Grant history</div>
      {grants === null && <div className="empty-block"><p>Loading…</p></div>}
      {grants && grants.length === 0 && <div className="empty-block"><p>No support access has ever been granted for this workspace.</p></div>}
      {grants && grants.map((g) => (
        <Card key={g.membershipId} style={{ marginBottom: 8, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>{g.operatorName || "—"}</strong>
            <Badge tone={statusTone(g.status)}>{g.status}</Badge>
          </div>
          <p className="sheet-blurb" style={{ marginTop: 4 }}>{g.purpose}</p>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
            granted {formatDate(g.grantedAt)} · expires {formatDate(g.expiresAt)}
          </div>
          {g.status === "active" && (
            <button className="btn-secondary" style={{ marginTop: 8 }} disabled={submitting} onClick={() => endGrant(g.membershipId)}>
              End access
            </button>
          )}
        </Card>
      ))}
    </Drawer>
  );
}
