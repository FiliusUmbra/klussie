// BusinessProfileSection.jsx's own tests. Moved here verbatim (same scenarios, same
// assertions) from Profile.test.jsx's own "pro variant, saveServices / portfolio upload /
// portfolio-testimonials initial load failure / removing a testimonial / suggest a missing
// service" describe blocks — see BusinessApp.jsx's own header for why this section moved
// out of Profile.jsx (Account) into Business. No "boost" describe block here: UX_TAB_SCOPE.md
// P5 removed the paid-promotion purchase flow entirely (see BusinessProfileSection.jsx's
// own header) — there is nothing left to test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/pros", () => ({
  updateProServices: vi.fn(),
}));
vi.mock("../../lib/portfolio", () => ({
  uploadPortfolioImage: vi.fn(), addPortfolioItem: vi.fn(),
  fetchPortfolioItems: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../lib/testimonials", () => ({
  fetchTestimonials: vi.fn(() => Promise.resolve([])), deleteTestimonial: vi.fn(),
}));
vi.mock("../../lib/serviceSuggestions.js", () => ({
  suggestService: vi.fn(),
}));
vi.mock("../../profile/ProPublicProfileSheet.jsx", () => ({
  ProPublicProfileSheet: ({ proId }) => <div>public-profile-preview-stub:{proId}</div>,
}));

import { LangContext } from "../../lib/lang";
import { BusinessProfileSection } from "../BusinessProfileSection.jsx";
import { updateProServices } from "../../lib/pros";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems } from "../../lib/portfolio";
import { deleteTestimonial, fetchTestimonials } from "../../lib/testimonials";
import { suggestService } from "../../lib/serviceSuggestions.js";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t, catName: (c) => c, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  CATS: [], BASE_SERVICES: [], langCode: "en",
};

const PRO_PROFILE = { bio: "", pro_type: "flexi", paused: false };

function renderSection(overrides = {}) {
  useAuthMock.mockReturnValue({
    user: { id: "person-1" },
    proProfile: PRO_PROFILE,
    activeWorkspace: { workspace_id: "ws-pro" },
    refreshProfile: vi.fn(),
    ...overrides,
  });
  return render(
    <LangContext.Provider value={ctx}>
      <BusinessProfileSection offeredServiceIds={[]} onServicesChange={vi.fn()} {...overrides.sectionProps} />
    </LangContext.Provider>
  );
}

// UX_TAB_SCOPE.md P5, 2026-09-29 — "add clearly labelled shortcuts to... public-profile
// preview." New: no equivalent existed on the pro side before this.
describe("BusinessProfileSection — public-profile preview", () => {
  it("opens the pro's own public profile, by their own id, on tap", () => {
    renderSection();
    fireEvent.click(screen.getByText("previewPublicProfileBtn"));
    expect(screen.getByText("public-profile-preview-stub:person-1")).toBeTruthy();
  });
});

