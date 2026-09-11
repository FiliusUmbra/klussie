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
  const [approveError, setApproveError] = useState("");
  // Found by code audit: fetchServiceRecordForRequest() throws on a real Postgres error,
  // and this effect had no catch of its own -- loading stayed stuck at true forever, so
  // "if (loading) return null" left this whole section permanently blank: no error, no
  // record, no way back short of leaving and re-opening the sheet. Deliberately NOT
  // resolved by falling straight into the existing !record empty state (the same real
  // risk ProServiceRecordSection.jsx's own identical fix names): a record that actually
  // exists and needs the customer's own approval, but merely failed to load, would read
  // as "your pro never wrote this up" instead of a fixable failure -- a real, different
  // consequence a pro never seeing "write it up" doesn't share, but just as wrong. A real
  // retry instead, the same retryToken idiom AppShell.jsx/MyBusinessPanel.jsx already use.
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    // Initial state (loading = true) already covers the first fetch — no synchronous
    // setState here, matching ProJobDetailSheet.jsx's own established fix for this.
    let cancelled = false;
    fetchServiceRecordForRequest(requestId)
      .then((r) => { if (!cancelled) { setRecord(r); setLoadError(false); } })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [requestId, retryToken]);

  // Found by code audit: no try/catch at all -- a real refusal left `approving` stuck
  // at true forever (nothing past the await ever ran), the button permanently disabled
  // with no way back in short of leaving and re-opening the sheet, and no explanation
  // shown at any point. The exact "no dead end" shape this codebase has already found
  // and fixed repeatedly elsewhere (PortfolioItemSheet.jsx's own identical gap, among
  // others).
  async function handleApprove() {
    if (!record || approving) return;
    setApproving(true);
    setApproveError("");
    try {
      await approveServiceRecord(record.id, user.id);
      setRecord((r) => ({ ...r, customerApproved: true, customerApprovedAt: new Date().toISOString() }));
    } catch {
      setApproveError(t.serviceRecordApproveFailed);
    } finally {
      setApproving(false);
    }
  }

  // Loading is deliberately silent (no skeleton) — this sits below the review card,
  // which already renders immediately; a flash of "loading" above content that's
  // already there reads as broken, not busy.
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
            <>
              <Button variant="secondary" style={{ marginTop: 12, width: "100%" }} onClick={handleApprove} disabled={approving}>
                {t.serviceRecordApproveBtn}
              </Button>
              {approveError && (
                <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 8 }}>{approveError}</div>
              )}
            </>
          )}
        </QuoteCard>
      )}
    </div>
  );
}
