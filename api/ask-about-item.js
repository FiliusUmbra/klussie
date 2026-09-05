// Vercel serverless function. Requires an authenticated Supabase session and is
// rate-limited per user — see api/_lib/auth.js and api/_lib/rateLimit.js. The actual
// AI call goes through api/_lib/aiGateway.js's reason() capability. See
// ai/ask-about-item/prompt.md for the documented contract.
//
// "Ask Klussie a grounded question about it" — the Home Builder follow-up slice. Grounded
// means the model answers only from what klussie actually knows about this one item: its
// own stored fields (name, make, model, notes, warranty expiry, condition — resolved via
// api.resolve_asset(), the same read contract "Mijn spullen" itself uses, so this endpoint
// can never see more than the caller's own account already can) plus, when one exists, the
// item's own attached warranty/manual document — never open-ended chit-chat, and never a
// guess dressed up as fact. The system prompt instructs the model to say plainly when the
// answer isn't in what it was given, rather than filling the gap.
//
// WHY THE ASSET/DOCUMENT READ HAPPENS HERE, SERVER-SIDE, RATHER THAN BEING PASSED IN BY
// THE CLIENT
//
// A client-supplied "here are the facts, trust me" payload would let a caller ground the
// model in facts about an item they don't actually own. Re-resolving through the same
// RLS-scoped, per-user Supabase client verifyAuth() already returns closes that off the
// same way api/ai-intake.js's own service-catalog lookup does: the server decides what is
// true, the client only decides which item and which question.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
import { reason } from "./_lib/aiGateway.js";
import { emitEvent } from "./_lib/events.js";

const MAX_QUESTION_LENGTH = 300;
const ENDPOINT = "ask-about-item";

// Anthropic's own documented content-block media types for a PDF; anything else found
// on a document's storage_path is skipped (grounded in the item's own fields only)
// rather than sent as a mislabeled attachment. property.documents has no stored
// mime-type column (0055) — the file's own extension is the only signal available.
const EXTENSION_MEDIA_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const ANSWER_TOOL = {
  name: "submit_answer",
  description: "Submit the answer to the homeowner's question about this one item.",
  input_schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          "A short, plain-language answer, in the same language as the question. If the given facts and document don't actually answer it, say so plainly and suggest checking the item's own manual or warranty, or the manufacturer — never invent a fact that wasn't given.",
      },
    },
    required: ["answer"],
  },
};

function extensionOf(storagePath) {
  const match = /\.([a-z0-9]+)$/i.exec(storagePath || "");
  return match ? match[1].toLowerCase() : null;
}

function describeAsset(asset) {
  // Only real, present fields — an absent brand is omitted, never "Brand: unknown", the
  // same restraint ItemCard's own subtitle already holds (src/home/MyItemsPanel.jsx).
  const lines = [`Name: ${asset.name}`];
  if (asset.type) lines.push(`Type: ${asset.type}`);
  if (asset.make) lines.push(`Make: ${asset.make}`);
  if (asset.model) lines.push(`Model: ${asset.model}`);
  if (asset.serial_number) lines.push(`Serial number: ${asset.serial_number}`);
  if (asset.condition) lines.push(`Condition: ${asset.condition}`);
  if (asset.acquired_on) lines.push(`Acquired on: ${asset.acquired_on}`);
  if (asset.installed_on) lines.push(`Installed on: ${asset.installed_on}`);
  if (asset.warranty_expires_on) lines.push(`Warranty expires on: ${asset.warranty_expires_on}`);
  if (asset.expected_service_life_months) lines.push(`Expected service life: ${asset.expected_service_life_months} months`);
  if (asset.notes) lines.push(`Notes the homeowner wrote: ${asset.notes}`);
  return lines.join("\n");
}

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

  const { itemId, question } = req.body || {};
  if (!itemId || typeof itemId !== "string") {
    res.status(400).json({ error: "Missing itemId." });
    return;
  }
  if (!question || typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "Missing question." });
    return;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: "Question is too long." });
    return;
  }

  // Re-resolved through the caller's own token — the same api.resolve_asset() "Mijn
  // spullen" itself reads through, so this can never see an item the caller's own
  // account could not already see.
  const { data: assetRows, error: assetError } = await auth.supabase.schema("api").rpc("resolve_asset", { p_asset_id: itemId });
  if (assetError) {
    console.error("ask-about-item resolve_asset error:", assetError.message);
    res.status(500).json({ error: "Could not read this item. Please try again." });
    return;
  }
  const asset = assetRows?.[0];
  if (!asset) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  // At most one document, preferring a manual over a warranty over anything else —
  // bounded and simple rather than attaching everything ever uploaded for this item.
  const { data: documentRows } = await auth.supabase.schema("api").rpc("my_documents", { p_asset_id: itemId });
  const preferenceOrder = ["manual", "warranty", "certificate", "other"];
  const chosenDoc = (documentRows || [])
    .slice()
    .sort((a, b) => preferenceOrder.indexOf(a.type_key) - preferenceOrder.indexOf(b.type_key))[0];

  let documentAttachment = null;
  let documentNote = "No warranty or manual document is attached to this item.";
  if (chosenDoc) {
    const mediaType = EXTENSION_MEDIA_TYPES[extensionOf(chosenDoc.storage_path)];
    if (mediaType) {
      const { data: fileBlob, error: downloadError } = await auth.supabase.storage
        .from(chosenDoc.storage_bucket)
        .download(chosenDoc.storage_path);
      if (!downloadError && fileBlob && fileBlob.size <= MAX_DOCUMENT_BYTES) {
        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        documentAttachment = { mediaType, data: buffer.toString("base64") };
        documentNote = `The item's own "${chosenDoc.type_key}" document is attached below — use it.`;
      } else if (downloadError) {
        console.warn("ask-about-item document download failed, answering from item facts only:", downloadError.message);
      }
    }
  }

  const systemPrompt = [
    "You help a homeowner using Klussie, a Belgian home-services app, understand one specific item in their home.",
    "Answer ONLY using the facts given below and, if attached, the item's own document. Never invent a fact, a number, or a procedure that isn't actually given.",
    "If the question cannot be answered from what you were given, say so plainly in one sentence and suggest checking the item's own manual or warranty, or contacting the manufacturer.",
    "Keep the answer short — a few sentences at most, plain language, no technical jargon a non-technical homeowner wouldn't use themselves.",
    "Answer in the same language the question was asked in.",
    "",
    "What is known about this item:",
    describeAsset(asset),
    "",
    documentNote,
  ].join("\n");

  try {
    const result = await reason({
      systemPrompt,
      text: question,
      documents: documentAttachment ? [documentAttachment] : [],
      toolSchema: ANSWER_TOOL,
      maxTokens: 512,
    });
    await emitEvent(auth.supabase, "item.question_answered", { itemId });
    res.status(200).json({ answer: result.answer });
  } catch (err) {
    console.error("ask-about-item error:", err.message);
    res.status(500).json({ error: "Klussie could not answer right now. Please try again." });
  }
}
