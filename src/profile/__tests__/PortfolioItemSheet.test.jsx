// PortfolioItemSheet.jsx's own tests — none existed before this.
//
// Found by code audit: save() and remove() had no try/catch at all. A real failure (RLS,
// network, the Storage remove deletePortfolioItem() also does) threw straight out of the
// handler — busy never went back to false and the sheet was left open, buttons
// permanently disabled, with nothing telling the pro anything went wrong.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/portfolio", () => ({
  updatePortfolioCaption: vi.fn(),
  deletePortfolioItem: vi.fn(),
}));

import { updatePortfolioCaption, deletePortfolioItem } from "../../lib/portfolio";
import { LangContext } from "../../lib/lang";
import { PortfolioItemSheet } from "../PortfolioItemSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

const ITEM = { id: "photo-1", image_url: "https://example.test/photo.jpg", storage_path: "pro-1/photo-1", caption: "Before" };

function renderSheet() {
  const onClose = vi.fn();
  const onChanged = vi.fn(() => Promise.resolve());
  render(
    <LangContext.Provider value={{ t }}>
      <PortfolioItemSheet item={ITEM} onClose={onClose} onChanged={onChanged} />
    </LangContext.Provider>
  );
  return { onClose, onChanged };
}

describe("PortfolioItemSheet — save", () => {
  it("saves the caption and closes on success", async () => {
    vi.mocked(updatePortfolioCaption).mockResolvedValue();
    const { onClose, onChanged } = renderSheet();

    fireEvent.click(screen.getByText("saveChangesBtn"));

    await waitFor(() => expect(updatePortfolioCaption).toHaveBeenCalledWith("photo-1", "Before"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a real error and re-enables the button instead of hanging forever", async () => {
    vi.mocked(updatePortfolioCaption).mockRejectedValue(new Error("new row violates row-level security policy"));
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByText("saveChangesBtn"));

    await waitFor(() => expect(screen.getByText("portfolioSaveFailed")).toBeTruthy());
    // The raw Postgres message never reaches the screen.
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("saveChangesBtn").disabled).toBe(false);
  });
});

describe("PortfolioItemSheet — delete", () => {
  it("deletes and closes on success", async () => {
    vi.mocked(deletePortfolioItem).mockResolvedValue();
    const { onClose, onChanged } = renderSheet();

    fireEvent.click(screen.getByText("deletePhotoBtn"));
    fireEvent.click(screen.getAllByText("deletePhotoBtn")[1]);

    await waitFor(() => expect(deletePortfolioItem).toHaveBeenCalledWith("photo-1", "pro-1/photo-1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a real error, closes the confirm modal, and re-enables the button on failure", async () => {
    vi.mocked(deletePortfolioItem).mockRejectedValue(new Error("network error"));
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByText("deletePhotoBtn"));
    fireEvent.click(screen.getAllByText("deletePhotoBtn")[1]);

    await waitFor(() => expect(screen.getByText("portfolioDeleteFailed")).toBeTruthy());
    expect(screen.queryByText("confirmDeleteMsg")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("deletePhotoBtn").disabled).toBe(false);
  });
});
