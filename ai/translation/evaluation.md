# Message Translation — evaluation

Benchmark cases for `prompt.md`. Not yet wired into automated CI (Phase 2).

## Case 1 — Dutch → French, casual tone preserved

**Input:** "Hallo Sara, kan je deze week nog langskomen om de woonkamer te
schilderen?" → `targetLocale: "fr"`

**Expected:** A natural, casual French translation (not a stiff/formal one) — e.g.
"Salut Sara, tu peux passer cette semaine pour peindre le salon ?"

*(Verified live during Stage 7 build/verification — produced exactly this
translation.)*

## Case 2 — French → Dutch, question mark and tone preserved

**Input:** "Oui, je peux passer jeudi matin vers 9h, ça te convient ?" →
`targetLocale: "nl"`

**Expected:** A natural Dutch translation preserving the question. Verified live:
"Ja, donderdag ochtend rond 9 uur kan ik. Past dat jou?"

## Case 3 — already in the target language

**Input:** "Bedankt, tot donderdag!" → `targetLocale: "nl"`

**Expected:** `translatedText` equals the input (unchanged), not an error and not a
refusal.

## Adding a case

Same note as `ai/intake/evaluation.md` — check plausibility and tone, not
byte-for-byte equality (the model's exact phrasing will vary run to run).
