# AI Intake — evaluation

Benchmark cases for `prompt.md`. Not yet wired into automated CI (that lands in
Phase 2, alongside the rest of the testing foundation) — recorded now so the cases
exist before the harness that runs them does.

## Case 1 — clear-cut plumbing leak

**Input:** "My kitchen sink has been leaking for two days and now the cabinet
underneath is getting wet."

**Expected:**
- `matchedServiceId` → Loodgieterswerken (plumbing)
- `urgency` → medium or high
- `confidence` → likely < 85 (location/severity of leak unspecified) → 1-2 follow-up
  questions about leak location and severity
- `estimatedBudget` → plausible EUR range for a minor plumbing repair (roughly €80–200)

*(Verified live against the production endpoint during Stage 7 build/verification —
this exact scenario correctly triggered two rounds of relevant follow-up questions,
matched Loodgieterswerken, and landed at 88% confidence after clarification.)*

## Case 2 — appliance issue with a synthetic/ambiguous photo

**Input:** Text: "There's a crack in my wall, see photo." Photo: a schematic
line-drawing with visible text "BOSCH GSB 13", not a real photo of a wall.

**Expected:**
- `ocrText` → "BOSCH GSB 13" (must actually read the text, not hallucinate it)
- `brandDetected` → "Bosch"
- `confidence` → low (the image doesn't clearly show what the text claims) — the
  model should say so in `visionNotes` rather than confabulate a confident answer
- `followUpQuestions` present, asking about crack size/location

*(Also verified live — the model correctly reported the image looked like a
schematic/placeholder rather than a real crack photo, at 35% confidence.)*

## Case 3 — text-only, high-confidence case

**Input:** "I need my English tutor for 2 sessions a week, intermediate level."

**Expected:**
- `matchedServiceId` → Engelse bijles (English tutoring)
- `structuredFields.sessionsPerWeek` → 2
- `structuredFields.level` → "intermediate"
- `confidence` → ≥ 85, empty `followUpQuestions`

## Adding a case

Format: input → expected structured fields (not exact prose matches — confidence
scores and free-text fields will vary run to run; check the *shape* and *plausibility*
of the response, not byte-for-byte equality).
