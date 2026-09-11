// ProPublicProfileSheet.jsx's own tests — none existed before this.
//
// Found by code audit: fetchPublicProInfo() throws on a real Postgres error, and the
// whole sheet's render gates on proInfo -- with no catch, a real failure left proInfo
// null forever, so tapping a pro's name/avatar (RequestDetailSheet.jsx, MyHomePanel.jsx's
// trusted-pros list) hung on a bare "..." placeholder forever: no error, no retry. The
// other three fetches (portfolio/reviews/testimonials) also threw with no catch but
// degrade gracefully already once their own state resolves to an empty default.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchPublicProInfoMock = vi.fn();
const fetchReviewsForProMock = vi.fn();
vi.mock("../../lib/pros", () => ({
  fetchPublicProInfo: (...args) => fetchPublicProInfoMock(...args),
  fetchReviewsForPro: (...args) => fetchReviewsForProMock(...args),
  trustScore: () => 80,
}));
const fetchPortfolioItemsMock = vi.fn();
vi.mock("../../lib/portfolio", () => ({
  fetchPortfolioItems: (...args) => fetchPortfolioItemsMock(...args),
}));
const fetchTestimonialsMock = vi.fn();
vi.mock("../../lib/testimonials", () => ({
  fetchTestimonials: (...args) => fetchTestimonialsMock(...args),
}));

import { LangContext } from "../../lib/lang";
import { ProPublicProfileSheet } from "../ProPublicProfileSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, fmt: (n) => String(n), proBadgeLabel: () => null };

const PRO_INFO = { name: "Pierre Pro", initials: "PP", avatarUrl: null, rating: 4.8, reviews: 12, badgeTier: null, isCertified: false, bio: "" };

function renderSheet(proId = "pro-1") {
  return render(
    <LangContext.Provider value={ctx}>
      <ProPublicProfileSheet proId={proId} onClose={vi.fn()} />
    </LangContext.Provider>
  );
}

beforeEach(() => {
  fetchPublicProInfoMock.mockReset().mockResolvedValue({ "pro-1": PRO_INFO });
  fetchPortfolioItemsMock.mockReset().mockResolvedValue([]);
  fetchReviewsForProMock.mockReset().mockResolvedValue([]);
  fetchTestimonialsMock.mockReset().mockResolvedValue([]);
});

describe("ProPublicProfileSheet — initial load", () => {
  it("renders the real profile once it loads successfully", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByText("Pierre Pro")).toBeTruthy());
  });

  it("shows a generic localized message and a real retry, never an infinite placeholder, when the load fails", async () => {
    fetchPublicProInfoMock.mockRejectedValue(new Error("relation \"pro_profiles\" does not exist"));
    renderSheet();

    await waitFor(() => expect(screen.getByText("catalogLoadFailed")).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByText("Pierre Pro")).toBeNull();

    fetchPublicProInfoMock.mockResolvedValueOnce({ "pro-1": PRO_INFO });
    fireEvent.click(screen.getByText("retryBtn"));

    await waitFor(() => expect(screen.getByText("Pierre Pro")).toBeTruthy());
  });

  it("still renders the real profile when portfolio/reviews/testimonials all fail, never an unhandled rejection", async () => {
    fetchPortfolioItemsMock.mockRejectedValue(new Error("network error"));
    fetchReviewsForProMock.mockRejectedValue(new Error("network error"));
    fetchTestimonialsMock.mockRejectedValue(new Error("network error"));

    renderSheet();

    await waitFor(() => expect(screen.getByText("Pierre Pro")).toBeTruthy());
    expect(screen.getByText("noReviewsYet")).toBeTruthy();
  });
});
