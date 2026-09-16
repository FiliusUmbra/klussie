// The Home screen's own compact category row (ADR-0033's mockup, 2026-09-15) — a
// glanceable shortcut into request creation, alongside the conversational composer and
// intent tiles above it, never instead of them (ADR-0033's own decision #3: "a real,
// additional entry point... never instead of"). Tapping a real category opens
// AiIntakeSheet with that category already selected — the exact selection state its own
// compose-stage grid (ADR-0033's earlier slice) already tracks, so this row is a
// shortcut onto that grid, not a second copy of its logic.
//
// Shows at most five real categories plus a trailing "More" tile when there are more
// than that — matching the mockup's own compact row — rather than every category CATS
// holds, which is what the full grid inside AiIntakeSheet is already for. "More" opens
// the sheet with nothing pre-selected, landing on that full grid.
import { MoreHorizontal } from "lucide-react";

const VISIBLE_LIMIT = 5;

export function HomeCategoryRow({ t, CATS, catName, onSelectCategory }) {
  if (!CATS || CATS.length === 0) return null;

  const visible = CATS.slice(0, VISIBLE_LIMIT);
  const hasMore = CATS.length > VISIBLE_LIMIT;

  return (
    <div className="home-category-row" role="group" aria-label={t.homeBrowseCategoriesBtn}>
      {visible.map((cat) => {
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            className="home-category-tile"
            onClick={() => onSelectCategory(cat.id)}
          >
            <span className="home-category-tile-icon" aria-hidden="true"><Icon size={18} /></span>
            <span className="home-category-tile-label">{catName(cat.id)}</span>
          </button>
        );
      })}
      {hasMore && (
        <button type="button" className="home-category-tile" onClick={() => onSelectCategory(null)}>
          <span className="home-category-tile-icon" aria-hidden="true"><MoreHorizontal size={18} /></span>
          <span className="home-category-tile-label">{t.homeCategoryMoreBtn}</span>
        </button>
      )}
    </div>
  );
}
