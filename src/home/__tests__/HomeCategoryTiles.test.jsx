// Today's own icon-tile category grid. Component-level coverage, mirroring the
// original HomeCategoryRow.test.jsx this file is adapted from (git history, PR #200) —
// same contract (CATS/catName/onSelectCategory, five-tile cap plus a More tile), new
// component because this is a CSS grid on Today, not a revival of the horizontal-
// scrolling row that component's own header warns against (see HomeCategoryTiles.jsx's
// own header for the full story).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Wrench, Zap } from "lucide-react";
import { HomeCategoryTiles } from "../HomeCategoryTiles.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const catName = (id) => ({ repairs: "Herstelling", electrical: "Elektriciteit" })[id] ?? id;

describe("HomeCategoryTiles", () => {
  it("renders nothing when there are no categories yet", () => {
    const { container } = render(<HomeCategoryTiles t={t} CATS={[]} catName={catName} onSelectCategory={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when CATS hasn't resolved at all", () => {
    const { container } = render(<HomeCategoryTiles t={t} CATS={null} catName={catName} onSelectCategory={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows every category and no More tile when there are five or fewer", () => {
    const CATS = [{ id: "repairs", icon: Wrench }, { id: "electrical", icon: Zap }];
    render(<HomeCategoryTiles t={t} CATS={CATS} catName={catName} onSelectCategory={vi.fn()} />);
    expect(screen.getByText("Herstelling")).toBeTruthy();
    expect(screen.getByText("Elektriciteit")).toBeTruthy();
    expect(screen.queryByText("homeCategoryMoreBtn")).toBeNull();
  });

  it("calls onSelectCategory with the tapped category's own id", () => {
    const CATS = [{ id: "repairs", icon: Wrench }, { id: "electrical", icon: Zap }];
    const onSelectCategory = vi.fn();
    render(<HomeCategoryTiles t={t} CATS={CATS} catName={catName} onSelectCategory={onSelectCategory} />);

    fireEvent.click(screen.getByText("Elektriciteit"));

    expect(onSelectCategory).toHaveBeenCalledWith("electrical");
  });

  it("caps the grid at five real tiles and adds a More tile for the rest", () => {
    const CATS = Array.from({ length: 7 }, (_, i) => ({ id: `cat-${i}`, icon: Wrench }));
    render(<HomeCategoryTiles t={t} CATS={CATS} catName={(id) => id} onSelectCategory={vi.fn()} />);

    expect(screen.getByText("cat-0")).toBeTruthy();
    expect(screen.getByText("cat-4")).toBeTruthy();
    expect(screen.queryByText("cat-5")).toBeNull();
    expect(screen.getByText("homeCategoryMoreBtn")).toBeTruthy();
  });

  it("calls onSelectCategory with null from the More tile, not a sixth category's id", () => {
    const CATS = Array.from({ length: 7 }, (_, i) => ({ id: `cat-${i}`, icon: Wrench }));
    const onSelectCategory = vi.fn();
    render(<HomeCategoryTiles t={t} CATS={CATS} catName={(id) => id} onSelectCategory={onSelectCategory} />);

    fireEvent.click(screen.getByText("homeCategoryMoreBtn"));

    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });
});
