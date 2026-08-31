// The request intake: describe a job by speaking, typing, and/or
// attaching photos; one Claude call classifies it against klussie's real service
// catalog and returns the same shape as the manual form (details/detailsJson/city/
// budget/whenPref), plus an ai_analysis record for the review screen and, later, the
// pro's lead view. Never auto-submits — the customer always reviews and can edit
// everything (including overriding the matched service) before it becomes a real request.
// initialText/initialPhotos let the conversation canvas hand off what it already
// captured (WP3/WP4) so the customer doesn't re-describe the job. Both default to empty,
// so every existing call site is unaffected. initialPhotos arrive as { file, previewUrl }
// with their preview URL already created — ownership transfers here rather than this
// component minting a second URL for the same file.
// initialResult lets the canvas hand over an analysis it already ran (WP5) so the same
// job isn't sent to the model twice. With one, the sheet opens straight at the stage
// that result implies — follow-up questions if the model asked any, otherwise review.
//
// The rules this follows — how many times to ask again, what counts as confident, what a
// reviewed result becomes — live in src/lib/aiIntakeModel.js. This file is the screen.
import { useState, useRef, useEffect } from "react";
import { X, Send, Camera, Mic, Sparkles, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useLang, LANGS } from "../lib/lang";
import { useAuth } from "../lib/auth.jsx";
import { Badge, Drawer } from "../design-system";
import { analyzeJobRequest, isSpeechRecognitionSupported, startSpeechRecognition } from "../lib/aiIntake";
import { WHEN_PREFS } from "../lib/requestStatus.js";
import { ServiceLocationField } from "./ServiceLocationField.jsx";
import {
  editableFromResult,
  initialStage,
  shouldAskFollowUp,
  confidenceTone,
  servicesForApi,
  canSubmitIntake,
  buildIntakeRequest,
} from "../lib/aiIntakeModel.js";

