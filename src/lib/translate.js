// Client-side wrapper for the message-translation serverless function. See
// src/lib/aiIntake.js for the sibling AI-intake wrapper — same pattern, kept in a
// separate module since translation is called from a different part of the UI
// (ConversationSheet) on a different cadence (per-message, on read).
export async function translateMessage({ text, targetLocale }) {
  const res = await fetch("/api/translate-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLocale }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Translation failed");
  return data.translatedText;
}
