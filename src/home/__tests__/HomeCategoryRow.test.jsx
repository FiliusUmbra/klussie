// ADR-0033 (2026-09-15) — the Home screen's own compact category row. Component-level
// coverage; KlussiePanel/ConversationHome's own wiring (hidden mid-flow, onStart seed
// shape) is covered in src/__tests__/homeSurface.test.jsx instead, since that behavior
// belongs to how those files use this one, not to this component itself.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Wrench, Zap } from "lucide-react";
import { HomeCategoryRow } from "../HomeCategoryRow.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const catName = (id) => ({ repairs: "Herstelling", electrical: "Elektriciteit" })[id] ?? id;

describe("HomeCategoryRow", () => {
  it("renders nothing when there are no categories yet", () => {
    const { container } = render(<HomeCategoryRow t={t} CATS={[]} catName={catName} onSelectCategory={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when CATS hasn't resolved at all", () => {
    const { container } = render(<HomeCategoryRow t={t} CATS={null} catName={catName} onSelectCategory={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows every category and no More tile when there are five or fewer", () => {
    const CATS = [{ id: "repairs", icon: Wrench }, { id: "electrical", icon: Zap }];
    render(<HomeCategoryRow t={t} CATS={CATS} catName={catName} onSelectCategory={vi.fn()} />);
    expect(screen.getByText("Herstelling")).toBeTruthy();
    expect(screen.getByText("Elektriciteit")).toBeTruthy();
    expect(screen.queryByText("homeCategoryMoreBtn")).toBeNull();
  });

  it("calls onSelectCategory with the tapped category's own id", () => {
    const CATS = [{ id: "repairs", icon: Wrench }, { id: "electrical", icon: Zap }];
    const onSelectCategory = vi.fn();
    render(<HomeCategoryRow t={t} CATS={CATS} catName={catName} onSelectCategory={onSelectCategory} />);

    fireEvent.click(screen.getByText("Elektriciteit"));

    expect(onSelectCategory).toHaveBeenCalledWith("electrical");
  });

  it("caps the row at five real tiles and adds a More tile for the rest", () => {
    const CATS = Array.from({ length: 7 }, (_, i) => ({ id: `cat-${i}`, icon: Wrench }));
    render(<HomeCategoryRow t={t} CATS={CATS} catName={(id) => id} onSelectCategory={vi.fn()} />);

    expect(screen.getByText("cat-0")).toBeTruthy();
    expect(screen.getByText("cat-4")).toBeTruthy();
    expect(screen.queryByText("cat-5")).toBeNull();
    expect(screen.getByText("homeCategoryMoreBtn")).toBeTruthy();
  });

  it("calls onSelectCategory with null from the More tile, not a sixth category's id", () => {
    const CATS = Array.from({ length: 7 }, (_, i) => ({ id: `cat-${i}`, icon: Wrench }));
    const onSelectCategory = vi.fn();
    render(<HomeCategoryRow t={t} CATS={CATS} catName={(id) => id} onSelectCategory={onSelectCategory} />);

    fireEvent.click(screen.getByText("homeCategoryMoreBtn"));

    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });
});
