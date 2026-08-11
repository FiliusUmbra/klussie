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

  useEffect(() => {
    let cancelled = false;
    try {
      recognizerRef.current = startSpeechRecognition(speechLocaleFor(langCode), {
        onResult: ({ finalText: done, interimText }) => {
          if (done) {
            finalRef.current = (finalRef.current ? finalRef.current + " " : "") + done;
            setFinalText(finalRef.current);
          }
          setInterim(interimText);
        },
        onEnd: () => { if (!cancelled) setState("done"); },
        onError: () => { if (!cancelled) setState("done"); },
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
    recognizerRef.current?.stop();
    meterRef.current?.stop();
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
