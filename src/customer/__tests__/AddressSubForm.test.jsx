// AddressSubForm — the selected property type is announced (live review 2026-10-04, item 13:
// selections were conveyed visually only).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddressSubForm } from "../AddressSubForm.jsx";
import { PROPERTY_TYPES } from "../addressFields.js";

const t = new Proxy({}, { get: (_, key) => String(key) });

describe("AddressSubForm", () => {
  it("marks only the chosen property type as pressed", () => {
    const [first, second] = PROPERTY_TYPES;
    render(<AddressSubForm t={t} address={{ street: "", houseNumber: "", postcode: "", municipality: "", propertyType: second }} onChange={() => {}} />);
    expect(screen.getByText(`propertyType_${second}`).closest("button").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(`propertyType_${first}`).closest("button").getAttribute("aria-pressed")).toBe("false");
  });
});