describe("BusinessProfileSection — saveServices", () => {
  it("re-enables the button rather than leaving it stuck, and shows a real error, when saving fails", async () => {
    updateProServices.mockReset();
    updateProServices.mockRejectedValueOnce(new Error("insufficient_privilege"));
    renderSection();

    fireEvent.click(screen.getByText("saveServicesBtn"));

    await waitFor(() => expect(screen.getByText("saveServicesFailed")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    expect(screen.getByText("saveServicesBtn").closest("button").disabled).toBe(false);
  });

  it("shows no error at all when saving succeeds", async () => {
    updateProServices.mockReset();
    updateProServices.mockResolvedValueOnce(undefined);
    renderSection();

    fireEvent.click(screen.getByText("saveServicesBtn"));

    await waitFor(() => expect(updateProServices).toHaveBeenCalled());
    expect(screen.queryByText("saveServicesFailed")).toBeNull();
  });

  it("passes the active workspace id, not just the person and selection, to updateProServices", async () => {
    updateProServices.mockReset();
    updateProServices.mockResolvedValueOnce(undefined);
    renderSection();

    fireEvent.click(screen.getByText("saveServicesBtn"));

    await waitFor(() => expect(updateProServices).toHaveBeenCalledWith("person-1", [], "ws-pro"));
  });
});

describe("BusinessProfileSection — portfolio upload", () => {
  it("shows a real error, never the raw backend message, when the upload fails", async () => {
    uploadPortfolioImage.mockReset();
    uploadPortfolioImage.mockRejectedValueOnce(new Error("storage quota exceeded"));
    renderSection();

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("portfolioUploadFailed")).toBeTruthy());
    expect(screen.queryByText("storage quota exceeded")).toBeNull();
    expect(addPortfolioItem).not.toHaveBeenCalled();
  });

  it("uploads and refreshes the grid on success", async () => {
    uploadPortfolioImage.mockReset();
    uploadPortfolioImage.mockResolvedValueOnce({ url: "https://example.test/p.jpg", path: "pro-1/p" });
    addPortfolioItem.mockReset();
    addPortfolioItem.mockResolvedValueOnce({});
    fetchPortfolioItems.mockClear();
    renderSection();

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => expect(addPortfolioItem).toHaveBeenCalled());
    expect(screen.queryByText("portfolioUploadFailed")).toBeNull();
  });

  it("shows no error at all when the upload succeeds but the post-upload refreshPortfolio() fails", async () => {
    uploadPortfolioImage.mockReset();
    uploadPortfolioImage.mockResolvedValueOnce({ url: "https://example.test/p.jpg", path: "pro-1/p" });
    addPortfolioItem.mockReset();
    addPortfolioItem.mockResolvedValueOnce({});
    fetchPortfolioItems.mockReset();
    fetchPortfolioItems.mockResolvedValueOnce([]); // initial load
    renderSection();
    await waitFor(() => expect(fetchPortfolioItems).toHaveBeenCalledTimes(1));
    fetchPortfolioItems.mockRejectedValueOnce(new Error("network blip refreshing the portfolio grid"));

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => expect(addPortfolioItem).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector(".portfolio-add").disabled).toBe(false));
    expect(screen.queryByText("portfolioUploadFailed")).toBeNull();
  });
});

describe("BusinessProfileSection — portfolio/testimonials initial load failure", () => {
  it("degrades to the real empty states, never an unhandled rejection, when both fetches fail", async () => {
    fetchPortfolioItems.mockReset();
    fetchPortfolioItems.mockRejectedValueOnce(new Error("relation \"portfolio_items\" does not exist"));
    fetchTestimonials.mockReset();
    fetchTestimonials.mockRejectedValueOnce(new Error("relation \"testimonials\" does not exist"));

    renderSection();

    await waitFor(() => expect(screen.getByText("noPortfolioYet")).toBeTruthy());
    expect(screen.getByText("noTestimonialsYet")).toBeTruthy();
    expect(screen.queryByText(/does not exist/)).toBeNull();
  });
});

