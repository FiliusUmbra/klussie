// One request, in whatever state it is in — the customer's single view of a job from
// "collecting quotes" through to "reviewed". Each status renders the one action that
// status actually affords, rather than a panel of buttons most of which don't apply.
//
// The timeline and the commission breakdown both come from src/lib — the lifecycle from
// requestStatus.js, the fee and payout from billing.js.
import { useState } from "react";
import { Ban, Check, Clock, MessageCircle, ShieldCheck, MapPin, Loader2 } from "lucide-react";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Avatar, Badge, Button, Rating, PriceTag, QuoteCard, TrustBadge, Timeline, Drawer } from "../design-system";
import { trustScore } from "../lib/pros";
import { JobDetailsSummary, AiAnalysisSummary, RequestPhotosStrip, ServiceRecordSummary } from "../requests";
import { ProPublicProfileSheet } from "../profile/ProPublicProfileSheet.jsx";
import { InvoiceSheet } from "./InvoiceSheet.jsx";
import { ReportSheet } from "./ReportSheet.jsx";
import { timelineSteps } from "../lib/requestStatus.js";
import { platformFee, netPayout } from "../lib/billing.js";

export function RequestDetailSheet({ request, onClose, onAccept, onApproveDisclosure, onComplete, onReview, onMessage }) {
  const { t, fmt, serviceInfo, proBadgeLabel, whenLabel } = useLang();
  const { user } = useAuth();
  const [showInvoice, setShowInvoice] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [openProId, setOpenProId] = useState(null);
  const [approving, setApproving] = useState(false);
  // Which quote id is currently being accepted, if any — a single flag (not per-quote)
  // is enough since accepting one quote is the one mutually-exclusive action this
  // sheet's quotes_ready state offers.
  const [acceptingId, setAcceptingId] = useState(null);
  const [completing, setCompleting] = useState(false);
  const info = serviceInfo(request.serviceId);
  const bookedQuote = request.quotes.find((q) => q.proId === request.bookedProId);
  const steps = timelineSteps(request.status);

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{info.name}</div>
      <div className="sheet-sub">{whenLabel(request.answers.when)} {"·"} "{request.answers.details}"</div>
      {steps && (
        <Timeline steps={steps.map((s) => ({ ...s, label: t[s.labelKey] }))} />
      )}
      <JobDetailsSummary serviceId={request.serviceId} fields={request.answers.fields} />
      <AiAnalysisSummary aiAnalysis={request.answers.aiAnalysis} />
      <RequestPhotosStrip requestId={request.id} />

      {bookedQuote && onMessage && (
        <Button variant="secondary" icon={MessageCircle} style={{ marginTop: 8, marginBottom: 4, width: "100%" }} onClick={onMessage}>
          {t.messageProBtn}
        </Button>
      )}

      {request.status === "collecting" && (
        <div className="empty-block"><Clock size={22} color="var(--ink-soft)" /><p>{t.waitingMsg}</p></div>
      )}

      {/* Found live during a UX review, 2026-09-07: `cancelled` had no branch here at
          all -- timelineSteps() already returns null for it (correctly: there is no
          forward progress to show), but nothing filled the resulting gap, so a
          cancelled request's own detail sheet showed nothing past the title and
          subtitle. See requestStatus.js's own PRESENTATION table for the matching
          badge-label gap this same review found and closed. */}
      {request.status === "cancelled" && (
        <div className="empty-block"><Ban size={22} color="var(--ink-soft)" /><p>{t.requestCancelledMsg}</p></div>
      )}

      {request.status === "quotes_ready" && (
        <>
          <div className="section-title" style={{ marginTop: 6 }}>{t.quotesTitle} ({request.quotes.length})</div>
          {request.quotes.map((q) => {
            const pro = q.pro;
            return (
              <QuoteCard key={q.id}>
                <div className="quote-top">
                  <button type="button" className="quote-top-link" onClick={() => setOpenProId(pro.id)}>
                    <Avatar url={pro.avatarUrl} initials={pro.initials} />
                    <div style={{ flex: 1 }}>
                      <div className="quote-name">{pro.name || t.proFallbackName} {proBadgeLabel(pro.badgeTier) && <Badge tone="forest">{proBadgeLabel(pro.badgeTier)}</Badge>}</div>
                    <TrustBadge rating={pro.rating} reviewCount={pro.reviews} score={trustScore(pro)} scoreLabel={t.trustScoreLabel} fmt={fmt} />
                  </div>
                  </button>
                  <PriceTag amount={q.price} fmt={fmt} />
                </div>
                {/* Found by code audit: no busy state at all -- a real refusal (a race
                    with another quote already accepted, a status that moved on) used
                    to leave this button sitting there, tappable again, with nothing
                    telling the customer their tap had even registered, let alone that
                    it failed (acceptQuote()'s own new catch, CustomerApp.jsx, shows the
                    real toast; this only needs to not double-submit while one is in
                    flight and not throw here a second time). */}
                <button
                  className="btn-secondary"
                  disabled={acceptingId !== null}
                  onClick={async () => {
                    setAcceptingId(q.id);
                    try { await onAccept(q.id); } catch { /* toasted by acceptQuote() */ } finally { setAcceptingId(null); }
                  }}
                >
                  {acceptingId === q.id ? <Loader2 size={15} className="spin" /> : null} {t.acceptQuoteBtn}
                </button>
              </QuoteCard>
            );
          })}
        </>
      )}

      {/* Beta-completion slice (0182/0183) — the mandatory disclosure-consent step.
          Quote acceptance alone no longer books the job; the request sits here until the
          customer explicitly shares the exact address with bookedQuote's own pro. */}
      {request.status === "accepted_pending_location_approval" && bookedQuote && (() => {
        const pro = bookedQuote.pro;
        return (
          <>
          <div className="section-title" style={{ marginTop: 6 }}>{t.disclosureConsentTitle}</div>
          <QuoteCard>
            <div className="quote-top">
              <button type="button" className="quote-top-link" onClick={() => setOpenProId(pro.id)}>
                <Avatar url={pro.avatarUrl} initials={pro.initials} />
                <div style={{ flex: 1 }}><div className="quote-name">{pro.name || t.proFallbackName}</div><TrustBadge rating={pro.rating} score={trustScore(pro)} scoreLabel={t.trustScoreLabel} fmt={fmt} /></div>
              </button>
              <PriceTag amount={bookedQuote.price} fmt={fmt} />
            </div>
            <div className="ticket-divider" />
            <div className="quote-msg" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <MapPin size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{t.disclosureConsentBody.replace("{name}", pro.name || t.proFallbackName)}</span>
            </div>
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              disabled={approving}
              onClick={async () => {
                setApproving(true);
                // Found by code audit: this try/finally had no catch -- approveLocationDisclosure()'s
                // own new catch (CustomerApp.jsx) now shows the real toast and re-throws;
                // catching (and doing nothing further) here is what stops that from also
                // becoming an unhandled rejection at this level.
                try { await onApproveDisclosure(); } catch { /* toasted by approveLocationDisclosure() */ } finally { setApproving(false); }
              }}
            >
              {approving ? <Loader2 size={15} className="spin" /> : <MapPin size={15} />} {t.disclosureConsentApproveBtn}
            </button>
            <div className="fineprint" style={{ marginTop: 10 }}><ShieldCheck size={12} /> {t.disclosureConsentNote}</div>
          </QuoteCard>
          </>
        );
      })()}

      {request.status === "booked" && bookedQuote && (() => {
        const pro = bookedQuote.pro;
        const fee = platformFee(bookedQuote.price);
        const net = netPayout(bookedQuote.price);
        return (
          <QuoteCard booked>
            <div className="quote-top">
              <button type="button" className="quote-top-link" onClick={() => setOpenProId(pro.id)}>
              <Avatar url={pro.avatarUrl} initials={pro.initials} />
              <div style={{ flex: 1 }}><div className="quote-name">{pro.name || t.proFallbackName}</div><TrustBadge rating={pro.rating} score={trustScore(pro)} scoreLabel={t.trustScoreLabel} fmt={fmt} /></div>
              </button>
              <PriceTag amount={bookedQuote.price} fmt={fmt} />
            </div>
            <div className="ticket-divider" />
            <div className="fee-row"><span>{t.platformFeeLabel}</span><PriceTag amount={fee} fmt={fmt} size="sm" /></div>
            <div className="fee-row fee-row-net"><span>{t.netPayoutLabel}</span><PriceTag amount={net} fmt={fmt} size="sm" /></div>
            <div className="fineprint" style={{ marginTop: 10 }}><ShieldCheck size={12} /> {t.guaranteeNote}</div>
            {/* Found by code audit: no busy state, no await, no catch at all -- a real
                refusal (complete_engagement()'s own refusal, a network error) used to
                leave the button sitting there tappable again with no feedback at all
                (markComplete()'s own new catch, CustomerApp.jsx, shows the real toast). */}
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              disabled={completing}
              onClick={async () => {
                setCompleting(true);
                try { await onComplete(); } catch { /* toasted by markComplete() */ } finally { setCompleting(false); }
              }}
            >
              {completing ? <Loader2 size={15} className="spin" /> : null} {t.markCompleteBtn}
            </button>
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowInvoice(true)}>{t.viewInvoiceBtn}</button>
          </QuoteCard>
        );
      })()}

      {request.status === "completed" && (
        <div className="empty-block"><Check size={22} color="var(--forest)" /><p>{t.completeMsg}</p><button className="btn-primary" onClick={onReview}>{t.leaveReviewBtn}</button><button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowInvoice(true)}>{t.viewInvoiceBtn}</button></div>
      )}

      {request.status === "reviewed" && (
        <QuoteCard><div className="quote-top"><Rating value={request.review.stars} size={16} /></div><p className="quote-msg">"{request.review.text}"</p><button className="btn-secondary" onClick={() => setShowInvoice(true)}>{t.viewInvoiceBtn}</button></QuoteCard>
      )}

      {(request.status === "completed" || request.status === "reviewed") && (
        <ServiceRecordSummary requestId={request.id} />
      )}

      {bookedQuote && (
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowReport(true)}>{t.reportIssueBtn}</button>
      )}

      {showInvoice && bookedQuote && <InvoiceSheet request={request} quote={bookedQuote} onClose={() => setShowInvoice(false)} />}
      {showReport && bookedQuote && (
        <ReportSheet
          reporterId={user.id}
          reportedWorkspaceId={bookedQuote.workspaceId}
          requestId={request.id}
          onClose={() => setShowReport(false)}
        />
      )}
      {openProId && <ProPublicProfileSheet proId={openProId} onClose={() => setOpenProId(null)} />}
    </Drawer>
  );
}
