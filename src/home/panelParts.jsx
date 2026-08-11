// Shared building block for the My Home and My Items panels.
//
// This used to also hold QuickActions and NotBuiltYetNote — a row of disabled buttons and
// a sentence explaining that klussie did not store anything yet. Both were honest while
// the surfaces were placeholders and became false the moment they weren't: My Items now
// has storage (0016) and My Home is derived from real requests. They are deleted rather
// than left unused, because a component that says "not built yet" is exactly the kind of
// stale claim that outlives the condition it described.

// A section that shows a plain-language line when it holds nothing, and its real
// content when it does. Progressive disclosure (DESIGN_SYSTEM.md): a customer opening
// My Home should see calm headings, not empty tables.
//
// The empty line is always a real sentence about that specific section — "no professional
// has finished a job here yet" — rather than one generic "nothing saved" repeated down the
// page, which tells someone nothing about what would fill it.
export function HomeSection({ title, emptyText, children, isEmpty }) {
  return (
    <section className="home-group">
      <h3 className="home-group-title">{title}</h3>
      {isEmpty ? <p className="home-group-empty">{emptyText}</p> : children}
    </section>
  );
}
