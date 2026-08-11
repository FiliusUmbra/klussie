// Shared building blocks for the My Home and My Items panels.
//
// Both surfaces are the same shape — a question, a row of quick actions, then
// progressively-disclosed sections — so the shape lives here once rather than being
// written twice with small accidental differences (ENGINEERING_STANDARDS.md,
// "no duplicated code").

// A quick action that cannot do anything yet says so, in place, on the control
// itself. The alternative — showing it as if it worked and failing on tap, or hiding
// it entirely so the surface looks emptier than the plan — are the two shortcuts
// Constitution Rule 9 rules out. `available: false` is the honest third option.
export function QuickActions({ t, actions, label }) {
  return (
    <ul className="quick-actions" aria-label={label}>
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            className={"quick-action" + (action.available ? "" : " quick-action-off")}
            onClick={action.available ? action.onClick : undefined}
            disabled={!action.available}
            // Disabled controls are skipped by some screen readers, so the reason
            // rides along in the accessible name rather than only in the visual chip.
            aria-label={action.available ? t[action.labelKey] : `${t[action.labelKey]} — ${t.homeNotBuiltYet}`}
          >
            <span className="quick-action-glyph" aria-hidden="true"><action.icon size={15} /></span>
            <span className="quick-action-label">{t[action.labelKey]}</span>
            {!action.available && <span className="quick-action-flag" aria-hidden="true">{t.homeNotBuiltYet}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// A section that shows a plain-language line when it holds nothing, and its real
// content when it does. Progressive disclosure (DESIGN_SYSTEM.md): a customer opening
// My Home should see six calm headings, not six empty tables.
export function HomeSection({ title, emptyText, children, isEmpty }) {
  return (
    <section className="home-group">
      <h3 className="home-group-title">{title}</h3>
      {isEmpty ? <p className="home-group-empty">{emptyText}</p> : children}
    </section>
  );
}

// The one honest sentence both panels lead with while no schema backs them. Stated
// once, at the top, rather than repeated as six identical empty strings — and it
// explains *why* rather than only reporting absence (COPY_GUIDELINES.md).
export function NotBuiltYetNote({ t }) {
  return <p className="home-note">{t.homeNotBuiltYetNote}</p>;
}
