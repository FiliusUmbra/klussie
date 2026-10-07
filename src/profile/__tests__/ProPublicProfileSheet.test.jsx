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
const fetchPublicProServicesMock = vi.fn();
vi.mock("../../lib/pros", () => ({
  fetchPublicProInfo: (...args) => fetchPublicProInfoMock(...args),
  fetchReviewsForPro: (...args) => fetchReviewsForProMock(...args),
  fetchPublicProServices: (...args) => fetchPublicProServicesMock(...args),
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
const SERVICE_NAMES = { "svc-1": "Painting", "svc-2": "Small repairs" };
const ctx = { t, fmt: (n) => String(n), proBadgeLabel: () => null, serviceInfo: (id) => ({ name: SERVICE_NAMES[id] || "" }) };

const PRO_INFO = { name: "Pierre Pro", initials: "PP", avatarUrl: null, rating: 4.8, reviews: 12, badgeTier: null, isCertified: false, bio: "" };

function renderSheet(proId = "pro-1") {
  return render(
    <LangContext.Provider value={ctx}>
      <ProPublicProfileSheet proId={proId} onClose={vi.fn()} />
    </LangContext.Provider>
  );
}

beforeEach(() => {
  fetchPublicProServicesMock.mockReset().mockResolvedValue([]);
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

// Showcase: what the professional actually does, next to the rating and portfolio.
describe("ProPublicProfileSheet — services offered", () => {
  it("lists the services the professional offers, by their catalog names", async () => {
    fetchPublicProServicesMock.mockResolvedValue(["svc-1", "svc-2"]);
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("pro-services")).toBeTruthy());
    expect(screen.getByText("Painting")).toBeTruthy();
    expect(screen.getByText("Small repairs")).toBeTruthy();
    expect(screen.getByText("proOffersTitle")).toBeTruthy();
  });

  it("shows no heading at all when none are known (or the read is unavailable)", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByText("Pierre Pro")).toBeTruthy());
    expect(screen.queryByText("proOffersTitle")).toBeNull();
    expect(screen.queryByTestId("pro-services")).toBeNull();
  });

  it("skips a service the catalog can't name rather than rendering a blank chip", async () => {
    fetchPublicProServicesMock.mockResolvedValue(["svc-1", "svc-unknown"]);
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("pro-services")).toBeTruthy());
    expect(screen.getByTestId("pro-services").querySelectorAll("li")).toHaveLength(1);
  });
});

