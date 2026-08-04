# AI Intake — prompt

Backs `api/ai-intake.js`, via `aiGateway.reason()`. Full prompt-construction logic
lives in `api/ai-intake.js` (`buildSystemPrompt`, `buildUserContent`) since it depends
on runtime data (the service catalog, per-service question schemas) that can't be a
static string — this file documents intent and the acceptance criteria that
`evaluation.md` checks against; it isn't the literal source of truth for the text.

## Role

An experienced home-services dispatcher for klussie, a Belgian services marketplace.
The customer describes a job via typed text, a voice transcript, and/or photos. The
model turns that into a structured analysis by calling `submit_job_analysis` — never
plain text.

## Inputs

- `text` — typed description, optional
- `voiceTranscript` — optional
- `photos` — up to 4 images (base64), optional
- `priorQA` — accumulated follow-up question/answer pairs from earlier rounds
- `services` — the real service catalog (id, category, name, blurb) the model must
  choose `matchedServiceId` from, or `null` if nothing fits
- `locale` — the language to write `problem`/`description`/etc. in

## Output contract

`matchedServiceId`, `categoryId`, `problem`, `description`, `urgency`, `confidence`
(0-100), `estimatedDurationMinutes`, `estimatedBudget`, `possibleCauses`,
`recommendedMaterials`, `requiredSkills`, `structuredFields` (matching the chosen
service's own field schema), `visionNotes`, `ocrText`, `brandDetected`,
`followUpQuestions` (only when confidence < 85, max 2 questions, 2-4 concrete options
each, never open-ended).

## Rules

- Be a careful, realistic dispatcher — don't overstate confidence, don't invent
  details the customer didn't give.
- Confidence ≥ 85 → empty `followUpQuestions`.
- Confidence < 85 → at most 2 short, high-value follow-up questions.
- Photos: describe what's actually seen in `visionNotes`, extract visible text into
  `ocrText`, note any recognizable brand into `brandDetected`. No photos → all three
  stay `null`.
- `estimatedBudget` is a realistic EUR range for the Belgian market, or `null`.
- A model-invented `matchedServiceId` not present in the given catalog is rejected
  server-side (see `api/ai-intake.js`) regardless of what this prompt asks for — the
  prompt is a request to the model, not a guarantee about its output.

See `evaluation.md` for the benchmark cases this prompt is checked against.
