// Client-side helpers for the AI job intake flow. Keeps all AI/browser-API detail out
// of the UI components (AiIntakeSheet in App.jsx just calls these) — the vision/speech
// implementation can change (e.g. swap browser Web Speech API for a hosted STT service
// later) without touching UI code.
import { supabase } from "./supabaseClient";

const MAX_IMAGE_DIMENSION = 1024;
const IMAGE_QUALITY = 0.72;

// Downscales before sending, both to control API cost and keep the request payload
// small — a full-resolution phone photo is far more detail than the model needs.
function fileToCompressedBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Image compression failed")); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            resolve({ mediaType: "image/jpeg", data: base64 });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        IMAGE_QUALITY
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

// A stable code, never a display string -- AiIntakeSheet.jsx's own catch always shows its
// localized t.aiGenericError instead of trusting err.message, for two real reasons found
// live, 2026-08-31: (1) a non-JSON response (this route is unreachable under plain `npm
// run dev`, so a 404 HTML page is the common case on staging today) makes res.json() throw
// its own raw parser exception -- "Failed to execute 'json' on 'Response': Unexpected end
// of JSON input" -- straight into the UI, completely unlocalized and meaningless to a real
// user; (2) api/ai-intake.js's own error strings ("AI analysis failed. Please try again.",
// "Missing service catalog.", a raw err.message from whatever failed server-side) are all
// hardcoded English with no locale handling of their own, so surfacing them verbatim would
// be wrong in every other one of this app's 9 other languages regardless. One honest,
// already-localized message covers every failure this function can have; the real recovery
// path either way is the sheet's own "Vul handmatig in" fallback, not the wording of why.
export const AI_INTAKE_FAILED = "AI_INTAKE_FAILED";

// { text, voiceTranscript, photos: File[], priorQA: [{question, answer}], services: [{id,name,category,blurb}], locale }
export async function analyzeJobRequest({ text, voiceTranscript, photos, priorQA, services, locale }) {
  const encodedPhotos = await Promise.all((photos || []).map(fileToCompressedBase64));

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(AI_INTAKE_FAILED);

  const res = await fetch("/api/ai-intake", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ text, voiceTranscript, photos: encodedPhotos, priorQA, services, locale }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(AI_INTAKE_FAILED);
  }
  if (!res.ok) throw new Error(AI_INTAKE_FAILED);
  return data;
}

export function isSpeechRecognitionSupported() {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Live microphone input level, 0..1, sampled per animation frame.
//
// Deliberately separate from startSpeechRecognition: the Web Speech API gives us words
// but never exposes audio levels, and EXPERIENCE_VISION.md §7 is explicit that the
// listening waveform must be "tied to actual audio input, not decorative looping" — so
// a faked animation would miss the point of the requirement. Both can hold the mic at
// once; the permission prompt is shared, not doubled.
//
// Throws if the browser has no getUserMedia or the user denies the mic. Callers should
// degrade to a still indicator rather than substituting a fake animation.
export async function startAudioLevelMeter({ onLevel }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(analyser);

  const samples = new Uint8Array(analyser.frequencyBinCount);
  let frame = null;
  const tick = () => {
    analyser.getByteTimeDomainData(samples);
    // RMS deviation from the 128 midpoint. The x3 lifts normal speech into a visible
    // range — without it a conversational voice barely moves the bars.
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const deviation = (samples[i] - 128) / 128;
      sumSquares += deviation * deviation;
    }
    onLevel(Math.min(1, Math.sqrt(sumSquares / samples.length) * 3));
    frame = requestAnimationFrame(tick);
  };
  tick();

  return {
    stop: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      ctx.close();
    },
  };
}

// Thin wrapper around the browser's native speech recognition. Returns a controller
// with .stop(); callbacks report interim + final transcript as the user speaks.
export function startSpeechRecognition(locale, { onResult, onEnd, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) throw new Error("Speech recognition not supported in this browser");

  const recognizer = new SpeechRecognition();
  recognizer.lang = locale;
  recognizer.continuous = true;
  recognizer.interimResults = true;

  recognizer.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    onResult({ finalText, interimText });
  };
  recognizer.onerror = (event) => onError?.(event.error);
  recognizer.onend = () => onEnd?.();

  recognizer.start();
  return { stop: () => recognizer.stop() };
}
