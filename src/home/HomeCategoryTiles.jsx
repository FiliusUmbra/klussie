// Today's own icon-tile category grid — visual-refresh direction, 2026-10-01.
//
// NOT a revival of the horizontal-scrolling row HomeCategoryRow.jsx used to render
// (that file's own header: "424px of content in a 342px row at 390px viewport" — the
// exact "sideways-scrolling category menu" the redesign brief banned outright,
// 2026-09-28). This is a CSS GRID that wraps onto a second row instead of overflowing
// sideways — the root cause of that bug (a flex row with no wrap) never applies here,
// so reviving the richer tile visual doesn't reopen it. HomeCategoryRow.jsx itself
// (Help's own single "Browse all services" link) is untouched; this is a new,
// additional entry point on Today, not a replacement for that one.
//
// Real, live categories only (CATS/catName from useLang(), the same fetchCatalog() data
// every other category UI in this app reads) — never a fabricated list. Shows at most
// five, the same VISIBLE_LIMIT the original tile row used, plus a trailing "More" tile
// when there are more than that; selecting either opens AiIntakeSheet pre-seeded with
// that category (or nothing, for "More" — the exact `onSelectCategory(id | null)`
// contract KlussiePanel.jsx's own HomeCategoryRow already established, reused rather
// than invented fresh here).
import { MoreHorizontal } from "lucide-react";

const VISIBLE_LIMIT = 5;

export function HomeCategoryTiles({ t, CATS, catName, onSelectCategory }) {
  if (!CATS || CATS.length === 0) return null;

  const visible = CATS.slice(0, VISIBLE_LIMIT);
  const hasMore = CATS.length > VISIBLE_LIMIT;

  return (
    <div className="home-category-tiles" role="group" aria-label={t.homeBrowseCategoriesBtn}>
      {visible.map((cat, i) => {
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            className={"home-category-tile" + (i % 2 === 1 ? " home-category-tile-alt" : "")}
            onClick={() => onSelectCategory(cat.id)}
          >
            <span className="home-category-tile-icon" aria-hidden="true"><Icon size={19} /></span>
            <span className="home-category-tile-label">{catName(cat.id)}</span>
          </button>
        );
      })}
      {hasMore && (
        <button type="button" className="home-category-tile" onClick={() => onSelectCategory(null)}>
          <span className="home-category-tile-icon" aria-hidden="true"><MoreHorizontal size={19} /></span>
          <span className="home-category-tile-label">{t.homeCategoryMoreBtn}</span>
        </button>
      )}
    </div>
  );
}
