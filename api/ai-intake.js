// Vercel serverless function — the only place ANTHROPIC_API_KEY is ever read. Never
// import this file's logic into client code; the key must never reach the browser
// bundle. See src/lib/aiIntake.js for the client-side caller.
import Anthropic from "@anthropic-ai/sdk";
import { SERVICE_QUESTIONS } from "../src/lib/serviceQuestions.js";

const MODEL = "claude-sonnet-5";
const MAX_PHOTOS = 4;
const CONFIDENCE_THRESHOLD = 85;

const ANALYSIS_TOOL = {
  name: "submit_job_analysis",
  description: "Submit the structured analysis of a customer's described home-service job.",
  input_schema: {
    type: "object",
    properties: {
      matchedServiceId: {
        type: ["string", "null"],
        description: "The id of the best-matching service from the provided catalog, or null if nothing in the catalog is a reasonable match.",
      },
      categoryId: { type: ["string", "null"], description: "The category id of the matched service, or null." },
      problem: { type: "string", description: "Short (few words) title for the problem, in the customer's language." },
      description: { type: "string", description: "A clear, complete restatement of the job for a professional to read, in the customer's language." },
      urgency: { type: "string", enum: ["low", "medium", "high"] },
      confidence: { type: "number", description: "0-100 confidence in this classification overall." },
      estimatedDurationMinutes: {
        type: ["object", "null"],
        properties: { min: { type: "number" }, max: { type: "number" } },
      },
      estimatedBudget: {
        type: ["object", "null"],
        properties: { min: { type: "number" }, max: { type: "number" }, currency: { type: "string" } },
      },
      possibleCauses: { type: "array", items: { type: "string" } },
      recommendedMaterials: { type: "array", items: { type: "string" } },
      requiredSkills: { type: "array", items: { type: "string" } },
      structuredFields: {
        type: "object",
        description: "Answers for the matched service's own question schema (given in the prompt), using its exact field keys. Omit keys you're not confident about.",
        additionalProperties: true,
      },
      visionNotes: { type: ["string", "null"], description: "What was observed in any attached photos, or null if no photos." },
      ocrText: { type: ["string", "null"], description: "Any text read from attached photos (labels, model numbers, error codes), or null." },
      brandDetected: { type: ["string", "null"], description: "Brand/manufacturer name recognized in photos, or null." },
      followUpQuestions: {
        type: "array",
        description: "Only include if confidence is below 85. At most 2 short, high-value questions, each with 2-4 concrete answer options — never open-ended.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Short machine key for this question, e.g. 'leak_location'." },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
          },
          required: ["key", "question", "options"],
        },
      },
    },
    required: ["problem", "description", "urgency", "confidence", "possibleCauses", "recommendedMaterials", "requiredSkills", "followUpQuestions"],
  },
};

function buildSystemPrompt(locale, services) {
  const catalogLines = services
    .map((s) => `- id=${s.id} category=${s.category} name="${s.name}" — ${s.blurb}`)
    .join("\n");

  const fieldSchemaLines = Object.entries(SERVICE_QUESTIONS)
    .map(([serviceId, fields]) => {
      const svc = services.find((s) => s.id === serviceId);
      if (!svc) return null;
      const fieldDesc = fields
        .map((f) => {
          if (f.type === "select") return `${f.key} (one of: ${f.options.map((o) => o.value).join(", ")})`;
          if (f.type === "boolean") return `${f.key} (true/false)`;
          return `${f.key} (number)`;
        })
        .join(", ");
      return `- ${svc.name} (id=${serviceId}): ${fieldDesc}`;
    })
    .filter(Boolean)
    .join("\n");

  return `You are an experienced home-services dispatcher for klussie, a Belgian services marketplace. A customer is describing a job via text, voice transcript, and/or photos. Your job is to understand the request like a human dispatcher would and turn it into a structured analysis by calling the submit_job_analysis tool — never reply in plain text.

Available services (only choose matchedServiceId from this list, or null if nothing fits):
${catalogLines}

Per-service structured field schemas (use these exact keys in structuredFields, matched to whichever service you pick):
${fieldSchemaLines}

Rules:
- Write problem, description, possibleCauses, recommendedMaterials, requiredSkills, and any followUpQuestions in this language: ${locale}.
- Be a careful, realistic dispatcher: don't overstate confidence, and don't invent details the customer didn't give you.
- If confidence is at or above ${CONFIDENCE_THRESHOLD}, return an empty followUpQuestions array.
- If confidence is below ${CONFIDENCE_THRESHOLD}, ask at most 2 short, concrete follow-up questions with 2-4 answer options each — the kind of question that would meaningfully raise your confidence, never generic ones.
- If photos are attached, describe what you actually see in visionNotes, extract any visible text into ocrText, and note any recognizable brand into brandDetected. If there are no photos, leave these null.
- estimatedBudget should be a realistic EUR range for the Belgian market, or null if you truly can't estimate.`;
}

function buildUserContent({ text, voiceTranscript, photos, priorQA }) {
  const content = [];
  const parts = [];
  if (text) parts.push(`Typed description: ${text}`);
  if (voiceTranscript) parts.push(`Voice transcript: ${voiceTranscript}`);
  if (priorQA && priorQA.length) {
    parts.push(
      "Follow-up answers so far:\n" + priorQA.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n")
    );
  }
  if (parts.length === 0) parts.push("(No text or voice description given — rely on the attached photos only.)");
  content.push({ type: "text", text: parts.join("\n\n") });

  for (const photo of (photos || []).slice(0, MAX_PHOTOS)) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: photo.mediaType, data: photo.data },
    });
  }
  return content;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI intake is not configured on the server." });
    return;
  }

  const { text, voiceTranscript, photos, priorQA, services, locale } = req.body || {};

  if (!text && !voiceTranscript && (!photos || photos.length === 0)) {
    res.status(400).json({ error: "Provide at least text, a voice transcript, or a photo." });
    return;
  }
  if (!Array.isArray(services) || services.length === 0) {
    res.status(400).json({ error: "Missing service catalog." });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system: buildSystemPrompt(locale || "nl", services),
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "submit_job_analysis" },
      messages: [{ role: "user", content: buildUserContent({ text, voiceTranscript, photos, priorQA }) }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) {
      res.status(502).json({ error: "AI did not return a structured analysis." });
      return;
    }

    const result = toolUse.input;

    // Never trust a service id the model invented — fall back to unmatched rather than
    // letting the client create a request against a nonexistent service.
    const validIds = new Set(services.map((s) => s.id));
    if (result.matchedServiceId && !validIds.has(result.matchedServiceId)) {
      result.matchedServiceId = null;
      result.categoryId = null;
      result.structuredFields = {};
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("ai-intake error:", err);
    res.status(500).json({ error: "AI analysis failed. Please try again." });
  }
}
