// Vercel serverless function — translates a single chat message on demand. Kept
// separate from api/ai-intake.js (different model, different tool schema, different
// caller) even though both read the same ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001"; // translation doesn't need Sonnet-level reasoning
const MAX_LENGTH = 2000;

const LANGUAGE_NAMES = {
  nl: "Dutch", fr: "French", de: "German", en: "English",
  ar: "Arabic", tr: "Turkish", ru: "Russian", zh: "Chinese",
};

const TRANSLATE_TOOL = {
  name: "submit_translation",
  description: "Submit the translated message text.",
  input_schema: {
    type: "object",
    properties: {
      translatedText: { type: "string", description: "The message translated into the target language, preserving tone and meaning. If the original is already in the target language, return it unchanged." },
    },
    required: ["translatedText"],
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Translation is not configured on the server." });
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
  const languageName = LANGUAGE_NAMES[targetLocale];
  if (!languageName) {
    res.status(400).json({ error: "Unsupported target language." });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: `You are a translator for a Belgian home-services marketplace's customer-pro chat. Translate the user's message into ${languageName} (locale code: ${targetLocale}). Keep the tone casual and natural, like a real chat message — not a formal document. Call submit_translation with the result, never reply in plain text.`,
      tools: [TRANSLATE_TOOL],
      tool_choice: { type: "tool", name: "submit_translation" },
      messages: [{ role: "user", content: text }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) {
      res.status(502).json({ error: "Translation failed." });
      return;
    }

    res.status(200).json({ translatedText: toolUse.input.translatedText });
  } catch (err) {
    console.error("translate-message error:", err);
    res.status(500).json({ error: "Translation failed. Please try again." });
  }
}
