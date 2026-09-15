// The five conversation starters under the primary question.
//
// These are intents, not service categories: "Er is iets kapot" is a way of opening a
// conversation, "Loodgieterij" is a taxonomy the customer has to translate their
// problem into. ADR-0007 rejected the category grid as the front door and this is the
// same argument one level down — the thing that replaces it must not quietly become
// one.
//
// Homepage redesign, 2026-09-15 — a grid of real icon tiles, not a wrapping row of
// text-only chips: "visual buttons," each with genuine presence, reachable at a
// glance rather than read one label at a time. Stays a plain in-page grid, never a
// sliding sheet of its own, matching the app's standing "no sliding menus" principle.
//
// Presentation only: the list comes from src/lib/homeIntents.js, the labels and icons
// come from there and `t`, and selecting one is the caller's business.
import { Check } from "lucide-react";
import { HOME_INTENTS } from "../lib/homeIntents.js";

// aria-pressed rather than a radio group: these are toggle buttons that seed the
// composer, not a form field with a submitted value. Selection is confirmed three
// ways — the pressed state for assistive tech, a filled surface, and the icon itself
// swapping to a checkmark — so it never depends on colour alone (WCAG 2.2 1.4.1).
export function IntentSuggestions({ t, activeIntentId, onSelect }) {
  return (
    <div className="intent-grid" role="group" aria-label={t.intentsLabel}>
      {HOME_INTENTS.map((intent) => {
        const active = intent.id === activeIntentId;
        const Icon = intent.icon;
        return (
          <button
            key={intent.id}
            type="button"
            className={"intent-tile" + (active ? " intent-tile-on" : "")}
            aria-pressed={active}
            onClick={() => onSelect(intent.id)}
          >
            <span className="intent-tile-icon" aria-hidden="true">
              {active ? <Check size={18} /> : <Icon size={18} />}
            </span>
            <span className="intent-tile-label">{t[intent.labelKey]}</span>
          </button>
        );
      })}
    </div>
  );
}
