// klussie design system — segmented tabs.
//
// A real ARIA tablist: roving tabindex, arrow/Home/End keys, and aria-controls
// wiring, because the homepage's three sections are panels of one surface and not
// navigation (ADR-0007 keeps the canvas as the single front door; ADR-0008 keeps the
// bottom nav's shape unchanged). Rendering them as links or as four bottom-nav items
// would contradict both.
//
// The app already had a `.segmented` control, but it belongs to the demo shell's dark
// topbar — different palette, no tab semantics, no keyboard handling. Extending it
// would have meant one component serving two unrelated contexts; this is the real
// in-app control, and the topbar's stays what it is.
import { useRef } from "react";

// Selected state is never carried by colour alone: the active tab gets a filled
// surface, a heavier weight, and an indicator bar, on top of aria-selected for
// assistive tech. WCAG 2.2 1.4.1.
//
// dir flips arrow-key direction — in RTL, ArrowRight moves toward the previous tab,
// which is what the key physically points at on screen.
export function SegmentedTabs({ tabs, activeId, onChange, label, idPrefix, dir = "ltr" }) {
  const refs = useRef({});

  const move = (delta) => {
    const index = tabs.findIndex((tb) => tb.id === activeId);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    // Focus follows selection, the standard automatic-activation tablist behaviour —
    // without it the keyboard user selects a tab they are no longer focused on.
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (e) => {
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward || e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === backward || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); onChange(tabs[0].id); refs.current[tabs[0].id]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); const last = tabs[tabs.length - 1]; onChange(last.id); refs.current[last.id]?.focus(); }
  };

  return (
    <div className="seg-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tb) => {
        const selected = tb.id === activeId;
        return (
          <button
            key={tb.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tb.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tb.id}`}
            tabIndex={selected ? 0 : -1}
            ref={(el) => { refs.current[tb.id] = el; }}
            className={"seg-tab" + (selected ? " seg-tab-on" : "")}
            onClick={() => onChange(tb.id)}
          >
            {tb.label}
          </button>
        );
      })}
    </div>
  );
}

// tabIndex={0} because the panel is a scrollable region in its own right; without it
// a keyboard user can reach the tabs but not scroll what they selected.
export function TabPanel({ id, tabId, active, children }) {
  if (!active) return null;
  return (
    <div id={id} role="tabpanel" aria-labelledby={tabId} tabIndex={0} className="seg-tabpanel">
      {children}
    </div>
  );
}
