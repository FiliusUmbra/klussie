// Client-side wrapper for the "source external providers" serverless function
// (api/source-providers.js) — same pattern as src/lib/askAboutItem.js/aiIntake.js: a
// stable error code, never a raw message, for the identical reason those modules'
// own headers document (unreachable under plain `npm run dev`, hardcoded English
// server-side error strings).
//
// Operator-only today (see the migration's own header, PLATFORM_DOMAIN_MODEL.md §14.4):
// this has no customer-facing caller yet, and no automatic trigger calls it either. It
// exists so an operator tool (not yet built) has something real to call.
import { supabase } from "./supabaseClient";

export const SOURCE_PROVIDERS_FAILED = "SOURCE_PROVIDERS_FAILED";

export async function sourceExternalProviders({ requestId, serviceName, city }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(SOURCE_PROVIDERS_FAILED);

  const res = await fetch("/api/source-providers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ requestId, serviceName, city }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(SOURCE_PROVIDERS_FAILED);
  }
  if (!res.ok || !Array.isArray(data.candidates)) throw new Error(SOURCE_PROVIDERS_FAILED);
  return data.candidates;
}
