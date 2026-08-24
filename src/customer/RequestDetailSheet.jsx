// One request, in whatever state it is in — the customer's single view of a job from
// "collecting quotes" through to "reviewed". Each status renders the one action that
// status actually affords, rather than a panel of buttons most of which don't apply.
//
// The timeline and the commission breakdown both come from src/lib — the lifecycle from
// requestStatus.js, the fee and payout from billing.js.
import { useState } from "react";
import { Check, Clock, MessageCircle, ShieldCheck } from "lucide-react";
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

export function RequestDetailSheet({ request, onClose, onAccept, onComplete, onReview, onMessage }) {
  const { t, fmt, serviceInfo, proBadgeLabel, whenLabel } = useLang();
  const { user } = useAuth();
  const [showInvoice, setShowInvoice] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [openProId, setOpenProId] = useState(null);
  const info = serviceInfo(request.serviceId);
  const bookedQuote = request.quotes.find((q) => q.proId === request.bookedProId);
  const steps = timelineSteps(request.status);

  return (
    <Drawer onClose={onClose}>
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
                      <div className="quote-name">{pro.name} {proBadgeLabel(pro.badgeTier) && <Badge tone="forest">{proBadgeLabel(pro.badgeTier)}</Badge>}</div>
                    <TrustBadge rating={pro.rating} reviewCount={pro.reviews} score={trustScore(pro)} scoreLabel={t.trustScoreLabel} fmt={fmt} />
                  </div>
                  </button>
                  <PriceTag amount={q.price} fmt={fmt} />
                </div>
                <button className="btn-secondary" onClick={() => onAccept(q.id)}>{t.acceptQuoteBtn}</button>
              </QuoteCard>
            );
          })}
        </>
      )}

      {request.status === "booked" && bookedQuote && (() => {
        const pro = bookedQuote.pro;
        const fee = platformFee(bookedQuote.price);
        const net = netPayout(bookedQuote.price);
        return (
          <QuoteCard booked>
            <div className="quote-top">
              <button type="button" className="quote-top-link" onClick={() => setOpenProId(pro.id)}>
              <Avatar url={pro.avatarUrl} initials={pro.initials} />
              <div style={{ flex: 1 }}><div className="quote-name">{pro.name}</div><TrustBadge rating={pro.rating} score={trustScore(pro)} scoreLabel={t.trustScoreLabel} fmt={fmt} /></div>
              </button>
              <PriceTag amount={bookedQuote.price} fmt={fmt} />
            </div>
            <div className="ticket-divider" />
            <div className="fee-row"><span>{t.platformFeeLabel}</span><PriceTag amount={fee} fmt={fmt} size="sm" /></div>
            <div className="fee-row fee-row-net"><span>{t.netPayoutLabel}</span><PriceTag amount={net} fmt={fmt} size="sm" /></div>
            <div className="fineprint" style={{ marginTop: 10 }}><ShieldCheck size={12} /> {t.guaranteeNote}</div>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={onComplete}>{t.markCompleteBtn}</button>
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
