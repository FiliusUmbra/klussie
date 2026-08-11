// The unfold: recap → understanding → professional → booking → relief, all on the
// same canvas, never a page change.
//
// Presentation for the state useConversation.js owns. Extracted from src/App.jsx as
// part of the homepage redesign; the states, copy rules, and ADR-0012 constraints are
// unchanged.
import { Loader2, Check } from "lucide-react";
import {
  Avatar, Badge, PriceTag, QuoteCard, TrustBadge, AIMessage,
  UnfoldPanel, UnfoldItem, RecentWorkStrip,
} from "../design-system";
import { trustScore } from "../lib/pros";

// "Supply-line leak · Plumbing · Urgent" — the customer's own problem reflected back,
// structured. Only parts the model actually returned are shown.
function understandingLine(analysis, t, serviceInfo) {
  const service = analysis.matchedServiceId ? serviceInfo(analysis.matchedServiceId)?.name : null;
  const urgency = analysis.urgency ? t[`convUrgency_${analysis.urgency}`] : null;
  return [analysis.problem, service, urgency].filter(Boolean).join(" · ");
}

function ProfessionalCard({ conversation, t, fmt, proBadgeLabel }) {
  return (
    <QuoteCard className="conv-pro">
      <div className="conv-pro-top">
        <Avatar url={conversation.pro.avatarUrl} initials={conversation.pro.initials} />
        <div className="conv-pro-meta">
          <div className="conv-pro-name">
            {conversation.pro.name}
            {proBadgeLabel(conversation.pro.badgeTier) && <Badge tone="forest">{proBadgeLabel(conversation.pro.badgeTier)}</Badge>}
          </div>
          <TrustBadge
            rating={conversation.pro.rating}
            reviewCount={conversation.pro.reviews}
            score={trustScore(conversation.pro)}
            scoreLabel={t.trustScoreLabel}
            fmt={fmt}
          />
        </div>
      </div>
      <RecentWorkStrip items={conversation.work} label={t.convRecentWork} />
      {/* An estimate from the analysis, never a price. No quote exists at this point in
          the flow, and presenting a range as if it were a firm price is exactly the
          shortcut Constitution Rule 9 rules out. */}
      {conversation.analysis?.estimatedBudget && (
        <div className="conv-pro-estimate">
          {t.convEstimateLabel}{" "}
          <b>
            <PriceTag amount={conversation.analysis.estimatedBudget.min} fmt={fmt} />
            {" – "}
            <PriceTag amount={conversation.analysis.estimatedBudget.max} fmt={fmt} />
          </b>
        </div>
      )}
    </QuoteCard>
  );
}

export function ConversationCanvas({
  conversation, booking, canDirectBook, onBook, onContinue,
  t, fmt, serviceInfo, proBadgeLabel,
}) {
  const booked = booking === "done";

  return (
    <UnfoldPanel label={t.convProgressLabel}>
      {/* §7: at Relief "everything else quiets — trust strip and confirmation are the
          only things still visible." The recap, the understanding, and the pro card
          have all done their job by then; leaving them up would make the moment the
          customer can stop worrying look like just another row in a list. */}
      {!booked && (
        <>
          <UnfoldItem>
            <div className="conv-recap">{conversation.recap}</div>
          </UnfoldItem>

          {conversation.analyzing && (
            <UnfoldItem>
              <div className="conv-thinking"><Loader2 size={14} className="spin" /> {t.aiAnalyzing}</div>
            </UnfoldItem>
          )}

          {conversation.analysis && (
            <UnfoldItem>
              <AIMessage label={t.aiAnalysisLabel} confidence={Math.round(conversation.analysis.confidence)}>
                <div className="conv-understanding-line">{understandingLine(conversation.analysis, t, serviceInfo)}</div>
              </AIMessage>
            </UnfoldItem>
          )}

          {conversation.failed && (
            <UnfoldItem>
              <div className="conv-thinking">{t.aiGenericError}</div>
            </UnfoldItem>
          )}

          {conversation.pro && (
            <UnfoldItem>
              <ProfessionalCard conversation={conversation} t={t} fmt={fmt} proBadgeLabel={proBadgeLabel} />
            </UnfoldItem>
          )}

          {conversation.pro === null && (
            <UnfoldItem>
              <div className="conv-thinking">{t.convNoProYet}</div>
            </UnfoldItem>
          )}
        </>
      )}

      {/* Relief (§4): everything else quiets, and this is what's left. It says the
          request is placed and who has it — never that the job is confirmed, and never
          when anyone arrives. Nobody has agreed to a time at this point (ADR-0012), so
          the prototype's "arrives today" cannot be told here. */}
      {booked ? (
        <UnfoldItem>
          <div className="conv-relief">
            <div className="conv-relief-mark"><Check size={18} /></div>
            <div className="conv-relief-title">{t.convReliefTitle}</div>
            <div className="conv-relief-sub">{t.convReliefSub.replace("{name}", conversation.pro.name)}</div>
          </div>
        </UnfoldItem>
      ) : (
        !conversation.analyzing && (
          <UnfoldItem delayIndex={1}>
            <BookingActions
              conversation={conversation}
              booking={booking}
              canDirectBook={canDirectBook}
              onBook={onBook}
              onContinue={onContinue}
              t={t}
            />
          </UnfoldItem>
        )
      )}
    </UnfoldPanel>
  );
}

function BookingActions({ conversation, booking, canDirectBook, onBook, onContinue, t }) {
  return (
    <>
      <div className="conv-actions-row">
        {canDirectBook && (
          <button type="button" className="btn-primary conv-book" onClick={onBook} disabled={booking === "saving"}>
            {booking === "saving" ? (
              <><Loader2 size={14} className="spin" /> {t.convBookingSaving}</>
            ) : (
              t.convBookCta.replace("{name}", conversation.pro.name)
            )}
          </button>
        )}
        {/* Never the only way forward: the request still exists as a normal one if the
            customer would rather fill it in themselves. */}
        <button
          type="button"
          className={(canDirectBook ? "btn-secondary" : "btn-primary") + " conv-continue"}
          onClick={onContinue}
        >
          {canDirectBook ? t.convBookDetails : t.convContinue}
        </button>
      </div>
      {/* UX_PATTERNS.md names error handling as this app's biggest gap; a failed booking
          says so and leaves the button usable rather than going quiet. */}
      {booking === "error" && <div className="conv-book-error" role="alert">{t.convBookingFailed}</div>}
    </>
  );
}
