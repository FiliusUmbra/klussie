// Slice 5, WP 5.2 — the triage queue (ROADMAP_C_PLATFORM_OPERATIONS.md §3.3): every
// open or escalated case, oldest first. Same plain, compliance-surface treatment as
// AuditLog.jsx/WorkspaceLookup.jsx — Card, Badge, no JobCard-style warmth — and the same
// loading idiom (result keyed by the exact fetch it belongs to, never a synchronous
// setState in the effect body). Not localized — OperatorApp.jsx's own stated, deliberate
// exemption (see that file's own header).
import { useEffect, useState } from "react";
import { Card, Badge } from "../design-system";
import { fetchTrustSafetyQueue } from "../lib/trustSafety.js";

function truncateId(id) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function TrustSafetyQueue({ onOpenCase, refreshKey }) {
  const [cases, setCases] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrustSafetyQueue().then((rows) => {
      if (!cancelled) setCases(rows);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const loading = cases === null;

  return (
    <div>
      {loading && <div className="empty-block"><p>Loading…</p></div>}

      {!loading && cases.length === 0 && (
        <div className="empty-block"><p>No open reports.</p></div>
      )}

      {!loading && cases.map((c) => (
        <Card key={c.id} className="workspace-lookup-card" style={{ marginBottom: 10, textAlign: "left" }} onClick={() => onOpenCase(c.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>{c.reportedWorkspaceName || "(unnamed workspace)"}</strong>
            <Badge tone={c.status === "escalated" ? "amber" : "sage"}>{c.status}</Badge>
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
            {truncateId(c.id)} · reported by {c.reporterName || "—"}
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 2 }}>
            {c.category} · filed {formatDate(c.createdAt)}
          </div>
        </Card>
      ))}
    </div>
  );
}
