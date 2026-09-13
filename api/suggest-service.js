// Vercel serverless function. Requires an authenticated Supabase session and is
// rate-limited per user — see api/_lib/auth.js and api/_lib/rateLimit.js. The AI calls go
// through api/_lib/aiGateway.js's reason() and translate() capabilities.
//
// Pro Workspace remarks, 2026-09-12 (Theme E): a pro describes a service in their own
// words; the AI either matches it to an existing public.services row, or proposes a
// genuinely new one. See supabase/migrations/0221_service_catalog_suggestions.sql's own
// header for the full write-contract reasoning (operator approval required, matches never
// touch that table at all).
//
// WHY A MATCH IS HANDLED ENTIRELY IN THE RESPONSE, NOT PERSISTED HERE
//
// A matched service already exists — the client attaches it to the pro's own workspace
// through the exact same src/lib/pros.js updateProServices() path any manual pick from
// the services list already uses. Nothing new to write, nothing for an operator to
// review, and no reason to invent a second code path for what is, underneath, an
// ordinary "pro offers this service" write.
//
// WHY THE MATCHING STEP READS THE CATALOG FRESH ON EVERY CALL, NOT FROM A CACHE
//
// This runs rarely (a pro typing a free-text service description), not on every page
// load like src/lib/catalog.js's own fetchCatalog() — there is no hot path here to
// protect, and a stale list could send the AI matching against services approved
// minutes ago as though they didn't exist yet.
//
// WHY TRANSLATION REUSES aiGateway.js's translate() EXACTLY AS IT ALREADY EXISTS
//
// translate()'s own system prompt is written for a customer-pro chat message, not
// catalog copy — noticed while building this, and deliberately left alone rather than
// forked into a second capability: the user's own call on this point was to reuse the
// translation the app already has, not stand up a parallel one for a single new call
// site. The operator reviews the exact generated copy, in every language, before any of
// it goes live (0221's own decide_service_suggestion_for_caller) — the real backstop
// against a slightly-off tone, not a second prompt here.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
import { reason, translate } from "./_lib/aiGateway.js";
import { uuidv7 } from "../src/lib/ids.ts";

const ENDPOINT = "suggest-service";
const MAX_DESCRIPTION_LENGTH = 500;

const LOCALES = ["nl", "fr", "de", "en", "es", "ar", "fa", "tr", "ru", "zh"];
// Same map translate-message.js already established (and the same real gap it fixed —
// es and fa are both real, fully-localized locales this app ships).
const LANGUAGE_NAMES = {
  nl: "Dutch", fr: "French", de: "German", en: "English", es: "Spanish",
  ar: "Arabic", fa: "Persian", tr: "Turkish", ru: "Russian", zh: "Chinese",
};

const SUGGESTION_TOOL = {
  name: "submit_classification",
  description: "Classify a pro's free-text description of a service they want to offer.",
  input_schema: {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: ["match", "new"],
        description: "'match' if this is genuinely the same service as one already in the catalog below (just described in the pro's own words); 'new' only when nothing in the catalog is really the same service.",
      },
      matchedServiceId: {
        type: "string",
        description: "Required when outcome is 'match': the id of the existing catalog service this description matches.",
      },
      categoryId: {
        type: "string",
        description: "Required when outcome is 'new': which EXISTING category id (from the list below) this new service belongs under. Never invent a category id that isn't in the list.",
      },
      proposedName: {
        type: "string",
        description: "Required when outcome is 'new': a short, clear service name, in the same language as the pro's own description.",
      },
      proposedBlurb: {
        type: "string",
        description: "Required when outcome is 'new': a one-sentence description of the service, in the same language as the pro's own description.",
      },
      proposedMode: {
        type: "string",
        enum: ["book", "quote"],
        description: "Required when outcome is 'new': 'book' for a service with a predictable, fixed-ish price a customer can book directly; 'quote' for one that genuinely needs a pro to assess the job first.",
      },
      proposedBasePrice: {
        type: "number",
        description: "Required when outcome is 'new': a reasonable starting price in EUR for this service in Belgium, as a plain number.",
      },
      confidence: {
        type: "number",
        description: "How confident you are in this classification, from 0 to 1.",
      },
    },
    required: ["outcome", "confidence"],
  },
};

