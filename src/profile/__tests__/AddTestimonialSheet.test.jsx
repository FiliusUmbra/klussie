// AddTestimonialSheet.jsx's own tests — none existed before this.
//
// Found by code audit: on failure the catch block did `setError(err.message)`, showing a
// raw Postgres/RLS error verbatim — the exact anti-pattern documents.js's own header
// names and fixes ("t.documentFormSaveFailed already existed... and was never used").
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/testimonials", () => ({ addTestimonial: vi.fn() }));

import { addTestimonial } from "../../lib/testimonials";
import { LangContext } from "../../lib/lang";
import { AddTestimonialSheet } from "../AddTestimonialSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

function renderSheet() {
  const onClose = vi.fn();
  const onAdded = vi.fn(() => Promise.resolve());
  render(
    <LangContext.Provider value={{ t }}>
      <AddTestimonialSheet proId="pro-1" onClose={onClose} onAdded={onAdded} />
    </LangContext.Provider>
  );
  return { onClose, onAdded };
}

describe("AddTestimonialSheet", () => {
  it("does nothing on an empty quote", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "addTestimonialBtn" }));
    expect(addTestimonial).not.toHaveBeenCalled();
  });

  // Found by code audit, 2026-09-11: the required-field guard lived only inside submit()
  // as a silent no-op — the button itself stayed enabled and gave no visible sign that
  // anything was required, unlike every other form in this codebase with a real required
  // field (DocumentUploadSheet.jsx, LocationFormSheet.jsx, ItemFormSheet.jsx,
  // ServiceRecordEditorSheet.jsx), which all disable their own submit button instead.
  it("disables the submit button until a real quote is typed, matching every other required-field form in this codebase", () => {
    renderSheet();
    const button = screen.getByRole("button", { name: "addTestimonialBtn" });
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByText("testimonialTextLabel").nextElementSibling, { target: { value: "   " } });
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByText("testimonialTextLabel").nextElementSibling, { target: { value: "Great work!" } });
    expect(button.disabled).toBe(false);
  });

  it("saves and closes on success", async () => {
    vi.mocked(addTestimonial).mockResolvedValue({ id: "t1" });
    const { onClose, onAdded } = renderSheet();

    fireEvent.change(screen.getByText("testimonialTextLabel").nextElementSibling, { target: { value: "Great work!" } });
    fireEvent.click(screen.getByRole("button", { name: "addTestimonialBtn" }));

    await waitFor(() => expect(addTestimonial).toHaveBeenCalledWith({ proId: "pro-1", clientName: "", quoteText: "Great work!" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a generic localized error, never the raw backend message, on failure", async () => {
    vi.mocked(addTestimonial).mockRejectedValue(new Error("new row violates row-level security policy"));
    const { onClose } = renderSheet();

    fireEvent.change(screen.getByText("testimonialTextLabel").nextElementSibling, { target: { value: "Great work!" } });
    fireEvent.click(screen.getByRole("button", { name: "addTestimonialBtn" }));

    await waitFor(() => expect(screen.getByText("testimonialSaveFailed")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
