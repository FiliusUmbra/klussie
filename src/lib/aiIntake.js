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

// { text, voiceTranscript, photos: File[], priorQA: [{question, answer}], services: [{id,name,category,blurb}], locale }
export async function analyzeJobRequest({ text, voiceTranscript, photos, priorQA, services, locale }) {
  const encodedPhotos = await Promise.all((photos || []).map(fileToCompressedBase64));

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to use AI intake.");

  const res = await fetch("/api/ai-intake", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ text, voiceTranscript, photos: encodedPhotos, priorQA, services, locale }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "AI analysis failed");
  return data;
}

export function isSpeechRecognitionSupported() {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
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