describe("BusinessProfileSection — removing a testimonial", () => {
  function renderWithTestimonial() {
    fetchTestimonials.mockReset();
    fetchTestimonials.mockResolvedValue([{ id: "tst-1", client_name: "Cathy", quote_text: "Great work!" }]);
    return renderSection();
  }

  it("shows a real error and keeps the confirm modal open, re-enabling both buttons, when deletion fails", async () => {
    deleteTestimonial.mockReset();
    deleteTestimonial.mockRejectedValueOnce(new Error("network error"));
    renderWithTestimonial();

    await screen.findByText("Cathy");
    fireEvent.click(screen.getByText("deleteBtn"));
    fireEvent.click(screen.getAllByText("deleteBtn")[1]);

    await waitFor(() => expect(screen.getByText("testimonialDeleteFailed")).toBeTruthy());
    expect(screen.queryByText("network error")).toBeNull();
    expect(screen.getByText("cancelBtn")).toBeTruthy();
  });

  it("deletes and closes the modal on success", async () => {
    deleteTestimonial.mockReset();
    deleteTestimonial.mockResolvedValueOnce(undefined);
    renderWithTestimonial();

    await screen.findByText("Cathy");
    fireEvent.click(screen.getByText("deleteBtn"));
    fireEvent.click(screen.getAllByText("deleteBtn")[1]);

    await waitFor(() => expect(deleteTestimonial).toHaveBeenCalledWith("tst-1"));
    await waitFor(() => expect(screen.queryByText("cancelBtn")).toBeNull());
  });

  it("closes the modal with no error even when deletion succeeds but the post-delete refreshTestimonials() fails", async () => {
    deleteTestimonial.mockReset();
    deleteTestimonial.mockResolvedValueOnce(undefined);
    renderWithTestimonial();
    await screen.findByText("Cathy");
    fetchTestimonials.mockRejectedValueOnce(new Error("network blip refreshing testimonials"));

    fireEvent.click(screen.getByText("deleteBtn"));
    fireEvent.click(screen.getAllByText("deleteBtn")[1]);

    await waitFor(() => expect(deleteTestimonial).toHaveBeenCalledWith("tst-1"));
    await waitFor(() => expect(screen.queryByText("cancelBtn")).toBeNull());
    expect(screen.queryByText("testimonialDeleteFailed")).toBeNull();
  });
});

// UX_TAB_SCOPE.md P5 — the paid promotion purchase flow is gone entirely, not just
// de-emphasized. See BusinessProfileSection.jsx's own header for why.
describe("BusinessProfileSection — no paid promotion", () => {
  it("never renders a Boost purchase action or price", () => {
    renderSection();
    expect(screen.queryByText(/boostBtn/)).toBeNull();
    expect(screen.queryByText("boostTitle")).toBeNull();
  });
});

describe("BusinessProfileSection — suggest a missing service (Theme E)", () => {
  beforeEach(() => {
    suggestService.mockReset();
  });

  it("offers the entry point", () => {
    renderSection();
    expect(screen.getByText("suggestServiceEntryBtn")).toBeTruthy();
  });

  it("opens SuggestServiceSheet on tap", () => {
    renderSection();
    fireEvent.click(screen.getByText("suggestServiceEntryBtn"));
    expect(screen.getByText("suggestServiceTitle")).toBeTruthy();
  });

  it("attaches a real AI match immediately, through the same updateProServices() write the chip picker uses", async () => {
    updateProServices.mockReset();
    updateProServices.mockResolvedValueOnce(undefined);
    suggestService.mockResolvedValue({ outcome: "match", matchedServiceId: "svc-9" });
    const onServicesChange = vi.fn();
    renderSection({ sectionProps: { onServicesChange } });

    fireEvent.click(screen.getByText("suggestServiceEntryBtn"));
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I clean gutters" } });
    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(updateProServices).toHaveBeenCalledWith("person-1", ["svc-9"], "ws-pro"));
    expect(onServicesChange).toHaveBeenCalledWith(["svc-9"]);
  });

  it("does not touch updateProServices at all for a new proposal — only a real operator decision does that", async () => {
    updateProServices.mockReset();
    suggestService.mockResolvedValue({ outcome: "new", suggestionId: "sugg-1" });
    renderSection();

    fireEvent.click(screen.getByText("suggestServiceEntryBtn"));
    fireEvent.change(screen.getByLabelText("suggestServiceDescriptionLabel"), { target: { value: "I install solar panels" } });
    fireEvent.click(screen.getByText("suggestServiceSubmitBtn"));

    await waitFor(() => expect(screen.getByText("suggestServiceSentMsg")).toBeTruthy());
    expect(updateProServices).not.toHaveBeenCalled();
  });
});
