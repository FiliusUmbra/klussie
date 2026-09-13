// Client-side wrapper for the "suggest a service Klussie doesn't have yet" serverless
// function (api/suggest-service.js). Same pattern as src/lib/askAboutItem.js — a stable
// error code, never a raw message, for the identical reason that file's own header
// documents: this route is unreachable under plain `npm run dev`, so a 404 HTML page
// makes res.json() throw its own raw, unlocalized parser exception.
//
// Pro Workspace remarks, 2026-09-12 (Theme E). suggestService() returns either
// { outcome: "match", matchedServiceId } — the caller attaches it via the existing
// src/lib/pros.js updateProServices() path, no suggestion involved — or
// { outcome: "new", suggestionId } — a pending catalog.service_suggestions row now
// waiting on a real operator, surfaced back to the pro as "sent for review", not as an
// instantly-live service.
import { supabase } from "./supabaseClient";

export const SUGGEST_SERVICE_FAILED = "SUGGEST_SERVICE_FAILED";

export async function suggestService({ workspaceId, description, locale }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(SUGGEST_SERVICE_FAILED);

  const res = await fetch("/api/suggest-service", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ workspaceId, description, locale }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(SUGGEST_SERVICE_FAILED);
  }
  if (!res.ok || (data.outcome !== "match" && data.outcome !== "new")) throw new Error(SUGGEST_SERVICE_FAILED);

  return data.outcome === "match"
    ? { outcome: "match", matchedServiceId: data.matchedServiceId }
    : { outcome: "new", suggestionId: data.suggestionId };
}

// The operator queue's own two reads/writes — api.list_service_suggestions() and
// api.decide_service_suggestion() are plain RPCs, not AI calls, so they go straight
// through supabase.rpc() like every other operator read in this codebase (see
// src/lib/trustSafety.js), no serverless function involved.
export async function fetchServiceSuggestions() {
  const { data, error } = await supabase.schema("api").rpc("list_service_suggestions");
  if (error) throw error;
  return (data || []).map((row) => ({
    suggestionId: row.suggestion_id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    rawDescription: row.raw_description,
    locale: row.locale,
    categoryId: row.category_id,
    proposedName: row.proposed_name,
    proposedBlurb: row.proposed_blurb,
    proposedMode: row.proposed_mode,
    proposedBasePrice: Number(row.proposed_base_price),
    aiConfidence: row.ai_confidence == null ? null : Number(row.ai_confidence),
    translations: row.translations || {},
    createdAt: row.created_at,
  }));
}

export async function decideServiceSuggestion(suggestionId, decision, decisionNote = null) {
  const { error } = await supabase.schema("api").rpc("decide_service_suggestion", {
    p_suggestion_id: suggestionId,
    p_decision: decision,
    p_decision_note: decisionNote,
  });
  if (error) throw error;
}
