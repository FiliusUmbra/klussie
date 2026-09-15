// Home foundation slice — the property equivalent of WorkspaceSwitcher.jsx. Mirrors that
// component's own established "invisible for the single case" contract.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PropertySwitcher } from "../PropertySwitcher.jsx";

const HOME = { id: "p1", name: "My Home" };
const HOLIDAY = { id: "p2", name: "Vakantiehuis" };

describe("PropertySwitcher", () => {
  it("renders nothing when there is no property list yet", () => {
    const { container } = render(<PropertySwitcher properties={null} activePropertyId={null} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for exactly one property, the same as WorkspaceSwitcher's own single-workspace case", () => {
    const { container } = render(<PropertySwitcher properties={[HOME]} activePropertyId="p1" onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<PropertySwitcher properties={[]} activePropertyId={null} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows every property by its real name once there are two or more", () => {
    render(<PropertySwitcher properties={[HOME, HOLIDAY]} activePropertyId="p1" onSelect={vi.fn()} />);
    expect(screen.getByText("My Home")).toBeTruthy();
    expect(screen.getByText("Vakantiehuis")).toBeTruthy();
  });

  it("marks the active property, not the others", () => {
    render(<PropertySwitcher properties={[HOME, HOLIDAY]} activePropertyId="p2" onSelect={vi.fn()} />);
    expect(screen.getByText("Vakantiehuis").closest("button").className).toContain("seg-on");
    expect(screen.getByText("My Home").closest("button").className).not.toContain("seg-on");
  });

  it("calls onSelect with the tapped property's id", () => {
    const onSelect = vi.fn();
    render(<PropertySwitcher properties={[HOME, HOLIDAY]} activePropertyId="p1" onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Vakantiehuis"));

    expect(onSelect).toHaveBeenCalledWith("p2");
  });
});
