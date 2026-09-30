// Platform Activation Slice 2, WP 2.4's own real acceptance bar, finally reachable: a
// professional's own detail view of a booked job — none existed before this (ProJobs.jsx
// was a flat list with no drill-in at all) — showing the timeline, a direct link into the
// conversation this booking already opened (0148), and, once the scoped grant 0161/0162
// created resolves, the customer's own Location/Asset/Document twin for the property
// concerned.
//
// PROGRESSIVE DISCLOSURE, NOT A DASHBOARD — every section here degrades honestly when its
// own data doesn't exist yet, which matters because a "sent" (quoted, not yet booked) job
// DOES reach this sheet (UX_TAB_SCOPE.md P2, 2026-09-28 — "quotes must open for inspection
// even when not accepted"; ProJobs.jsx no longer gates onOpen by segment). A sent quote has
// no engagement (no fee assessment section renders), no conversation (no message button),
// no twin data (twinUnavailableMsg) — the same component, just fewer facts to show. Nothing
// here ever asks a pro to understand "engagement," "workspace," or "scope" — those stay
// internal; what a pro sees is a job, a customer, and (if it exists) what that customer's
// home looks like.
import { useEffect, useState } from "react";
import { MessageCircle, MapPin, Wrench, FileText, Home, Handshake } from "lucide-react";
import { useLang } from "../lib/lang";
import { Badge, PriceTag, Timeline, Button, Drawer } from "../design-system";
import { timelineSteps, statusPresentation } from "../lib/requestStatus.js";
import { documentTypeLabelKey } from "../lib/documents.js";
import { fetchPropertyTwin } from "../lib/propertyTwin.js";
import { interpolate } from "../lib/homeStrings.js";
import {
  fetchMyAcquisitionFeeAssessments,
  acceptAcquisitionFeeDisclosure,
  confirmAcquisitionFeePaymentReceived,
} from "../lib/acquisitionFees.js";
import { ProServiceRecordSection } from "./ProServiceRecordSection.jsx";

