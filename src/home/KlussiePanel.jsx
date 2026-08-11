// The Klussie tab: the conversation, and the two things worth knowing while you're
// not having one.
//
// Order is deliberate and matches the brief: intent first, then how to answer. The
// customer says what kind of thing this is before being asked to pick between talking,
// typing and photographing — because "er is iets kapot" is the thought they arrived
// with, and "vertel het me gewoon" is not.
import { ChevronRight } from "lucide-react";
import { TextComposer } from "../design-system";
import { isSpeechRecognitionSupported } from "../lib/aiIntake";
import { interpolate } from "../lib/homeStrings.js";
import { kindOf } from "../lib/homeToday.js";
import { IntentSuggestions } from "./IntentSuggestions.jsx";
import { SafetyNotice } from "./SafetyNotice.jsx";
import { HomeTodayCard } from "./HomeTodayCard.jsx";
import { ConversationCanvas } from "./ConversationCanvas.jsx";
import { VoiceCapturePanel } from "./VoiceCapturePanel.jsx";
import { PhotoCapturePanel } from "./PhotoCapturePanel.jsx";
import { useIntentFlow } from "./useIntentFlow.js";

const ACTIVE_KIND_TITLE = {
  quotes_ready: "todayQuotesTitle",
  booked: "todayBookedTitle",
  awaiting_pro: "todayAwaitingTitle",
  collecting: "todayCollectingTitle",
  needs_review: "todayReviewTitle",
};

function ActiveRequests({ t, requests, serviceInfo, onOpenRequest }) {
  if (!requests.length) return null;
  return (
    <section className="home-active" aria-labelledby="home-active-heading">
      <h2 className="home-section-title" id="home-active-heading">{t.homeActiveTitle}</h2>
      <ul className="home-active-list">
        {requests.map((r) => (
          <li key={r.id}>
            <button type="button" className="home-active-row" onClick={() => onOpenRequest(r.id)}>
              <span className="home-active-text">
                <span className="home-active-name">{serviceInfo(r.serviceId).name}</span>
                <span className="home-active-state">{t[ACTIVE_KIND_TITLE[kindOf(r)]] || ""}</span>
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KlussiePanel({
  t, fmt, serviceInfo, proBadgeLabel, homeCtx, conv, photoInputRef, onOpenRequest, onSetUpHome,
}) {
  const flow = useIntentFlow({
    t,
    knownFacts: homeCtx.knownFacts,
    onSubmit: (text) => conv.beginConversation({ recap: text, text }),
  });

  if (conv.conversation) {
    return (
      <ConversationCanvas
        conversation={conv.conversation}
        booking={conv.booking}
        canDirectBook={conv.canDirectBook}
        onBook={conv.bookProfessional}
        onContinue={conv.continueToSheet}
        t={t}
        fmt={fmt}
        serviceInfo={serviceInfo}
        proBadgeLabel={proBadgeLabel}
      />
    );
  }

  if (conv.capture === "voice") {
    return (
      <VoiceCapturePanel
        onDone={(transcript) => { conv.setCapture(null); conv.beginConversation({ recap: transcript, text: transcript }); }}
        onCancel={() => conv.setCapture(null)}
      />
    );
  }

  if (conv.capture) {
    const context = flow.contextForPhoto();
    return (
      <PhotoCapturePanel
        file={conv.capture.file}
        previewUrl={conv.capture.previewUrl}
        // Ownership of previewUrl transfers onward here — deliberately not revoked,
        // since the conversation and then the sheet render that exact URL. Cancelling
        // instead goes through closeCapture, which does release it.
        onDone={(file, analysis) => {
          const photo = { file, previewUrl: conv.capture.previewUrl };
          conv.setCapture(null);
          // Whatever was already answered rides along with the photo, so choosing to
          // show something mid-sequence never throws away what was already said.
          conv.beginConversation({
            recap: context || t.convPhotoRecap,
            text: context || undefined,
            photos: [photo],
            analysis,
          });
        }}
        onCancel={conv.closeCapture}
      />
    );
  }

  const todayServiceName = homeCtx.today ? serviceInfo(homeCtx.today.request.serviceId).name : "";

  return (
    <>
      <IntentSuggestions t={t} activeIntentId={flow.intentId} onSelect={flow.selectIntent} />

      {flow.safetyPending ? (
        <SafetyNotice t={t} onBack={flow.dismissSafety} onContinue={flow.acceptSafetyAndContinue} />
      ) : (
        <AskArea t={t} flow={flow} conv={conv} photoInputRef={photoInputRef} />
      )}

      <HomeTodayCard
        t={t}
        item={homeCtx.today}
        serviceName={todayServiceName}
        onOpenRequest={onOpenRequest}
        onSetUpHome={onSetUpHome}
      />

      <ActiveRequests t={t} requests={homeCtx.activeRequests} serviceInfo={serviceInfo} onOpenRequest={onOpenRequest} />
    </>
  );
}

// The composer, plus the one follow-up question in front of it when an intent is
// running. Split out to keep KlussiePanel a dispatcher between four states rather than
// a single long render (ENGINEERING_STANDARDS.md, "no function over 40 lines").
function AskArea({ t, flow, conv, photoInputRef }) {
  const question = flow.currentQuestion;
  return (
    <div className="home-ask">
      {question && (
        <div className="home-ask-head">
          <p className="home-ask-question">{t[question.questionKey]}</p>
          <p className="home-ask-progress">
            {interpolate(t.followUpProgress, { n: flow.stepIndex + 1, total: flow.questions.length })}
          </p>
        </div>
      )}

      <TextComposer
        value={flow.draft}
        onChange={flow.setDraft}
        onSubmit={flow.submitAnswer}
        inputRef={flow.inputRef}
        placeholder={t.homeComposerPlaceholder}
        label={question ? t.homeAnswerLabel : t.convComposerLabel}
        submitLabel={t.homeSendAction}
        icon={<ChevronRight size={14} />}
        onVoice={() => conv.setCapture("voice")}
        voiceLabel={t.homeVoiceAction}
        voiceDisabled={!isSpeechRecognitionSupported()}
        voiceDisabledTitle={t.aiSpeechUnsupported}
        onPhoto={() => photoInputRef.current?.click()}
        photoLabel={t.homePhotoAction}
        emphasisePhoto={question?.answerMode === "photo"}
      />

      {question && (
        <div className="home-ask-nav">
          {flow.canGoBack && (
            <button type="button" className="home-ask-link" onClick={flow.back}>{t.followUpBack}</button>
          )}
          <button type="button" className="home-ask-link" onClick={flow.skipRest} disabled={!flow.hasAnswered}>
            {t.followUpSkip}
          </button>
        </div>
      )}
    </div>
  );
}
