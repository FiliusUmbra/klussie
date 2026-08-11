// The five conversation starters under the primary question.
//
// These are intents, not service categories: "Er is iets kapot" is a way of opening a
// conversation, "Loodgieterij" is a taxonomy the customer has to translate their
// problem into. ADR-0007 rejected the category grid as the front door and this is the
// same argument one level down — the thing that replaces it must not quietly become
// one.
//
// Presentation only: the list comes from src/lib/homeIntents.js, the labels come from
// `t`, and selecting one is the caller's business.
import { HOME_INTENTS } from "../lib/homeIntents.js";

// aria-pressed rather than a radio group: these are toggle buttons that seed the
// composer, not a form field with a submitted value. Selection is confirmed three
// ways — the pressed state for assistive tech, a filled surface, and a check glyph —
// so it never depends on colour alone (WCAG 2.2 1.4.1).
export function IntentSuggestions({ t, activeIntentId, onSelect }) {
  return (
    <div className="intent-row" role="group" aria-label={t.intentsLabel}>
      {HOME_INTENTS.map((intent) => {
        const active = intent.id === activeIntentId;
        return (
          <button
            key={intent.id}
            type="button"
            className={"intent-chip" + (active ? " intent-chip-on" : "")}
            aria-pressed={active}
            onClick={() => onSelect(intent.id)}
          >
            <span aria-hidden="true" className="intent-chip-mark">{active ? "✓" : "+"}</span>
            {t[intent.labelKey]}
          </button>
        );
      })}
    </div>
  );
}
