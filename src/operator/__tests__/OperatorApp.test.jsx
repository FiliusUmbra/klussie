// Platform Activation Slice 0, WP 0.5 — a minimal render test for a minimal shell.
// Grows alongside the component in WP 0.6, when the Audit tab stops being a placeholder.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorApp } from "../OperatorApp.jsx";

describe("OperatorApp", () => {
  it("identifies itself as the Operations Workspace, distinctly from Customer/Pro", () => {
    render(<OperatorApp />);

    expect(screen.getByText("Klussie Operations")).toBeTruthy();
  });

  it("shows one tab, Audit, selected by default", () => {
    render(<OperatorApp />);

    const tab = screen.getByRole("tab", { name: "Audit" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });

  it("shows the placeholder body WP 0.6 replaces with the real Audit viewer", () => {
    render(<OperatorApp />);

    expect(screen.getByText("The audit log lands here next.")).toBeTruthy();
  });
});
