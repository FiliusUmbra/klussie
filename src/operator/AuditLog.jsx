// Platform Activation Slice 0, WP 0.6 — the real Audit viewer
// (ROADMAP_C_PLATFORM_OPERATIONS.md §3.7): searchable by actor, workspace, action and
// time range, reading through api.list_audit_records() (migration 0133).
//
// Deliberately plain, not JobCard's paper-ticket treatment — that decorative language
// belongs to the customer-facing brand (DESIGN_SYSTEM.md), and an audit trail is a
// compliance surface, not a warm confirmation. Card is the design system's
// domain-agnostic primitive for exactly this reason; Badge carries the same tone
// vocabulary (forest/sage/amber) the rest of the product already uses, applied here to
// permitted/denied rather than invented fresh.
//
// Export (§23's own named future, and explicitly out of scope for
// api.list_audit_records() itself per 0133's own header) is not built here either.
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, Badge } from "../design-system";
import { fetchAuditRecords, AUDIT_PAGE_SIZE } from "../lib/auditRecords";

const EMPTY_FILTERS = { actorRef: "", actionPrefix: "", occurredFrom: "", occurredTo: "" };

function OutcomeBadge({ outcome }) {
  return <Badge tone={outcome === "denied" ? "amber" : "sage"}>{outcome}</Badge>;
}

// Short enough to read at a glance in a list row; the full value is still in `detail`
// for anyone who needs it, and this is a viewer, not the record's own storage.
function truncateRef(ref) {
  if (!ref) return "—";
  return ref.length > 24 ? `${ref.slice(0, 8)}…${ref.slice(-8)}` : ref;
}

export function AuditLog() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  // Keyed by the exact `appliedFilters` reference the fetch was made for, the same
  // identity-comparison shape AppShell.jsx's own operator check uses — the alternative
  // (a `loading` flag set synchronously to true at the top of the effect, then false in
  // the callback) is a synchronous setState inside an effect body, which is both a lint
  // error and the real problem it flags: a needless extra render every search triggers.
  // "Still loading for the current filters" becomes "the stored filters reference
  // doesn't match the current one" — true from the moment `appliedFilters` changes,
  // false only once the matching result has actually landed.
  // `filters: null` on purpose, not EMPTY_FILTERS — it must never equal the initial
  // `appliedFilters` value by reference, or `loading` below would read false before the
  // first fetch has even started.
  const [result, setResult] = useState({ filters: null, records: [], hasMore: false });

  useEffect(() => {
    let cancelled = false;
    fetchAuditRecords({ ...appliedFilters, offset: 0 }).then((page) => {
      if (cancelled) return;
      setResult({ filters: appliedFilters, records: page, hasMore: page.length === AUDIT_PAGE_SIZE });
    });
    return () => { cancelled = true; };
  }, [appliedFilters]);

  const loading = result.filters !== appliedFilters;
  const { records, hasMore } = result;

  // Pagination offset is simply how many rows are already shown — no separate counter
  // to keep in sync with `records` by hand.
  const loadMore = async () => {
    const page = await fetchAuditRecords({ ...appliedFilters, offset: records.length });
    setResult((prev) => ({ ...prev, records: [...prev.records, ...page], hasMore: page.length === AUDIT_PAGE_SIZE }));
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  return (
    <div>
      <form onSubmit={applyFilters} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Actor (person or system reference)"
          value={filters.actorRef}
          onChange={(e) => setFilters((f) => ({ ...f, actorRef: e.target.value }))}
          aria-label="Filter by actor"
        />
        <input
          type="text"
          placeholder="Action prefix, e.g. workspace."
          value={filters.actionPrefix}
          onChange={(e) => setFilters((f) => ({ ...f, actionPrefix: e.target.value }))}
          aria-label="Filter by action prefix"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={filters.occurredFrom}
            onChange={(e) => setFilters((f) => ({ ...f, occurredFrom: e.target.value }))}
            aria-label="From date"
            style={{ flex: 1 }}
          />
          <input
            type="date"
            value={filters.occurredTo}
            onChange={(e) => setFilters((f) => ({ ...f, occurredTo: e.target.value }))}
            aria-label="To date"
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn-primary" style={{ flex: 1 }}>
            <Search size={14} /> Search
          </button>
          <button type="button" className="btn-secondary" onClick={clearFilters}>Clear</button>
        </div>
      </form>

      {loading && <div className="empty-block"><p>Loading…</p></div>}

      {!loading && records.length === 0 && (
        <div className="empty-block"><p>No matching audit records.</p></div>
      )}

      {!loading && records.map((record) => (
        <Card key={record.id} className="audit-record" style={{ marginBottom: 10, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>{record.action}</strong>
            <OutcomeBadge outcome={record.outcome} />
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 4 }}>
            {new Date(record.occurredAt).toLocaleString()} · {record.actorType} {truncateRef(record.actorRef)}
          </div>
          <div className="fineprint" style={{ justifyContent: "flex-start", marginTop: 2 }}>
            {record.workspaceId ? `workspace ${truncateRef(record.workspaceId)}` : "platform-scoped"}
            {record.authority ? ` · under ${record.authority}` : ""}
          </div>
        </Card>
      ))}

      {!loading && hasMore && (
        <button type="button" className="btn-secondary" onClick={loadMore} style={{ width: "100%" }}>
          Load more
        </button>
      )}
    </div>
  );
}
