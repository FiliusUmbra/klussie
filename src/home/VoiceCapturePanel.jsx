// Owns the recognizer and the mic meter; the design system's VoiceCapture stays
// presentational. Metering is best-effort: if getUserMedia is unavailable or denied,
// recognition still runs and the bars sit still rather than animating on nothing.
//
// Moved out of src/App.jsx unchanged in behaviour — only its home changed, so the
// homepage's components can live together and App.jsx stops growing.
import { useEffect, useRef, useState } from "react";
import { VoiceCapture } from "../design-system";
import { useLang, speechLocaleFor } from "../lib/lang";
import { startSpeechRecognition, startAudioLevelMeter } from "../lib/aiIntake";

export function VoiceCapturePanel({ onDone, onCancel }) {
  const { t, langCode } = useLang();
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [meterAvailable, setMeterAvailable] = useState(true);
  const [state, setState] = useState("listening");
  const recognizerRef = useRef(null);
  const meterRef = useRef(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  // Set the moment recognition is told to stop (explicit tap or the recognizer ending on
  // its own) — a guard against a stray onresult arriving after we've already committed
  // the transcript below, which would otherwise append the same words a second time.
  const stoppedRef = useRef(false);

  // The recognizer is not guaranteed to convert the last thing said into a final result
  // before ending — a real, observed Web Speech API inconsistency, not a hypothetical:
  // an explicit stop, a trailing pause, or the browser's own silence timeout can all end
  // recognition with the tail of what was said still sitting in `interimText`, never
  // finalized. Without folding it in here, words that were visibly on screen a moment
  // ago silently vanish — and if nothing was ever finalized either, the whole utterance
  // is lost with no explanation (the "done, but nothing to confirm" effect below then
  // reads it as if the customer never spoke at all).
  const commitPendingInterim = () => {
    const pending = interimRef.current.trim();
    if (!pending) return;
    finalRef.current = (finalRef.current ? finalRef.current + " " : "") + pending;
    interimRef.current = "";
    setFinalText(finalRef.current);
    setInterim(""); // already folded into finalText — leaving it set would echo it twice
  };

  useEffect(() => {
    let cancelled = false;
    try {
      recognizerRef.current = startSpeechRecognition(speechLocaleFor(langCode), {
        onResult: ({ finalText: done, interimText }) => {
          if (stoppedRef.current) return;
          if (done) {
            finalRef.current = (finalRef.current ? finalRef.current + " " : "") + done;
            setFinalText(finalRef.current);
          }
          interimRef.current = interimText;
          setInterim(interimText);
        },
        onEnd: () => { if (!cancelled) { commitPendingInterim(); setState("done"); } },
        onError: () => { if (!cancelled) { commitPendingInterim(); setState("done"); } },
      });
    } catch {
      onCancel();
      return;
    }

    startAudioLevelMeter({ onLevel: (v) => { if (!cancelled) setLevel(v); } })
      .then((meter) => {
        if (cancelled) { meter.stop(); return; }
        meterRef.current = meter;
      })
      .catch(() => { if (!cancelled) setMeterAvailable(false); });

    return () => {
      cancelled = true;
      recognizerRef.current?.stop();
      meterRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recognition ended with nothing usable — no point confirming an empty transcript.
  useEffect(() => {
    if (state === "done" && !finalRef.current.trim()) onCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const stop = () => {
    stoppedRef.current = true;
    recognizerRef.current?.stop();
    meterRef.current?.stop();
    commitPendingInterim();
    setState("done");
  };

  const spoken = [finalText, interim].filter(Boolean).join(" ");

  return (
    <div className="conv-capture">
      <VoiceCapture
        state={state}
        level={level}
        meterAvailable={meterAvailable}
        transcript={spoken || t.convVoiceWaiting}
        listeningLabel={t.convVoiceListening}
        doneLabel={t.convVoiceGotIt}
        stopLabel={t.convVoiceStop}
        onStop={stop}
      />
      {/* finalText mirrors finalRef; the ref exists only so the recognizer callback can
          accumulate without a stale closure, and must not be read during render. */}
      {state === "done" && finalText.trim() && (
        <button type="button" className="btn-primary" onClick={() => onDone(finalText.trim())}>
          {t.convContinue}
        </button>
      )}
    </div>
  );
}
