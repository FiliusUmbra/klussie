// Client-side wrapper for the "ask Klussie about this item" serverless function
// (api/ask-about-item.js). Same pattern as src/lib/aiIntake.js/translate.js — a stable
// error code, never a raw message, for the identical reason aiIntake.js's own header
// documents: this route is unreachable under plain `npm run dev` (no Vercel dev server),
// so a 404 HTML page makes res.json() throw its own raw, unlocalized parser exception,
// and the server's own error strings are hardcoded English with no locale handling. One
// already-localized message covers every failure this function can have.
//
// Item Detail slice — `workspaceId` lets the endpoint also ground the answer in this
// item's own maintenance and service history, not only its stored fields and one
// attached document; `groundedIn` comes back so the UI can show a real citation rather
// than an unverifiable claim of one.
import { supabase } from "./supabaseClient";

export const ASK_ABOUT_ITEM_FAILED = "ASK_ABOUT_ITEM_FAILED";

export async function askAboutItem({ itemId, question, workspaceId }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(ASK_ABOUT_ITEM_FAILED);

  const res = await fetch("/api/ask-about-item", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ itemId, question, workspaceId }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(ASK_ABOUT_ITEM_FAILED);
  }
  if (!res.ok || typeof data.answer !== "string") throw new Error(ASK_ABOUT_ITEM_FAILED);
  return { answer: data.answer, groundedIn: Array.isArray(data.groundedIn) ? data.groundedIn : [] };
}
