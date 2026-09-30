// UX redesign, 2026-09-28 — replaces the six-tile, horizontally-scrolling row this
// component used to render (confirmed live to genuinely overflow at ordinary phone
// widths) with a single "Browse all services" link. Component-level coverage;
// KlussiePanel/ConversationHome's own wiring is covered in
// src/__tests__/homeSurface.test.jsx instead, since that behavior belongs to how those
// files use this one, not to this component itself.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeCategoryRow } from "../HomeCategoryRow.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

describe("HomeCategoryRow", () => {
  it("renders one link, labelled from t, not a row of tiles", () => {
    render(<HomeCategoryRow t={t} onSelectCategory={vi.fn()} />);
    const button = screen.getByText("homeBrowseCategoriesBtn");
    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toBe("home-browse-services");
  });

  it("calls onSelectCategory with null — the full grid, nothing pre-selected", () => {
    const onSelectCategory = vi.fn();
    render(<HomeCategoryRow t={t} onSelectCategory={onSelectCategory} />);

    fireEvent.click(screen.getByText("homeBrowseCategoriesBtn"));

    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });
});