export function AiIntakeSheet({ onClose, onSubmitted, initialText = "", initialPhotos = [], initialResult = null }) {
  const { t, langCode, BASE_SERVICES, serviceInfo, whenLabel } = useLang();
  const { profile, activeWorkspace } = useAuth();
  const langMeta = LANGS.find((l) => l.code === langCode) || LANGS[0];

  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognizerRef = useRef(null);
  const [photos, setPhotos] = useState(() => initialPhotos.map(({ file, previewUrl }) => ({ file, previewUrl })));
  const photoInputRef = useRef(null);

  const seeded = editableFromResult(initialResult);
  const [stage, setStage] = useState(() => initialStage(initialResult)); // compose | followup | review
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(initialResult);
  const [priorQA, setPriorQA] = useState([]);
  const [round, setRound] = useState(0);

  const [editServiceId, setEditServiceId] = useState(seeded.serviceId);
  const [editDescription, setEditDescription] = useState(seeded.description);
  const [editBudget, setEditBudget] = useState(seeded.budget);
  const [editCity, setEditCity] = useState(profile?.city || "");
  const [editWhen, setEditWhen] = useState(seeded.when);
  const [location, setLocation] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      // Never revoke a handed-off URL: under StrictMode this cleanup fires once while
      // the component is still mounted, and killing a transferred preview leaves the
      // thumbnail pointing at a dead blob. Handed-off URLs are released on page unload.
      const transferred = new Set(initialPhotos.map((p) => p.previewUrl));
      photos.forEach((p) => { if (!transferred.has(p.previewUrl)) URL.revokeObjectURL(p.previewUrl); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      return;
    }
    try {
      recognizerRef.current = startSpeechRecognition(langMeta.locale, {
        onResult: ({ finalText, interimText }) => {
          if (finalText) setText((cur) => (cur ? cur + " " : "") + finalText);
          setInterimTranscript(interimText);
        },
        onEnd: () => { setListening(false); setInterimTranscript(""); },
        onError: () => { setListening(false); setInterimTranscript(""); },
      });
      setListening(true);
    } catch {
      setError(t.aiSpeechUnsupported);
    }
  };

  const addPhotos = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) return;
    setPhotos((p) => [...p, ...picked.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))].slice(0, 4));
  };
  const removePhoto = (previewUrl) => {
    setPhotos((p) => p.filter((ph) => ph.previewUrl !== previewUrl));
    URL.revokeObjectURL(previewUrl);
  };

  const applyResultToEditable = (res) => {
    const next = editableFromResult(res);
    setEditServiceId(next.serviceId);
    setEditDescription(next.description);
    setEditBudget(next.budget);
    setEditWhen(next.when);
  };

  const runAnalysis = async (qaForThisCall) => {
    if (listening) toggleListening();
    setLoading(true);
    setError("");
    try {
      const res = await analyzeJobRequest({
        text,
        voiceTranscript: null,
        photos: photos.map((p) => p.file),
        priorQA: qaForThisCall,
        services: servicesForApi(BASE_SERVICES, serviceInfo),
        locale: langCode,
      });
      setResult(res);
      setPriorQA(qaForThisCall);
      if (shouldAskFollowUp(res, round)) {
        setStage("followup");
      } else {
        applyResultToEditable(res);
        setStage("review");
      }
    } catch {
      // analyzeJobRequest() only ever throws AI_INTAKE_FAILED, a code -- never a display
      // string. The localized generic message is the only thing shown, on purpose (see
      // that module's own header for why trusting err.message here used to leak a raw
      // browser parser exception straight to the user).
      setError(t.aiGenericError);
    } finally {
      setLoading(false);
    }
  };

  const answerFollowUp = (question, answer) => {
    setRound((r) => r + 1);
    runAnalysis([...priorQA, { question, answer }]);
  };

  const skipFollowUp = () => {
    applyResultToEditable(result);
    setStage("review");
  };

  // C8, docs/engineering/TESTING.md §5.2 — "AI failure degrades to the manual form, no
  // dead end." Previously aspirational: the compose stage only ever showed the error
  // text, with no button to actually reach the manual form. The old services grid was
  // already replaced by this conversation canvas, so a
  // customer whose analysis failed had no way to create a request at all. The review
  // stage already *is* the manual form (a service picker, description, when/city/budget,
  // now also ServiceLocationField) — reused here rather than routing through
  // the retired category-grid flow, which no longer exists in the current UI.
  const useManualForm = () => {
    setResult({});
    applyResultToEditable({});
    setStage("review");
  };

  const canSubmit = canSubmitIntake({ serviceId: editServiceId, description: editDescription }) && !!location && !submitting;

  const handleFinalSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmitted(buildIntakeRequest({
        edited: { serviceId: editServiceId, description: editDescription, budget: editBudget, city: editCity, when: editWhen, location },
        result,
        baseServices: BASE_SERVICES,
        photos: photos.map((p) => p.file),
      }));
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer onClose={onClose}>
      {stage === "compose" && (
        <>
          <div className="sheet-title"><Sparkles size={18} /> {t.aiIntakeTitle}</div>
          <div className="sheet-sub">{t.aiIntakeSub}</div>

          <textarea
            className="textarea"
            rows={4}
            placeholder={t.aiComposerPlaceholder}
            value={text + (interimTranscript ? (text ? " " : "") + interimTranscript : "")}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="ai-input-row">
            <button type="button" className={"chip" + (listening ? " chip-on" : "")} onClick={toggleListening} disabled={!isSpeechRecognitionSupported()}>
              <Mic size={14} /> {listening ? t.aiListening : t.aiSpeakBtn}
            </button>
            <button type="button" className="chip" onClick={() => photoInputRef.current.click()}>
              <Camera size={14} /> {t.aiAddPhotoBtn}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addPhotos} />
          </div>
          {!isSpeechRecognitionSupported() && <div className="fineprint" style={{ justifyContent: "flex-start" }}>{t.aiSpeechUnsupported}</div>}

          {photos.length > 0 && (
            <div className="portfolio-grid" style={{ marginTop: 10 }}>
              {photos.map((p) => (
                <div key={p.previewUrl} className="portfolio-thumb">
                  <img src={p.previewUrl} alt="" />
                  <button type="button" className="photo-remove-btn" onClick={() => removePhoto(p.previewUrl)} aria-label="Remove photo"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="fineprint" style={{ color: "var(--amber)", justifyContent: "flex-start" }}><AlertTriangle size={12} /> {error}</div>}

          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            disabled={loading || (!text.trim() && photos.length === 0)}
            onClick={() => runAnalysis([])}
          >
            {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {loading ? t.aiAnalyzing : t.aiAnalyzeBtn}
          </button>
          {error && (
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={useManualForm}>
              {t.aiFillManuallyBtn}
            </button>
          )}
        </>
      )}

      {stage === "followup" && result && (
        <>
          <div className="sheet-title"><Sparkles size={18} /> {t.aiFollowUpTitle}</div>
          <div className="sheet-sub">{t.aiFollowUpSub}</div>
          {result.followUpQuestions.map((q) => (
            <div key={q.key} className="job-field">
              <div className="job-field-label">{q.question}</div>
              <div className="chiprow">
                {q.options.map((opt) => (
                  <button key={opt} type="button" className="chip" disabled={loading} onClick={() => answerFollowUp(q.question, opt)}>{opt}</button>
                ))}
              </div>
            </div>
          ))}
          {loading && <div className="fineprint" style={{ justifyContent: "flex-start" }}><Loader2 size={12} className="spin" /> {t.aiAnalyzing}</div>}
          <button className="btn-secondary" style={{ marginTop: 10 }} disabled={loading} onClick={skipFollowUp}>{t.aiSkipFollowUp}</button>
        </>
      )}

      {stage === "review" && result && (
        <>
          <div className="sheet-title"><Sparkles size={18} /> {t.aiReviewTitle}</div>
          <div className="sheet-sub">
            <Badge tone={confidenceTone(result)}>{result.confidence}% {t.aiConfidenceLabel}</Badge>
          </div>

          <label className="field-label">{t.aiDetectedServiceLabel}</label>
          <div className="chiprow" style={{ marginBottom: 14 }}>
            {BASE_SERVICES.map((s) => (
              <button key={s.id} type="button" className={"chip" + (editServiceId === s.id ? " chip-on" : "")} onClick={() => setEditServiceId(s.id)}>
                {serviceInfo(s.id).name}
              </button>
            ))}
          </div>

          <label className="field-label">{t.detailsLabel}</label>
          <textarea className="textarea" rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />

          {result.possibleCauses?.length > 0 && (
            <div className="job-details-summary" style={{ marginBottom: 14 }}>
              <div className="job-field-label" style={{ marginBottom: 4 }}>{t.aiPossibleCausesLabel}</div>
              {result.possibleCauses.map((c) => <div key={c} className="job-details-row"><span>{c}</span></div>)}
            </div>
          )}

          <label className="field-label">{t.whenLabel}</label>
          <div className="chiprow">
            {WHEN_PREFS.map((w) => (
              <button key={w} type="button" className={"chip" + (editWhen === w ? " chip-on" : "")} onClick={() => setEditWhen(w)}>{whenLabel(w)}</button>
            ))}
          </div>

          <ServiceLocationField workspaceId={activeWorkspace?.workspace_id} onChange={setLocation} />

          <label className="field-label">{t.cityLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={editCity} onChange={(e) => setEditCity(e.target.value)} />
          </div>

          <label className="field-label">{t.budgetLabel}</label>
          <div className="search" style={{ marginBottom: 18 }}>
            <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>€</span>
            <input placeholder={t.budgetPlaceholder} value={editBudget} onChange={(e) => setEditBudget(e.target.value)} />
          </div>

          {photos.length > 0 && (
            <div className="portfolio-grid" style={{ marginBottom: 14 }}>
              {photos.map((p) => (
                <div key={p.previewUrl} className="portfolio-thumb"><img src={p.previewUrl} alt="" /></div>
              ))}
            </div>
          )}

          <button className="btn-primary" disabled={!canSubmit} onClick={handleFinalSubmit}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {t.sendRequestBtn}
          </button>
          <div className="fineprint"><ShieldCheck size={12} /> {t.privacyNote}</div>
        </>
      )}
    </Drawer>
  );
}
