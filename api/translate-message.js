// Vercel serverless function. Requires an authenticated Supabase session and is
// rate-limited per user — see api/_lib/auth.js and api/_lib/rateLimit.js. The actual
// AI call goes through api/_lib/aiGateway.js's translate() capability. See
// ai/translation/prompt.md for the documented contract.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
import { translate } from "./_lib/aiGateway.js";
import { emitEvent } from "./_lib/events.js";

const MAX_LENGTH = 2000;
const ENDPOINT = "translate-message";

const LANGUAGE_NAMES = {
  nl: "Dutch", fr: "French", de: "German", en: "English",
  ar: "Arabic", tr: "Turkish", ru: "Russian", zh: "Chinese",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let auth;
  try {
    auth = await verifyAuth(req);
    await checkAndLogUsage(auth.supabase, auth.user.id, ENDPOINT);
  } catch (err) {
    const status = err instanceof AuthError || err instanceof RateLimitError ? err.status : 500;
    res.status(status).json({ error: err.message });
    return;
  }

  const { text, targetLocale } = req.body || {};
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing text." });
    return;
  }
  if (text.length > MAX_LENGTH) {
    res.status(400).json({ error: "Message too long to translate." });
    return;
  }
  const targetLanguageName = LANGUAGE_NAMES[targetLocale];
  if (!targetLanguageName) {
    res.status(400).json({ error: "Unsupported target language." });
    return;
  }

  try {
    const translatedText = await translate({ text, targetLocale, targetLanguageName });
    await emitEvent(auth.supabase, "message.translated", { targetLocale });
    res.status(200).json({ translatedText });
  } catch (err) {
    console.error("translate-message error:", err);
    res.status(500).json({ error: "Translation failed. Please try again." });
  }
}
