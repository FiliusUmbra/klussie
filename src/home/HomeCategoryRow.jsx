// The Home screen's own secondary route into the full category grid.
//
// UX redesign, 2026-09-28 — replaces the compact row of up to six tiles this file used
// to render, which scrolled horizontally at ordinary phone widths (confirmed live:
// 424px of content in a 342px row at 390px viewport) — exactly the pattern the redesign
// brief bans outright ("no sideways-scrolling menus... category menus"). The brief's own
// replacement is explicit: "Keep category browsing as a secondary 'Browse all services'
// route" — one visible, always-reachable action, not a row of tiles competing with the
// composer and the three intent shortcuts above it for the same attention. Opens the
// exact same destination the old row's own "More" tile did (AiIntakeSheet's compose-
// stage category grid, ADR-0033) — nothing about where this leads has changed, only how
// many taps it costs to get there before deciding.
export function HomeCategoryRow({ t, onSelectCategory }) {
  return (
    <button type="button" className="home-browse-services" onClick={() => onSelectCategory(null)}>
      {t.homeBrowseCategoriesBtn}
    </button>
  );
}