export function ProJobDetailSheet({ job, customerName, onMessage, onClose, workspaceId, actorRef, onRecordSaved }) {
  const { t, fmt, serviceInfo } = useLang();
  const [twin, setTwin] = useState(null);
  const [twinLoading, setTwinLoading] = useState(Boolean(job.propertyId));
  const [feeAssessment, setFeeAssessment] = useState(null);
  const [feeActionPending, setFeeActionPending] = useState(false);
  const [feeActionError, setFeeActionError] = useState(false);

  // Payments Slice A (WP A5) — one assessment can exist at most for this job's own
  // engagement (0230's own unique constraint); most jobs resolve to none at all
  // (not_chargeable is filtered out below, same as "no row" -- neither is ever shown to
  // the professional, since neither is chargeable).
  useEffect(() => {
    let cancelled = false;
    if (!job.engagementId || !workspaceId) return undefined;
    fetchMyAcquisitionFeeAssessments(workspaceId)
      .then((rows) => {
        if (cancelled) return;
        const mine = rows.find((r) => r.engagementId === job.engagementId && r.status !== "not_chargeable");
        setFeeAssessment(mine || null);
      })
      .catch(() => { if (!cancelled) setFeeAssessment(null); });
    return () => { cancelled = true; };
  }, [job.engagementId, workspaceId]);

  async function handleAcceptFee() {
    setFeeActionPending(true);
    setFeeActionError(false);
    try {
      await acceptAcquisitionFeeDisclosure(feeAssessment.id, actorRef);
      setFeeAssessment({ ...feeAssessment, status: "accepted" });
    } catch {
      setFeeActionError(true);
    } finally {
      setFeeActionPending(false);
    }
  }

  async function handleConfirmPayment() {
    setFeeActionPending(true);
    setFeeActionError(false);
    try {
      await confirmAcquisitionFeePaymentReceived(feeAssessment.id, actorRef);
      setFeeAssessment({ ...feeAssessment, status: "invoiced" });
    } catch {
      setFeeActionError(true);
    } finally {
      setFeeActionPending(false);
    }
  }

  useEffect(() => {
    // No property attached to this job at all: the initial state above (twin = null,
    // twinLoading = false) is already the correct, final state — nothing to fetch, and
    // nothing to reset synchronously from inside the effect.
    if (!job.propertyId) return;

    let cancelled = false;
    fetchPropertyTwin(job.propertyId)
      .then((result) => {
        if (!cancelled) {
          setTwin(result);
          setTwinLoading(false);
        }
      })
      // Found by code audit: fetchPropertyTwin() throws on a real Postgres error (unlike
      // most twin-adjacent reads elsewhere, which swallow and return an empty shape) and
      // this call had no catch of its own -- twinLoading stayed true forever, so the
      // Property twin section below rendered nothing at all: no data, no error, not even
      // a loading state. twin is left at its initial null on a real failure, which the
      // existing "job.propertyId && !twinLoading && !twin?.property" branch already
      // renders as t.twinUnavailableMsg -- the same message this section already shows
      // for "no property/no twin data yet," a reasonable fallback for "couldn't load
      // it either," no new locale key needed.
      .catch(() => { if (!cancelled) setTwinLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [job.propertyId]);

  const info = serviceInfo(job.serviceId);
  const steps = timelineSteps(job.status);
  const status = statusPresentation(job.status);
  const myQuote = job.quotes[0];
  const hasTwinData = twin && (twin.locations.length > 0 || twin.assets.length > 0 || twin.documents.length > 0);

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{info.name}</div>
      {/* Found live during a UX review, 2026-09-07, in the same pass that closed
          lib/messages.js's own "Klussie user" literal: this fallback was `t.navMyJobs`
          ("Mijn klussen"/My Jobs) -- the bottom-nav label, not a name placeholder. Never
          actually reachable before today (customerName always came from otherName's own
          "Klussie user" fallback, never falsy), but would have shown a nonsensical "My
          Jobs" as the customer's own name the moment that changed. */}
      <div className="sheet-sub">{customerName || t.counterpartFallbackName}</div>

      {steps && <Timeline steps={steps.map((s) => ({ ...s, label: t[s.labelKey] }))} />}

      <div className="quote-top" style={{ marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          {status.labelKey && <Badge tone={status.tone}>{t[status.labelKey]}</Badge>}
        </div>
        {myQuote && <PriceTag amount={myQuote.price} fmt={fmt} />}
      </div>

      {/* Payments Slice A (WP A5) — "show the professional the exact proposed fee and
          its basis before commitment" (decision table). Renders nothing at all for the
          ordinary case (no assessment, or one already not_chargeable — filtered out
          before this ever reaches state) rather than cluttering every job with a fee
          section that almost never applies. */}
      {feeAssessment && (
        <div className="empty-block" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <Handshake size={15} />
            {t.acqFeeTitle}
          </div>
          {feeAssessment.status === "invoiced" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{t.acqFeeInvoicedNote}</span>
              <PriceTag amount={feeAssessment.feeAmount} fmt={fmt} />
            </div>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                {interpolate(t.acqFeeBody, {
                  rate: Math.round(feeAssessment.rate * 100),
                  cap: fmt(feeAssessment.maxFee),
                })}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <PriceTag amount={feeAssessment.feeAmount} fmt={fmt} />
                {feeAssessment.status === "disclosed" && (
                  <Button variant="secondary" onClick={handleAcceptFee} disabled={feeActionPending}>
                    {t.acqFeeAcceptBtn}
                  </Button>
                )}
              </div>
              {feeAssessment.status === "accepted" && (
                <>
                  <span style={{ color: "var(--ink-soft)" }}>{t.acqFeeAcceptedNote}</span>
                  {(job.status === "completed" || job.status === "reviewed") && (
                    <Button variant="secondary" onClick={handleConfirmPayment} disabled={feeActionPending}>
                      {t.acqFeeConfirmPaymentBtn}
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          {feeActionError && <span style={{ color: "#b3432f" }}>{t.acqFeeActionFailedMsg}</span>}
        </div>
      )}

      {onMessage && (
        <Button variant="secondary" icon={MessageCircle} style={{ marginTop: 12, width: "100%" }} onClick={onMessage}>
          {t.messageCustomerBtn}
        </Button>
      )}

      <div className="section-title" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 6 }}>
        <Home size={15} />
        {t.propertyTwinTitle}
      </div>

      {!job.propertyId && (
        <div className="empty-block"><p>{t.twinUnavailableMsg}</p></div>
      )}

      {job.propertyId && !twinLoading && !twin?.property && (
        <div className="empty-block"><p>{t.twinUnavailableMsg}</p></div>
      )}

      {job.propertyId && !twinLoading && twin?.property && !hasTwinData && (
        <div className="empty-block"><p>{t.twinNoDataMsg}</p></div>
      )}

      {job.propertyId && !twinLoading && twin?.property && hasTwinData && (
        <>
          {twin.locations.length > 0 && (
            <TwinSection icon={MapPin} label={t.twinLocationsLabel}>
              {twin.locations.map((l) => (
                <div key={l.id} className="ticket-sub">{l.name}</div>
              ))}
            </TwinSection>
          )}
          {twin.assets.length > 0 && (
            <TwinSection icon={Wrench} label={t.twinAssetsLabel}>
              {twin.assets.map((a) => (
                <div key={a.id} className="ticket-sub">
                  {a.name}
                  {(a.make || a.model) && <span style={{ color: "var(--ink-soft)" }}> — {[a.make, a.model].filter(Boolean).join(" ")}</span>}
                </div>
              ))}
            </TwinSection>
          )}
          {twin.documents.length > 0 && (
            <TwinSection icon={FileText} label={t.twinDocumentsLabel}>
              {/* Found live during a UX review, 2026-09-06: two real documents both fell
                  back to this same bare type label ("Warranty", "Warranty"), genuinely
                  indistinguishable — see panelParts.jsx's own DocumentRowContent for the
                  identical fix on the customer's own side. api.my_documents() (fetched
                  by fetchPropertyTwin(), above) already returns d.issuer. */}
              {twin.documents.map((d) => {
                const labelKey = documentTypeLabelKey(d.type_key);
                const label = labelKey ? t[labelKey] : d.type_key;
                return <div key={d.id} className="ticket-sub">{d.issuer ? `${label} — ${d.issuer}` : label}</div>;
              })}
            </TwinSection>
          )}
        </>
      )}

      {/* A real bug, found live 2026-08-28: WP 3.1's own decision (SLICE_3_..._ACTIVATION.md
          §WP 3.1) gates authoring on the *engagement* reaching 'completed' — a fact that
          stays true forever, work.engagements has no 'reviewed' status at all (0182's own
          constraint: pending_disclosure/active/completed/cancelled). job.status here is
          the *request's* own status, which keeps progressing after that — the moment a
          customer leaves a review, job.status becomes 'reviewed' and this check (checking
          only "completed") permanently hid the entry point, even though the design intent
          was for it to stay reachable until a record actually exists. Matches ProJobs.jsx's
          own "Klaar" bucket, which already treats completed/reviewed as the same segment. */}
      {(job.status === "completed" || job.status === "reviewed") && (
        <ProServiceRecordSection job={job} workspaceId={workspaceId} actorRef={actorRef} onRecordSaved={onRecordSaved} />
      )}
    </Drawer>
  );
}

function TwinSection({ icon: Icon, label, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
        <Icon size={14} color="var(--ink-soft)" />
        {label}
      </div>
      {children}
    </div>
  );
}