function describeCatalogForPrompt(categories, services) {
  const categoryLines = categories.map((c) => `- ${c.id}`).join("\n");
  const serviceLines = services
    .map((s) => `- id: ${s.id} | category: ${s.category_id} | name: ${s.name || "(untranslated)"} — ${s.blurb || ""}`)
    .join("\n");
  return [
    "Existing categories (pick only from this list for a new service):",
    categoryLines,
    "",
    "Existing services (match against these first):",
    serviceLines || "(none)",
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Same shared-pattern leak as api/source-providers.js and api/ask-about-item.js's own
  // checkAndLogUsage() calls: AuthError/RateLimitError carry deliberately user-safe
  // messages by construction; anything else must never reach the client verbatim.
  let auth;
  try {
    auth = await verifyAuth(req);
    await checkAndLogUsage(auth.supabase, auth.user.id, ENDPOINT);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RateLimitError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("suggest-service auth/rate-limit error:", err);
    res.status(500).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  const { workspaceId, description, locale } = req.body || {};
  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: "Missing workspaceId." });
    return;
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "Missing description." });
    return;
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    res.status(400).json({ error: "Description is too long." });
    return;
  }
  if (!LOCALES.includes(locale)) {
    res.status(400).json({ error: "Unsupported locale." });
    return;
  }

  // Re-read through the caller's own token, not a client-supplied catalog snapshot — the
  // same "the server decides what is true" reasoning ask-about-item.js's own header
  // documents for its asset/document/maintenance reads.
  const [{ data: categories, error: catErr }, { data: services, error: svcErr }] = await Promise.all([
    auth.supabase.from("categories").select("id"),
    auth.supabase
      .from("services")
      .select("id, category_id, mode, base_price, service_translations(name, blurb, locale)")
      .eq("active", true),
  ]);
  if (catErr || svcErr) {
    console.error("suggest-service catalog read error:", catErr?.message || svcErr?.message);
    res.status(500).json({ error: "Could not read the service catalog. Please try again." });
    return;
  }

  const servicesForPrompt = (services || []).map((s) => {
    const translation =
      (s.service_translations || []).find((t) => t.locale === locale) ||
      (s.service_translations || []).find((t) => t.locale === "en") ||
      (s.service_translations || [])[0];
    return { id: s.id, category_id: s.category_id, name: translation?.name, blurb: translation?.blurb };
  });

  const systemPrompt = [
    "You classify a professional's free-text description of a service they want to offer on Klussie, a Belgian home-services marketplace.",
    "First check whether it genuinely matches an existing service below — a slightly different phrasing of the same service counts as a match; a real gap in the catalog does not.",
    "Only propose a new service when nothing in the catalog is really the same thing.",
    "",
    describeCatalogForPrompt(categories || [], servicesForPrompt),
  ].join("\n");

  let classification;
  try {
    classification = await reason({
      systemPrompt,
      text: description,
      toolSchema: SUGGESTION_TOOL,
      maxTokens: 512,
    });
  } catch (err) {
    console.error("suggest-service classification error:", err.message);
    res.status(500).json({ error: "Klussie could not classify this service right now. Please try again." });
    return;
  }

  if (classification.outcome === "match" && classification.matchedServiceId) {
    res.status(200).json({ outcome: "match", matchedServiceId: classification.matchedServiceId });
    return;
  }

  if (!classification.categoryId || !classification.proposedName || !classification.proposedBlurb || !classification.proposedMode || classification.proposedBasePrice == null) {
    console.error("suggest-service: AI returned an incomplete 'new' classification", classification);
    res.status(500).json({ error: "Klussie could not work out how to categorize this service. Please try again." });
    return;
  }

  const otherLocales = LOCALES.filter((l) => l !== locale);
  let translations;
  try {
    const translatedPairs = await Promise.all(
      otherLocales.map(async (targetLocale) => {
        const targetLanguageName = LANGUAGE_NAMES[targetLocale];
        const [name, blurb] = await Promise.all([
          translate({ text: classification.proposedName, targetLocale, targetLanguageName }),
          translate({ text: classification.proposedBlurb, targetLocale, targetLanguageName }),
        ]);
        return [targetLocale, { name, blurb }];
      })
    );
    translations = Object.fromEntries(translatedPairs);
  } catch (err) {
    console.error("suggest-service translation error:", err.message);
    res.status(500).json({ error: "Klussie could not translate this service into every language. Please try again." });
    return;
  }

  const suggestionId = uuidv7();
  const { error: writeError } = await auth.supabase.schema("api").rpc("suggest_service", {
    p_suggestion_id: suggestionId,
    p_workspace_id: workspaceId,
    p_raw_description: description,
    p_locale: locale,
    p_category_id: classification.categoryId,
    p_proposed_name: classification.proposedName,
    p_proposed_blurb: classification.proposedBlurb,
    p_proposed_mode: classification.proposedMode,
    p_proposed_base_price: classification.proposedBasePrice,
    p_ai_confidence: classification.confidence ?? null,
    p_translations: translations,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: auth.user.id,
  });

  if (writeError) {
    console.error("suggest-service suggest_service error:", writeError);
    // 42501 is Postgres's own SQLSTATE for insufficient_privilege — the real refusal
    // catalog.suggest_service_for_caller() raises for a caller who isn't a real member
    // of the given workspace.
    const status = writeError.code === "42501" ? 403 : 500;
    res.status(status).json({ error: "Could not record this suggestion. Please try again." });
    return;
  }

  res.status(200).json({ outcome: "new", suggestionId });
}
