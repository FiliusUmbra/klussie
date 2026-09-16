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
import { KIND_COPY } from "../lib/homeTodayCopy.js";
import { IntentSuggestions } from "./IntentSuggestions.jsx";
import { SafetyNotice } from "./SafetyNotice.jsx";
import { HomeTodayCard } from "./HomeTodayCard.jsx";
import { ConversationCanvas } from "./ConversationCanvas.jsx";
import { VoiceCapturePanel } from "./VoiceCapturePanel.jsx";
import { PhotoCapturePanel } from "./PhotoCapturePanel.jsx";
import { useIntentFlow } from "./useIntentFlow.js";

// Homepage redesign, 2026-09-15 — rows now carry the same icon+tone badge
// HomeTodayCard's own card already uses (reusing its exported KIND_COPY rather than
// keeping this file's own separate title-only copy of the same kind->titleKey
// mapping), so a running request reads the same visual language as the highlighted
// one above it, not a plainer, icon-less row that happens to sit in the same section.
function ActiveRequests({ t, requests, serviceInfo, onOpenRequest }) {
  if (!requests.length) return null;
  return (
    <ul className="home-active-list">
      {requests.map((r) => {
        const copy = KIND_COPY[kindOf(r)];
        return (
          <li key={r.id}>
            <button type="button" className="home-active-row" onClick={() => onOpenRequest(r.id)}>
              {copy && (
                <span className={`home-active-glyph home-active-glyph-${copy.tone}`} aria-hidden="true">
                  <copy.icon size={15} />
                </span>
              )}
              <span className="home-active-text">
                <span className="home-active-name">{serviceInfo(r.serviceId).name}</span>
                <span className="home-active-state">{copy ? t[copy.titleKey] : ""}</span>
              </span>
              <ChevronRight className="home-active-chevron" size={15} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function KlussiePanel({
  t, fmt, serviceInfo, proBadgeLabel, homeCtx, conv, photoInputRef, onOpenRequest, onSetUpHome, onBrowseCategories,
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
        <>
          <AskArea t={t} flow={flow} conv={conv} photoInputRef={photoInputRef} />
          {/* ADR-0033 (2026-09-15) — the real entry point into AiIntakeSheet's own new
              category grid (compose stage). Before this, AiIntakeSheet only ever opened
              pre-seeded with an already-run AI result (useConversation.js's own onStart
              call, after analysis) -- there was no live path that reached its compose
              stage at all, which would have made that grid unreachable dead code. Hidden
              once a question is already running, the same way the intent tiles above stay
              out of the way mid-flow. */}
          {onBrowseCategories && !flow.currentQuestion && (
            <button type="button" className="home-ask-link" onClick={onBrowseCategories}>
              {t.homeBrowseCategoriesBtn}
            </button>
          )}
        </>
      )}

      {/* "Vandaag voor jouw woning" and "Loopt op dit moment" merge under one heading
          (Homepage redesign, 2026-09-15) -- two sections that happened to look almost
          identical now read as one list of things worth knowing, not two headed
          blocks in a row. HomeTodayCard's own highlighted item (if any) leads; other
          running requests, if any, follow directly under it -- both card types now
          share the same icon-badge visual language (see ActiveRequests's own header
          above for why). */}
      <section className="home-foryou" aria-labelledby="home-foryou-heading">
        <h2 className="home-section-title" id="home-foryou-heading">{t.homeForYouTitle}</h2>
        <HomeTodayCard
          t={t}
          item={homeCtx.today}
          serviceName={todayServiceName}
          onOpenRequest={onOpenRequest}
          onSetUpHome={onSetUpHome}
        />
        <ActiveRequests t={t} requests={homeCtx.activeRequests} serviceInfo={serviceInfo} onOpenRequest={onOpenRequest} />
      </section>
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
