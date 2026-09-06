// Client-side wrapper for "let Klussie read this document" (api/suggest-item-details.js)
// — the Document Understanding slice. Same pattern as askAboutItem.js: a stable error
// code, never the server's raw message, for the identical reason that file's own header
// documents (this route is unreachable under plain `npm run dev`, so a 404 HTML page
// makes res.json() throw its own raw, unlocalized parser exception — the bug PR #127
// already found and fixed for ai-intake.js).
//
// Returns `{ suggestions }` and NEVER saves anything — the caller (ItemDetailSheet.jsx)
// is the only place a homeowner's own explicit per-field confirmation turns one of these
// into a real updateAsset()/createMaintenanceObligation() call.
import { supabase } from "./supabaseClient";

export const DOCUMENT_SUGGESTIONS_FAILED = "DOCUMENT_SUGGESTIONS_FAILED";
export const DOCUMENT_UNREADABLE = "DOCUMENT_UNREADABLE";

export async function suggestItemDetailsFromDocument({ itemId, documentId }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(DOCUMENT_SUGGESTIONS_FAILED);

  const res = await fetch("/api/suggest-item-details", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ itemId, documentId }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(DOCUMENT_SUGGESTIONS_FAILED);
  }
  if (!res.ok) throw new Error(res.status === 422 ? DOCUMENT_UNREADABLE : DOCUMENT_SUGGESTIONS_FAILED);
  return { suggestions: data.suggestions && typeof data.suggestions === "object" ? data.suggestions : {} };
}
