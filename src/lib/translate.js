// Client-side wrapper for the message-translation serverless function. See
// src/lib/aiIntake.js for the sibling AI-intake wrapper — same pattern, kept in a
// separate module since translation is called from a different part of the UI
// (ConversationSheet) on a different cadence (per-message, on read).
import { supabase } from "./supabaseClient";

export async function translateMessage({ text, targetLocale }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to translate messages.");

  const res = await fetch("/api/translate-message", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ text, targetLocale }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Translation failed");
  return data.translatedText;
}
