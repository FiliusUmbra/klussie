// Platform Activation Slice 3, WP 3.1 + WP 3.3 — the pro's own side of the Service
// Record. WP 3.1's own decided gate (SLICE_3_SERVICE_RECORD_REPUTATION_ACTIVATION.md
// §3): a completed job with no record yet shows a real entry point, not a stub — the
// editor (ServiceRecordEditorSheet.jsx) now exists for it to open, closing the gap that
// document flagged as the one reason no button shipped earlier.
//
// A SEPARATE COMPONENT FROM ServiceRecordSummary.jsx, DELIBERATELY — SHARED DATA LAYER,
// NOT SHARED PRESENTATION
//
// Both read through the same fetchServiceRecordForRequest() (serviceRecords.js) — no
// duplicated data logic — but the populated-record view differs by audience:
// ServiceRecordSummary's own empty state and Approve action are customer-only framing
// (a pro is never the property's steward, so an Approve button would just fail
// server-side for them); this component's own empty state is a real "write it up" entry
// point instead, and its populated view has no approve action at all — the pro reads
// their own record back, they don't approve it.
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useLang } from "../lib/lang";
import { QuoteCard, Button } from "../design-system";
import { fetchServiceRecordForRequest } from "../lib/serviceRecords.js";
import { ServiceRecordEditorSheet } from "./ServiceRecordEditorSheet.jsx";

export function ProServiceRecordSection({ job, workspaceId, actorRef, onRecordSaved }) {
  const { t, fmtDate } = useLang();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  // Found by code audit: fetchServiceRecordForRequest() throws on a real Postgres error,
  // and this effect had no catch of its own -- loading stayed stuck at true forever
  // (nothing past the .then() ever ran), so "if (loading) return null" left this whole
  // section permanently blank: no error, no "write it up" entry point, no way back short
  // of leaving and re-opening the sheet. Deliberately NOT resolved by falling into the
  // existing !record branch the way ProJobDetailSheet.jsx's own identical twin-fetch fix
  // does: that branch here is a real "write it up" button, and a record that actually
  // exists but merely failed to load would risk create_service_record() being called a
  // second time for the same job. A real retry instead, the same retryToken idiom
  // AppShell.jsx/MyBusinessPanel.jsx already use.
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchServiceRecordForRequest(job.id)
      .then((r) => { if (!cancelled) { setRecord(r); setLoadError(false); } })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [job.id, retryToken]);

  async function reload() {
    const r = await fetchServiceRecordForRequest(job.id);
    setRecord(r);
    // Refreshes ProApp.jsx's own jobs list too — a newly-authored record doesn't change
    // job.status, but a future badge/list treatment may want to know one exists now.
    if (onRecordSaved) await onRecordSaved();
  }

  // Same silent-loading restraint as ServiceRecordSummary.jsx — this sits below content
  // that already renders immediately.
  if (loading) return null;

  if (loadError) {
    return (
      <div style={{ marginTop: 20 }}>
        <div className="section-title">{t.serviceRecordTitle}</div>
        <div className="empty-block">
          <p>{t.catalogLoadFailed}</p>
          <button type="button" className="btn-secondary" onClick={() => { setLoading(true); setRetryToken((n) => n + 1); }}>
            {t.retryBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-title">{t.serviceRecordTitle}</div>

      {!record && (
        <Button variant="primary" style={{ width: "100%" }} onClick={() => setEditing(true)}>
          {t.srWriteItUpBtn}
        </Button>
      )}

      {record && (
        <QuoteCard>
          <p className="quote-msg">{record.workPerformed}</p>
          {record.recommendations && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.serviceRecordRecommendationsLabel}</div>
              <p className="quote-msg" style={{ marginTop: 2 }}>{record.recommendations}</p>
            </div>
          )}
          {record.warrantyUntil && (
            <div className="fineprint" style={{ marginTop: 10 }}>
              <ShieldCheck size={12} /> {t.serviceRecordWarrantyLabel} {fmtDate(record.warrantyUntil)}
            </div>
          )}
        </QuoteCard>
      )}

      {editing && (
        <ServiceRecordEditorSheet
          job={job}
          workspaceId={workspaceId}
          actorRef={actorRef}
          onClose={() => setEditing(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
