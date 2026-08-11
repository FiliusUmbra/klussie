// Choosing an intent, then answering its follow-up questions one at a time.
//
// The homepage only *begins* the conversation — it asks the questions the intent
// makes obvious, then hands everything to the existing AI intake, which asks whatever
// it still needs. No questionnaire lives here: the sequence comes from
// src/lib/homeIntents.js, and the customer can send at any point.
//
// One question at a time, with a real Back that restores the previous answer, because
// a wizard you can't reverse is a form with extra steps.
import { useCallback, useMemo, useRef, useState } from "react";
import { questionsFor, findIntent, detectsHazard, composeIntentTranscript } from "../lib/homeIntents.js";

export function useIntentFlow({ t, knownFacts, onSubmit }) {
  const [intentId, setIntentId] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState("");
  // { text } while a hazard-looking answer is waiting on the customer's confirmation.
  const [safetyPending, setSafetyPending] = useState(null);
  const inputRef = useRef(null);

  // Memoised because questionsFor returns a fresh array each call, and transcriptWith
  // below depends on it — without this every render would rebuild that callback.
  const questions = useMemo(() => (intentId ? questionsFor(intentId, knownFacts) : []), [intentId, knownFacts]);
  const currentQuestion = questions[stepIndex] || null;
  const intent = findIntent(intentId);

  const focusComposer = () => {
    // Focus, not scroll-into-view: moving the page under someone who just tapped is
    // disorienting, and the composer already sits directly beneath the intents.
    inputRef.current?.focus();
  };

  const selectIntent = (id) => {
    // Tapping the chosen intent again clears it, so a mis-tap is one tap to undo.
    const next = id === intentId ? null : id;
    setIntentId(next);
    setStepIndex(0);
    setAnswers({});
    setDraft("");
    setSafetyPending(null);
    if (next) focusComposer();
  };

  // Everything said so far, as one sentence in the customer's own words. Used both to
  // start the conversation and to caption a photo taken mid-sequence.
  const transcriptWith = useCallback((extraQuestionId, extraAnswer) => {
    if (!intent) return (extraAnswer || "").trim();
    const collected = { ...answers };
    if (extraQuestionId) collected[extraQuestionId] = extraAnswer;
    const entries = questions
      .filter((q) => collected[q.id])
      .map((q) => ({ question: t[q.questionKey], answer: collected[q.id] }));
    return composeIntentTranscript({ intentLabel: t[intent.labelKey], entries });
  }, [answers, intent, questions, t]);

  const finish = (text) => {
    const composed = text.trim();
    if (!composed) return;
    onSubmit(composed);
    selectIntent(null);
  };

  const submitAnswer = () => {
    const value = draft.trim();
    if (!value) return;
    // A hazard mention interrupts before anything else happens with it — including
    // before it becomes the last answer of a finished sequence.
    if (detectsHazard(value)) { setSafetyPending({ text: value }); return; }
    acceptAnswer(value);
  };

  const acceptAnswer = (value) => {
    if (!currentQuestion) { finish(value); return; }
    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(nextAnswers);
    setDraft("");
    if (stepIndex + 1 < questions.length) { setStepIndex(stepIndex + 1); focusComposer(); return; }
    finish(transcriptWith(currentQuestion.id, value));
  };

  const back = () => {
    if (stepIndex === 0) return;
    const previous = questions[stepIndex - 1];
    setStepIndex(stepIndex - 1);
    setDraft(answers[previous.id] || "");
    focusComposer();
  };

  // "Sla over en verstuur" — send what's already been said rather than abandoning it.
  const skipRest = () => {
    const composed = transcriptWith(currentQuestion?.id, draft.trim());
    if (composed.trim()) finish(composed);
  };

  return {
    intentId, intent, selectIntent,
    questions, currentQuestion, stepIndex,
    draft, setDraft, inputRef,
    submitAnswer, back, skipRest,
    canGoBack: stepIndex > 0,
    hasAnswered: Object.keys(answers).length > 0 || !!draft.trim(),
    safetyPending,
    dismissSafety: () => setSafetyPending(null),
    acceptSafetyAndContinue: () => { const pending = safetyPending; setSafetyPending(null); if (pending) acceptAnswer(pending.text); },
    // The caption a photo taken mid-sequence carries, so context isn't lost when the
    // customer answers "can you show it?" with an actual photo.
    contextForPhoto: () => transcriptWith(currentQuestion?.id, draft.trim()),
  };
}
