// Klussie Core — AI Gateway. Capability-based routing: callers ask for a capability
// (reason, translate) with capability-shaped parameters, never for "Claude" by name.
// This is the only file that knows Anthropic's tool-forcing/content-block shapes —
// swapping a capability to a different provider later means changing the function
// body here, not every endpoint that uses it. See docs/PRODUCT_CONSTITUTION.md.
//
// Vision today is handled as part of reason() (Claude analyzes text + photos in one
// multimodal call, which is how the product actually wants job-intake to work — a
// separate describe-then-reason pipeline would likely be lower quality, not more
// modular). If a future provider can't do combined multimodal reasoning, vision
// becomes its own capability function at that point; no need to speculatively split
// it now.
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_REASONING_MODEL = "claude-sonnet-5";
const DEFAULT_TRANSLATION_MODEL = "claude-haiku-4-5-20251001";

let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AI Gateway is not configured on the server (missing ANTHROPIC_API_KEY).");
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Capability: reason — structured classification/analysis, optionally over images.
 * Backs job-intake understanding today. Params are capability-level (system prompt,
 * text, images, the tool schema describing the expected output shape) — nothing here
 * is Claude-specific except this function's own implementation.
 */
export async function reason({ systemPrompt, text, images = [], toolSchema, model = DEFAULT_REASONING_MODEL, maxTokens = 1536 }) {
  const anthropic = getAnthropicClient();
  const content = [{ type: "text", text }];
  for (const img of images) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools: [toolSchema],
    tool_choice: { type: "tool", name: toolSchema.name },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("AI did not return a structured response.");
  return toolUse.input;
}

const TRANSLATION_TOOL = {
  name: "submit_translation",
  description: "Submit the translated message text.",
  input_schema: {
    type: "object",
    properties: {
      translatedText: {
        type: "string",
        description: "The message translated into the target language, preserving tone and meaning. If the original is already in the target language, return it unchanged.",
      },
    },
    required: ["translatedText"],
  },
};

/**
 * Capability: translate — independent of reason() so a specialized translation
 * provider (e.g. DeepL) could replace this implementation without touching intake's
 * reasoning path or any other reason() caller.
 */
export async function translate({ text, targetLocale, targetLanguageName, model = DEFAULT_TRANSLATION_MODEL, maxTokens = 512 }) {
  const result = await reason({
    systemPrompt: `You are a translator for a Belgian home-services marketplace's customer-pro chat. Translate the user's message into ${targetLanguageName} (locale code: ${targetLocale}). Keep the tone casual and natural, like a real chat message — not a formal document.`,
    text,
    toolSchema: TRANSLATION_TOOL,
    model,
    maxTokens,
  });
  return result.translatedText;
}
