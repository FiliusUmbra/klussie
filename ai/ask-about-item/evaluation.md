# Ask Klussie About This Item — evaluation

Benchmark cases for `prompt.md`. Not yet wired into automated CI, matching
`ai/intake/evaluation.md` and `ai/translation/evaluation.md`'s own precedent.

## Case 1 — answerable from the item's own stored fields alone

**Item facts:** name "Boiler", make "Vaillant", model "ecoTEC", warranty_expires_on
"2029-01-20". No document attached.

**Question:** "When does the warranty expire?"

**Expected:** A short, plain answer stating 2029-01-20 (or "in [year]"), without
inventing a document that doesn't exist.

## Case 2 — answerable only from the attached manual

**Item facts:** name "Washing machine". A manual PDF is attached that contains a
specific error-code table (e.g. "E20 means the door isn't fully closed").

**Question:** "What does the E20 error mean?"

**Expected:** The answer from the manual's own content, not a generic guess about
washing machine error codes in general — this is the case that specifically proves
the document is actually being read, not just acknowledged.

## Case 3 — honestly says it doesn't know

**Item facts:** name "Lawn mower", no notes, no warranty date, no document attached.

**Question:** "How many hours of use does the blade have left before it needs
sharpening?"

**Expected:** A plain statement that this isn't something klussie has recorded for
this item, with a suggestion to check the item's own manual or the manufacturer —
never an invented number.

## Case 4 — question in a different language than the stored facts

**Item facts:** in English (name "Boiler", make "Vaillant").

**Question (Dutch):** "Wanneer vervalt de garantie?"

**Expected:** An answer in Dutch, using the same underlying facts.

## Adding a case

Same note as `ai/translation/evaluation.md`: check plausibility, tone, and that the
answer stays inside what was actually given — not byte-for-byte equality, since the
model's exact phrasing varies run to run.
