// Beta UX polish: PriceTag's own money amounts were dropping trailing zeros — a bare
// toLocaleString() call renders 25.2 as "25,2", not "25,20", found live on the demo
// invoice's VAT line. Covers the fix: every real caller (quotes, invoices, fees,
// payouts, budgets) always gets exactly two decimals, never fewer, never more.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceTag } from "../primitives.jsx";

// The same shape useLang().fmt actually has — locale-aware, options passed straight
// through to toLocaleString, exactly like langContext.js's own implementation.
const fmt = (n, options) => Number(n).toLocaleString("nl-BE", options);

describe("PriceTag", () => {
  it("pads a one-decimal amount to two, not \"25,2\"", () => {
    render(<PriceTag amount={25.2} fmt={fmt} />);
    expect(screen.getByText("€25,20")).toBeTruthy();
  });

  it("pads a whole-euro amount to two decimals too, not a bare \"120\"", () => {
    render(<PriceTag amount={120} fmt={fmt} />);
    expect(screen.getByText("€120,00")).toBeTruthy();
  });

  it("still rounds to two decimals when given more precision, never three or more", () => {
    render(<PriceTag amount={14.4444} fmt={fmt} />);
    expect(screen.getByText("€14,44")).toBeTruthy();
  });

  it("keeps the locale-aware thousands separator for a large amount", () => {
    render(<PriceTag amount={1234.5} fmt={fmt} />);
    expect(screen.getByText("€1.234,50")).toBeTruthy();
  });

  it("falls back to the raw amount, unformatted, when no fmt is supplied", () => {
    render(<PriceTag amount={25.2} />);
    expect(screen.getByText("€25.2")).toBeTruthy();
  });

  it("applies the size class it always has", () => {
    const { container } = render(<PriceTag amount={10} fmt={fmt} size="sm" />);
    expect(container.querySelector(".price-tag-sm")).toBeTruthy();
  });
});
