// Platform Activation Slice 3, WP 3.2 — a customer's own read of the Service Record for
// a completed job, once one exists. ROADMAP_A §5.1 step 5's own bar: "what happened to
// my boiler," not an invoice line. Self-fetching, the same idiom RequestPhotosStrip.jsx
// already establishes — every surface that renders a completed/reviewed request gets
// this without threading record-loading state through its own component.
//
// EMPTY STATE, NOT A DEAD END — no client-side authoring UI exists yet (WP 3.3, its own
// work package); until then, EVERY request renders the empty branch below. Per the
// product-phase mandate ("empty states should educate and encourage"), this explains
// what will appear and why, rather than showing nothing or a raw "no data."
import { useState, useEffect } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { QuoteCard, Button } from "../design-system";
import { fetchServiceRecordForRequest, approveServiceRecord } from "../lib/serviceRecords";

export function ServiceRecordSummary({ requestId }) {
  const { t, fmtDate } = useLang();
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    // Initial state (loading = true) already covers the first fetch — no synchronous
    // setState here, matching ProJobDetailSheet.jsx's own established fix for this.
    let cancelled = false;
    fetchServiceRecordForRequest(requestId).then((r) => {
      if (!cancelled) {
        setRecord(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function handleApprove() {
    if (!record || approving) return;
    setApproving(true);
    await approveServiceRecord(record.id, user.id);
    setRecord((r) => ({ ...r, customerApproved: true, customerApprovedAt: new Date().toISOString() }));
    setApproving(false);
  }

  // Loading is deliberately silent (no skeleton) — this sits below the review card,
  // which already renders immediately; a flash of "loading" above content that's
  // already there reads as broken, not busy.
  if (loading) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-title">{t.serviceRecordTitle}</div>

      {!record && (
        <div className="empty-block"><p>{t.serviceRecordEmptyMsg}</p></div>
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
          {record.customerApproved ? (
            <div className="fineprint" style={{ marginTop: 10, color: "var(--forest)" }}>
              <CheckCircle2 size={12} /> {t.serviceRecordApprovedMsg}
            </div>
          ) : (
            <Button variant="secondary" style={{ marginTop: 12, width: "100%" }} onClick={handleApprove} disabled={approving}>
              {t.serviceRecordApproveBtn}
            </Button>
          )}
        </QuoteCard>
      )}
    </div>
  );
}
