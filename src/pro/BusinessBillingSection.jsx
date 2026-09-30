// Business > Billing — UX_TAB_SCOPE.md P3/P5, 2026-09-28/29. Two things moved here
// verbatim from Profile.jsx's own pro variant:
//
// 1. The Klussie Pro subscription section (Payments Slice B, WP B4), including the Stripe
//    Checkout return-leg URL cleanup — "current plan, next billing date, cancellation...
//    keep the two fee types separate," this destination's own spec section.
// 2. The flexi-job tax-free tracker — P5's own "financial reporting to Billing," with one
//    real fix, not just a relocation: "do not present a demo tax allowance tracker... as
//    verified taxable earnings. Financial reporting must state period, gross/net basis and
//    settlement status." earnedGross (ProApp.jsx's own netEarnings() over every booked+
//    completed job ever, no date filter, net of a flat 12% estimate — billing.js's own
//    header already names this as a known-approximate figure, not the real per-job fee) was
//    shown before with no such caveat at all. flexiEstimateNote below says plainly what it
//    actually covers (no year boundary — genuinely all bookings to date, not "this year"),
//    that it's net of an ESTIMATED platform cost rather than the real acquisition fee, and
//    that some counted jobs may not be paid yet. Making the number itself period-accurate
//    (a real tax-year filter) is a separate, real backend change this pass does not make —
//    named here rather than silently implied fixed.
import { useEffect, useState } from "react";
import { Badge } from "../design-system";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { interpolate } from "../lib/homeStrings.js";
import { fetchMyKlussieSubscription, startKlussieProCheckout, requestKlussieProCancellation } from "../lib/klussiePro.js";
import { FLEXI_TAX_FREE_THRESHOLD, flexiProgressPct } from "../lib/billing.js";
import { PRO_TYPE_FLEXI } from "../lib/proStatus.js";

export function BusinessBillingSection({ earnedGross = 0 }) {
  const { t, fmt, fmtDate } = useLang();
  const { user, proProfile, activeWorkspace } = useAuth();
  const flexiPct = flexiProgressPct(earnedGross);
  // Null while unresolved, undefined-shaped {} state is never used: fetchMyKlussieSubscription()
  // itself already resolves a workspace with no subscription to null, the value this starts
  // at, so "still loading" and "never subscribed" are the one same falsy check every render
  // below already needs.
  const [klussieSubscription, setKlussieSubscription] = useState(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState(false);

  const refreshKlussieSubscription = () =>
    fetchMyKlussieSubscription(activeWorkspace?.workspace_id).then(setKlussieSubscription);

  useEffect(() => {
    if (!activeWorkspace?.workspace_id) return;
    refreshKlussieSubscription().catch(() => setKlussieSubscription(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.workspace_id]);

  // The return leg of the Stripe Checkout redirect (0233's own webhook is what actually
  // activates the subscription — this only re-checks and cleans the URL). Runs once, on
  // mount — a pro landing here fresh from a real subscribe redirect (this screen mounting
  // is what "landing here" means now that Billing has its own destination) re-checks
  // status immediately rather than waiting for the workspace-id effect above to happen to
  // fire again.
  useEffect(() => {
    if (!window.location.search.includes("klussieProCheckout=")) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (activeWorkspace?.workspace_id) {
      refreshKlussieSubscription().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribeToKlussiePro = async () => {
    setCheckoutPending(true);
    setCheckoutError(false);
    try {
      const url = await startKlussieProCheckout(activeWorkspace.workspace_id);
      window.location.href = url;
    } catch {
      setCheckoutError(true);
      setCheckoutPending(false);
    }
  };

  const cancelKlussiePro = async () => {
    setCancelPending(true);
    setCancelError(false);
    try {
      await requestKlussieProCancellation(klussieSubscription.id, user.id);
    } catch {
      setCancelError(true);
      setCancelPending(false);
      return;
    }
    try {
      await refreshKlussieSubscription();
    } catch {
      // Best-effort; the cancellation request itself already succeeded regardless.
    } finally {
      setCancelPending(false);
    }
  };

  return (
    <>
      {/* "A Pro subscription does not remove the acquisition fee... state this plainly" is
          klussieProDesc's own closing sentence, not a separate section: shown every time,
          not only once, since a pro who already subscribed still needs the same reminder
          the next time they open this screen. */}
      <div className="quote-card">
        <p className="sheet-blurb" style={{ margin: "0 0 10px" }}>{t.klussieProDesc}</p>
        {klussieSubscription?.planKey === "klussie_pro" && klussieSubscription.status === "past_due" ? (
          <>
            <Badge tone="amber">{t.klussieProPastDue}</Badge>
            {klussieSubscription.graceUntil && (
              <p className="fineprint" style={{ marginTop: 8 }}>
                {interpolate(t.klussieProGraceUntil, { date: fmtDate(klussieSubscription.graceUntil) })}
              </p>
            )}
          </>
        ) : klussieSubscription?.planKey === "klussie_pro" && ["active", "trialing"].includes(klussieSubscription.status) ? (
          <>
            <Badge tone="amber">{t.klussieProActive}</Badge>
            {klussieSubscription.cancellationRequestedAt ? (
              <p className="fineprint" style={{ marginTop: 8 }}>
                {klussieSubscription.currentPeriodEnd
                  ? interpolate(t.klussieProEndsOn, { date: fmtDate(klussieSubscription.currentPeriodEnd) })
                  : t.klussieProCancelling}
              </p>
            ) : (
              <>
                <button className="btn-secondary" style={{ marginTop: 8 }} disabled={cancelPending} onClick={cancelKlussiePro}>
                  {t.klussieProCancelBtn}
                </button>
                {cancelError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 8 }}>{t.klussieProCancelFailed}</div>}
              </>
            )}
          </>
        ) : (
          <>
            <button className="btn-primary" disabled={checkoutPending} onClick={subscribeToKlussiePro}>{t.klussieProSubscribeBtn}</button>
            {checkoutError && <div className="fineprint" style={{ color: "#b3432f", justifyContent: "flex-start", marginTop: 8 }}>{t.klussieProCheckoutFailed}</div>}
          </>
        )}
      </div>

      {proProfile.pro_type === PRO_TYPE_FLEXI && (
        <div className="flexi-box" style={{ marginTop: 16 }}>
          <div className="ticket-title" style={{ fontSize: 13.5, marginBottom: 8 }}>{t.flexiTrackerTitle}</div>
          <div className="flexi-bar"><div className="flexi-bar-fill" style={{ width: `${flexiPct}%` }} /></div>
          <div className="ticket-sub" style={{ marginTop: 6 }}>€{fmt(Math.round(earnedGross))} {t.flexiUsedOf} €{fmt(FLEXI_TAX_FREE_THRESHOLD)}</div>
          <div className="fineprint" style={{ marginTop: 8, justifyContent: "flex-start", textAlign: "start" }}>{t.flexiThresholdNote}</div>
          <div className="fineprint" style={{ marginTop: 4, justifyContent: "flex-start", textAlign: "start" }}>{t.flexiEstimateNote}</div>
        </div>
      )}
    </>
  );
}
