// ReviewSheet.jsx's own tests — none existed before this.
//
// Found by code audit, 2026-09-11: the star-picker's own aria-label was a hardcoded
// English string ("Rate 1 star", "Rate 2 stars", ...) — the accessibility pass that gave
// these five buttons a label at all (ACCESSIBILITY.md's own "Fixed in this pass" table)
// never actually localized it, so a screen reader on "leave a review" — a real, reachable
// customer flow — announced this in English regardless of which locale a person had
// already picked, in every one of the other 9 locales.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { ReviewSheet } from "../ReviewSheet.jsx";

const t = {
  closeBtn: "Sluiten", reviewTitle: "Beoordeel je ervaring", howDidItGo: "Hoe ging het?",
  submitReviewBtn: "Beoordeling versturen", defaultReviewText: "Prima service.",
  reviewStarLabelOne: "Geef 1 ster", reviewStarLabel: "Geef {n} sterren",
};

function renderSheet(onSubmit = () => {}) {
  return render(
    <LangContext.Provider value={{ t }}>
      <ReviewSheet onClose={() => {}} onSubmit={onSubmit} />
    </LangContext.Provider>
  );
}

describe("ReviewSheet — star-picker accessible names", () => {
  it("gives the one-star button its own real, translated label, not the literal English 'Rate 1 star'", () => {
    renderSheet();
    expect(screen.getByLabelText("Geef 1 ster")).toBeTruthy();
    expect(screen.queryByLabelText("Rate 1 star")).toBeNull();
  });

  it("interpolates the real count into the other four buttons, not the literal English 'Rate N stars'", () => {
    renderSheet();
    for (const n of [2, 3, 4, 5]) {
      expect(screen.getByLabelText(`Geef ${n} sterren`)).toBeTruthy();
      expect(screen.queryByLabelText(`Rate ${n} stars`)).toBeNull();
    }
  });

  it("still sets the star value on click, unaffected by the label fix", () => {
    const onSubmit = vi.fn();
    renderSheet(onSubmit);
    fireEvent.click(screen.getByLabelText("Geef 3 sterren"));
    fireEvent.click(screen.getByText("Beoordeling versturen"));
    expect(onSubmit).toHaveBeenCalledWith({ stars: 3, text: "Prima service." });
  });
});
