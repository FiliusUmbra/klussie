// UNIFIED_PROFILE_DESIGN.md — Profile.jsx replaces CustomerProfile.jsx and
// ProProfile.jsx (this file replaces their own test files, one variant each, same
// scenarios and same assertions those files already established: the mobile-reachability
// fix for WorkspaceSwitcher/LanguageSwitcher, and the "become a pro" invitation).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const setActiveWorkspaceId = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/pros", () => ({
  updateProServices: vi.fn(), updateProProfile: vi.fn(), boostProfile: vi.fn(),
  trustScore: () => 80,
}));
vi.mock("../../lib/portfolio", () => ({
  uploadPortfolioImage: vi.fn(), addPortfolioItem: vi.fn(),
  fetchPortfolioItems: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../lib/testimonials", () => ({
  fetchTestimonials: vi.fn(() => Promise.resolve([])), deleteTestimonial: vi.fn(),
}));
vi.mock("../../lib/workspaceJoin.js", () => ({
  fetchJoinRequests: vi.fn(() => Promise.resolve([])),
  decideJoinRequest: vi.fn(() => Promise.resolve()),
  searchProfessionalWorkspaces: vi.fn(() => Promise.resolve([])),
  requestToJoinWorkspace: vi.fn(() => Promise.resolve()),
}));

import { LangContext } from "../../lib/lang";
import { Profile } from "../Profile.jsx";
import { updateProProfile, updateProServices, boostProfile } from "../../lib/pros";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems } from "../../lib/portfolio";
import { deleteTestimonial, fetchTestimonials } from "../../lib/testimonials";
import { fetchJoinRequests, decideJoinRequest, requestToJoinWorkspace } from "../../lib/workspaceJoin.js";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t, fmt: (n) => String(n),
  catName: (c) => c, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  proBadgeLabel: () => null, CATS: [], BASE_SERVICES: [],
  langCode: "en", setLangCode: () => {}, LANGS: [{ code: "en", label: "English", locale: "en-GB" }],
};

function renderProfile(variant, workspaceMemberships, { proProfile = null, refreshProfile = vi.fn(), ...props } = {}) {
  useAuthMock.mockReturnValue({
    user: { id: "person-1", email: "cathy@example.test" },
    profile: { full_name: "Cathy Customer", avatar_url: null },
    proProfile,
    refreshProfile,
    signOut: vi.fn(),
    workspaceMemberships,
    activeWorkspace: { workspace_id: workspaceMemberships[0]?.workspace_id },
    setActiveWorkspaceId,
  });
  return render(
    <LangContext.Provider value={ctx}>
      <Profile variant={variant} {...props} />
    </LangContext.Provider>
  );
}

const PRO_INFO = { name: "Pierre Pro", initials: "PP", avatarUrl: null, rating: 5, reviews: 1 };
const PRO_PROFILE = { bio: "", pro_type: "flexi", paused: false };

describe("Profile — customer variant, workspace switching", () => {
  it("shows no switcher for a single-workspace person — invisible, not merely empty (§27)", () => {
    renderProfile("customer", [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }], { requests: [], onReplayTour: vi.fn() });
    expect(screen.queryAllByText("My Home")).toHaveLength(0);
  });

  it("shows a real switcher, reachable on mobile, for a real multi-workspace person — human names, no 'workspace' label (UNIFIED_PRODUCT_IA_REVIEW.md §3)", () => {
    renderProfile("customer", [
      { workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" },
      { workspace_id: "ws-2", workspace_name: "Cathy's Cleaning Co", workspace_type: "professional" },
    ], { requests: [], onReplayTour: vi.fn() });
    expect(screen.getByText("My Home")).toBeTruthy();
    expect(screen.getByText("Cathy's Cleaning Co")).toBeTruthy();
    expect(screen.queryByText("workspaceSwitchLabel")).toBeNull();
    fireEvent.click(screen.getByText("Cathy's Cleaning Co"));
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-2");
  });
});

describe("Profile — customer variant, become a pro", () => {
  const ONE_WORKSPACE = [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }];

  it("shows the invitation when a real handler is provided and the person hasn't become a pro yet", () => {
    renderProfile("customer", ONE_WORKSPACE, { requests: [], onBecomePro: vi.fn() });
    expect(screen.getByText("becomeProPrompt")).toBeTruthy();
    expect(screen.getByText("becomeProBtn")).toBeTruthy();
  });

  it("calls the real handler when tapped", () => {
    const onBecomePro = vi.fn();
    renderProfile("customer", ONE_WORKSPACE, { requests: [], onBecomePro });
    fireEvent.click(screen.getByText("becomeProBtn"));
    expect(onBecomePro).toHaveBeenCalled();
  });

  it("hides the invitation once the person already has a pro profile — a real dual-role person needs no invitation", () => {
    renderProfile("customer", ONE_WORKSPACE, { requests: [], onBecomePro: vi.fn(), proProfile: { pro_type: "flexi" } });
    expect(screen.queryByText("becomeProPrompt")).toBeNull();
  });

  it("hides the invitation when no handler is provided at all", () => {
    renderProfile("customer", ONE_WORKSPACE, { requests: [] });
    expect(screen.queryByText("becomeProPrompt")).toBeNull();
  });
});

function renderPro(workspaceMemberships, overrides = {}) {
  return renderProfile("pro", workspaceMemberships, {
    proProfile: PRO_PROFILE,
    proInfo: PRO_INFO,
    completedCount: 0,
    earnedGross: 0,
    offeredServiceIds: [],
    onServicesChange: vi.fn(),
    onProfileSaved: vi.fn(),
    onPauseToggled: vi.fn(),
    ...overrides,
  });
}

// Found live during a UX review, 2026-09-07: a pro with no full_name on record showed
// the literal English word "Pro" here -- not a translated placeholder -- in every
// locale. lib/pros.js's own shapers now leave `name` honestly null instead; this is the
// render-side half of that fix.
describe("Profile — pro variant, unnamed pro", () => {
  it("shows t.proFallbackName, not the raw \"Pro\" literal, when proInfo.name is null", () => {
    renderProfile("pro", [{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }], {
      proProfile: PRO_PROFILE,
      proInfo: { ...PRO_INFO, name: null },
      completedCount: 0, earnedGross: 0, offeredServiceIds: [],
      onServicesChange: vi.fn(), onProfileSaved: vi.fn(), onPauseToggled: vi.fn(),
    });
    expect(screen.getByText("proFallbackName")).toBeTruthy();
    expect(screen.queryByText("Pro")).toBeNull();
  });
});

describe("Profile — pro variant, workspace switching", () => {
  it("shows no switcher for a single-workspace person", () => {
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);
    expect(screen.queryAllByText("Pierre's Painting")).toHaveLength(0);
  });

  it("shows a real switcher, reachable on mobile, for a real pro who also has a personal workspace — human names, no 'workspace' label (UNIFIED_PRODUCT_IA_REVIEW.md §3)", () => {
    renderPro([
      { workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" },
      { workspace_id: "ws-personal", workspace_name: "My Home", workspace_type: "personal" },
    ]);
    expect(screen.getByText("Pierre's Painting")).toBeTruthy();
    expect(screen.getByText("My Home")).toBeTruthy();
    expect(screen.queryByText("workspaceSwitchLabel")).toBeNull();
    fireEvent.click(screen.getByText("My Home"));
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-personal");
  });
});

// A real behavior only the unified component can regress: the two variants must never
// bleed into each other's sections.
describe("Profile — variant isolation", () => {
  it("never renders pro-only sections (services/portfolio/boost) for the customer variant", () => {
    renderProfile("customer", [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }], { requests: [] });
    expect(screen.queryByText("proServicesTitle")).toBeNull();
    expect(screen.queryByText("portfolioTitle")).toBeNull();
    expect(screen.queryByText("boostTitle")).toBeNull();
  });

  it("never renders customer-only sections (reviews) for the pro variant", () => {
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);
    expect(screen.queryByText("yourReviews")).toBeNull();
  });

  it("both variants render the shared sign-out action", () => {
    renderProfile("customer", [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }], { requests: [] });
    expect(screen.getByText("authSignOut")).toBeTruthy();
  });
});

// Found live during a UX review, 2026-09-06: switching to "Registered business" failed
// silently whenever business_name/vat_number were still unset (public.pro_profiles' own
// business_requires_details check constraint) -- no error, no explanation, the button
// simply appeared to do nothing.
describe("Profile — pro variant, switching pro type", () => {
  it("shows a plain-language message, not the raw constraint name, when the business switch is refused for missing details", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockRejectedValueOnce(
      Object.assign(new Error('new row for relation "pro_profiles" violates check constraint "business_requires_details"'), { code: "23514" })
    );
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(screen.getByText("proTypeBusinessRequiresDetails")).toBeTruthy());
    expect(screen.queryByText(/business_requires_details/)).toBeNull();
  });

  it("shows a generic message, never the raw error, for any other failure", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockRejectedValueOnce(new Error("network hiccup"));
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(screen.getByText("proTypeSwitchFailed")).toBeTruthy());
    expect(screen.queryByText("network hiccup")).toBeNull();
  });

  it("shows no error at all when the switch succeeds", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { pro_type: "business" }));
    expect(screen.queryByText("proTypeBusinessRequiresDetails")).toBeNull();
    expect(screen.queryByText("proTypeSwitchFailed")).toBeNull();
  });

  // Found by code audit, 2026-09-11: refreshProfile() used to sit inside the same try
  // as the real write, the same bug shape fixed repeatedly elsewhere today (see e.g.
  // ProApp.jsx's sendQuote() for the fullest write-up). A refresh-only failure right
  // after a genuinely successful switch showed proTypeSwitchFailed for a switch that
  // had actually gone through.
  it("shows no error at all when the switch succeeds but the post-switch refreshProfile() fails", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    const refreshProfile = vi.fn(() => Promise.reject(new Error("network blip refreshing the profile")));
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }], { refreshProfile });

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { pro_type: "business" }));
    expect(screen.queryByText("proTypeBusinessRequiresDetails")).toBeNull();
    expect(screen.queryByText("proTypeSwitchFailed")).toBeNull();
  });
});

// Found by code audit: five pro-only actions in this file had no real error handling —
// some no catch at all, one (saveServices) not even a finally, so a real refusal left
// its own busy flag stuck true forever (the exact "no dead end" shape this codebase has
// already found and fixed repeatedly elsewhere — PortfolioItemSheet.jsx's own identical
// gap, ServiceRecordSummary.jsx's own identical gap — just not yet swept in this file).
const PRO_WORKSPACES = [{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }];

describe("Profile — pro variant, saveServices", () => {
  it("re-enables the button rather than leaving it stuck, and shows a real error, when saving fails", async () => {
    updateProServices.mockReset();
    updateProServices.mockRejectedValueOnce(new Error("insufficient_privilege"));
    renderPro(PRO_WORKSPACES);

    fireEvent.click(screen.getByText("saveServicesBtn"));

    await waitFor(() => expect(screen.getByText("saveServicesFailed")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    expect(screen.getByText("saveServicesBtn").closest("button").disabled).toBe(false);
  });

  it("shows no error at all when saving succeeds", async () => {
    updateProServices.mockReset();
    updateProServices.mockResolvedValueOnce(undefined);
    renderPro(PRO_WORKSPACES);

    fireEvent.click(screen.getByText("saveServicesBtn"));

    await waitFor(() => expect(updateProServices).toHaveBeenCalled());
    expect(screen.queryByText("saveServicesFailed")).toBeNull();
  });

  // Found live during a UX review, 2026-09-11: this call site never passed a workspace id
  // at all, so every row updateProServices() wrote was invisible the instant
  // fetchProServices() had a real workspace to filter by (ProApp.jsx's refreshServices,
  // always, for any pro actually using the app) -- the selection silently reverted to
  // empty on the very next load. Guards the wiring, not updateProServices()'s own
  // behaviour (see pros.test.js for that half).
  it("passes the active workspace id, not just the person and selection, to updateProServices", async () => {
    updateProServices.mockReset();
    updateProServices.mockResolvedValueOnce(undefined);
    renderPro(PRO_WORKSPACES);

    fireEvent.click(screen.getByText("saveServicesBtn"));

    await waitFor(() => expect(updateProServices).toHaveBeenCalledWith("person-1", [], "ws-pro"));
  });
});

describe("Profile — pro variant, portfolio upload", () => {
  it("shows a real error, never the raw backend message, when the upload fails", async () => {
    uploadPortfolioImage.mockReset();
    uploadPortfolioImage.mockRejectedValueOnce(new Error("storage quota exceeded"));
    renderPro(PRO_WORKSPACES);

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
    renderPro(PRO_WORKSPACES);

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => expect(addPortfolioItem).toHaveBeenCalled());
    expect(screen.queryByText("portfolioUploadFailed")).toBeNull();
  });

  // Found by code audit, 2026-09-11: refreshPortfolio() used to sit inside the same try
  // as the real writes — a refresh-only failure right after a genuinely successful
  // upload+addPortfolioItem() showed portfolioUploadFailed for an upload that had
  // actually gone through.
  it("shows no error at all when the upload succeeds but the post-upload refreshPortfolio() fails", async () => {
    uploadPortfolioImage.mockReset();
    uploadPortfolioImage.mockResolvedValueOnce({ url: "https://example.test/p.jpg", path: "pro-1/p" });
    addPortfolioItem.mockReset();
    addPortfolioItem.mockResolvedValueOnce({});
    fetchPortfolioItems.mockReset();
    fetchPortfolioItems.mockResolvedValueOnce([]); // initial load
    renderPro(PRO_WORKSPACES);
    await waitFor(() => expect(fetchPortfolioItems).toHaveBeenCalledTimes(1));
    fetchPortfolioItems.mockRejectedValueOnce(new Error("network blip refreshing the portfolio grid"));

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => expect(addPortfolioItem).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector(".portfolio-add").disabled).toBe(false));
    expect(screen.queryByText("portfolioUploadFailed")).toBeNull();
  });
});

// Found by code audit: fetchPortfolioItems()/fetchTestimonials() both throw on a real
// Postgres error, and the initial-load effect had no catch of its own — a genuine
// unhandled promise rejection on every failure. Harmless for what actually renders
// ("(portfolioItems || []).map(...)" already falls back to an empty list), but a real
// defect regardless, the same shape RequestPhotosStrip.jsx had and was fixed the same way.
describe("Profile — pro variant, portfolio/testimonials initial load failure", () => {
  it("degrades to the real empty states, never an unhandled rejection, when both fetches fail", async () => {
    fetchPortfolioItems.mockReset();
    fetchPortfolioItems.mockRejectedValueOnce(new Error("relation \"portfolio_items\" does not exist"));
    fetchTestimonials.mockReset();
    fetchTestimonials.mockRejectedValueOnce(new Error("relation \"testimonials\" does not exist"));

    renderPro(PRO_WORKSPACES);

    await waitFor(() => expect(screen.getByText("noPortfolioYet")).toBeTruthy());
    expect(screen.getByText("noTestimonialsYet")).toBeTruthy();
    expect(screen.queryByText(/does not exist/)).toBeNull();
  });
});

describe("Profile — pro variant, removing a testimonial", () => {
  function renderProWithTestimonial() {
    fetchTestimonials.mockReset();
    fetchTestimonials.mockResolvedValue([{ id: "tst-1", client_name: "Cathy", quote_text: "Great work!" }]);
    return renderPro(PRO_WORKSPACES);
  }

  it("shows a real error and keeps the confirm modal open, re-enabling both buttons, when deletion fails", async () => {
    deleteTestimonial.mockReset();
    deleteTestimonial.mockRejectedValueOnce(new Error("network error"));
    renderProWithTestimonial();

    await screen.findByText("Cathy");
    fireEvent.click(screen.getByText("deleteBtn"));
    fireEvent.click(screen.getAllByText("deleteBtn")[1]);

    await waitFor(() => expect(screen.getByText("testimonialDeleteFailed")).toBeTruthy());
    expect(screen.queryByText("network error")).toBeNull();
    // Still open — Cancel is still there to click.
    expect(screen.getByText("cancelBtn")).toBeTruthy();
  });

  it("deletes and closes the modal on success", async () => {
    deleteTestimonial.mockReset();
    deleteTestimonial.mockResolvedValueOnce(undefined);
    renderProWithTestimonial();

    await screen.findByText("Cathy");
    fireEvent.click(screen.getByText("deleteBtn"));
    fireEvent.click(screen.getAllByText("deleteBtn")[1]);

    await waitFor(() => expect(deleteTestimonial).toHaveBeenCalledWith("tst-1"));
    await waitFor(() => expect(screen.queryByText("cancelBtn")).toBeNull());
  });

  // Found by code audit, 2026-09-11: refreshTestimonials() used to sit inside the same
  // try as deleteTestimonial() itself, with the modal-closing
  // setConfirmDeleteTestimonialId(null) gated behind it succeeding too — so a
  // refresh-only failure right after a genuinely successful deletion both showed
  // testimonialDeleteFailed AND kept the confirm modal open on a testimonial that no
  // longer existed.
  it("closes the modal with no error even when deletion succeeds but the post-delete refreshTestimonials() fails", async () => {
    deleteTestimonial.mockReset();
    deleteTestimonial.mockResolvedValueOnce(undefined);
    renderProWithTestimonial();
    await screen.findByText("Cathy");
    fetchTestimonials.mockRejectedValueOnce(new Error("network blip refreshing testimonials"));

    fireEvent.click(screen.getByText("deleteBtn"));
    fireEvent.click(screen.getAllByText("deleteBtn")[1]);

    await waitFor(() => expect(deleteTestimonial).toHaveBeenCalledWith("tst-1"));
    await waitFor(() => expect(screen.queryByText("cancelBtn")).toBeNull());
    expect(screen.queryByText("testimonialDeleteFailed")).toBeNull();
  });
});

describe("Profile — pro variant, boost", () => {
  it("re-enables the button and shows a real error when Boost fails to start", async () => {
    boostProfile.mockReset();
    boostProfile.mockRejectedValueOnce(new Error("payment required"));
    renderPro(PRO_WORKSPACES);

    fireEvent.click(screen.getByText(/boostBtn/));

    await waitFor(() => expect(screen.getByText("boostFailed")).toBeTruthy());
    expect(screen.queryByText("payment required")).toBeNull();
    expect(screen.getByText(/boostBtn/).closest("button").disabled).toBe(false);
  });

  // Found by code audit, 2026-09-11: refreshProfile() used to sit inside the same try
  // as boostProfile() itself — a real refusal here mattered more than most instances of
  // this bug class fixed today, since Boost is a genuine paid action
  // (€{BOOST_WEEKLY_PRICE}/week): a false boostFailed for a purchase that had actually
  // gone through could invite a pro to tap Boost again, risking a second charge for the
  // same week.
  it("re-enables the button with no error when Boost succeeds but the post-boost refreshProfile() fails", async () => {
    boostProfile.mockReset();
    boostProfile.mockResolvedValueOnce(undefined);
    const refreshProfile = vi.fn(() => Promise.reject(new Error("network blip refreshing the profile")));
    renderPro(PRO_WORKSPACES, { refreshProfile });

    fireEvent.click(screen.getByText(/boostBtn/));

    await waitFor(() => expect(boostProfile).toHaveBeenCalledWith("person-1"));
    await waitFor(() => expect(screen.getByText(/boostBtn/).closest("button").disabled).toBe(false));
    expect(screen.queryByText("boostFailed")).toBeNull();
  });
});

describe("Profile — pro variant, pause/resume", () => {
  it("re-enables the button and shows a real error when the toggle fails", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockRejectedValueOnce(new Error("network error"));
    renderPro(PRO_WORKSPACES);

    fireEvent.click(screen.getByText("pauseProfileBtn"));

    await waitFor(() => expect(screen.getByText("togglePausedFailed")).toBeTruthy());
    expect(screen.queryByText("network error")).toBeNull();
    expect(screen.getByText("pauseProfileBtn").closest("button").disabled).toBe(false);
  });

  it("shows no error and calls onPauseToggled on success", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    renderPro(PRO_WORKSPACES);

    fireEvent.click(screen.getByText("pauseProfileBtn"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { paused: true }));
    expect(screen.queryByText("togglePausedFailed")).toBeNull();
  });

  // Found by code audit, 2026-09-11: refreshProfile() and onPauseToggled() both used to
  // sit inside the same try as updateProProfile() itself. Worse than most instances of
  // this bug class: togglePaused() is a TOGGLE, not an idempotent write — a pro who saw
  // the false togglePausedFailed and, believing their first tap never took effect,
  // tapped Pause again would flip the real, already-applied change straight back,
  // silently leaving them un-paused (still receiving new leads) while believing the
  // opposite.
  it("re-enables the button with no error when the toggle succeeds but the post-toggle refreshProfile() fails", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    const refreshProfile = vi.fn(() => Promise.reject(new Error("network blip refreshing the profile")));
    renderPro(PRO_WORKSPACES, { refreshProfile });

    fireEvent.click(screen.getByText("pauseProfileBtn"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { paused: true }));
    await waitFor(() => expect(screen.getByText("pauseProfileBtn").closest("button").disabled).toBe(false));
    expect(screen.queryByText("togglePausedFailed")).toBeNull();
  });

  it("re-enables the button with no error when the toggle succeeds but onPauseToggled() itself fails", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    const onPauseToggled = vi.fn(() => Promise.reject(new Error("network blip refreshing the lead list")));
    renderPro(PRO_WORKSPACES, { onPauseToggled });

    fireEvent.click(screen.getByText("pauseProfileBtn"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { paused: true }));
    await waitFor(() => expect(screen.getByText("pauseProfileBtn").closest("button").disabled).toBe(false));
    expect(screen.queryByText("togglePausedFailed")).toBeNull();
  });
});

// Pro Workspace remarks, 2026-09-12 (Theme C) — the write side of ADR-0027's own
// membership.join.approve (migration 0220), reachable from Profile.jsx for the first
// time. "Join an existing business" is offered regardless of variant (JoinBusinessSheet
// itself has its own test file); this file only covers the pro-variant approval queue.
describe("Profile — pro variant, join requests (Theme C)", () => {
  const REQUEST = { request_id: "req-1", person_ref: "person-2", full_name: "Otto External", avatar_url: null, message: "I used to work with you.", requested_at: "2026-09-12T10:00:00Z" };

  beforeEach(() => {
    vi.mocked(fetchJoinRequests).mockReset();
    vi.mocked(decideJoinRequest).mockReset().mockResolvedValue(undefined);
  });

  it("shows nothing at all while there are no pending requests -- no empty-state row", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([]);
    renderPro(PRO_WORKSPACES);

    await waitFor(() => expect(fetchJoinRequests).toHaveBeenCalledWith("ws-pro"));
    expect(screen.queryByText("joinRequestsTitle")).toBeNull();
  });

  it("lists a real pending request with its requester's own name and message", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST]);
    renderPro(PRO_WORKSPACES);

    await waitFor(() => expect(screen.getByText("joinRequestsTitle")).toBeTruthy());
    expect(screen.getByText("Otto External")).toBeTruthy();
    expect(screen.getByText('"I used to work with you."')).toBeTruthy();
  });

  it("approving calls decideJoinRequest with 'approved' and refreshes the list off the screen", async () => {
    vi.mocked(fetchJoinRequests).mockImplementation(() =>
      Promise.resolve(decideJoinRequest.mock.calls.length > 0 ? [] : [REQUEST])
    );
    renderPro(PRO_WORKSPACES);
    await waitFor(() => expect(screen.getByText("joinRequestApproveBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("joinRequestApproveBtn"));

    await waitFor(() => expect(decideJoinRequest).toHaveBeenCalledWith("req-1", "approved", "person-1"));
    await waitFor(() => expect(screen.queryByText("joinRequestsTitle")).toBeNull());
  });

  it("declining calls decideJoinRequest with 'declined'", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST]);
    renderPro(PRO_WORKSPACES);
    await waitFor(() => expect(screen.getByText("joinRequestDeclineBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("joinRequestDeclineBtn"));

    await waitFor(() => expect(decideJoinRequest).toHaveBeenCalledWith("req-1", "declined", "person-1"));
  });

  // Found by code audit (the same shape fixed repeatedly elsewhere in this file): a
  // decision failure must show a real error and leave the request re-actionable, never a
  // permanently disabled button.
  it("shows a generic localized error and re-enables both buttons when a decision fails", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST]);
    vi.mocked(decideJoinRequest).mockReset().mockRejectedValue(new Error("network error"));
    renderPro(PRO_WORKSPACES);
    await waitFor(() => expect(screen.getByText("joinRequestApproveBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("joinRequestApproveBtn"));

    await waitFor(() => expect(screen.getByText("joinRequestDecideFailed")).toBeTruthy());
    expect(screen.getByText("joinRequestApproveBtn").closest("button").disabled).toBe(false);
  });

  it("a failed fetch (including a real permission refusal) shows nothing, never an error banner", async () => {
    vi.mocked(fetchJoinRequests).mockRejectedValue(new Error("workspace.list_join_requests_for_caller: caller may not view join requests"));
    renderPro(PRO_WORKSPACES);

    await waitFor(() => expect(fetchJoinRequests).toHaveBeenCalled());
    expect(screen.queryByText("joinRequestsTitle")).toBeNull();
    expect(screen.queryByText(/may not view join requests/)).toBeNull();
  });

  it("two independently pending requests can be decided independently -- one busy never disables the other", async () => {
    const requestB = { ...REQUEST, request_id: "req-2", full_name: "Sparse", message: null };
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST, requestB]);
    let resolveDecision;
    vi.mocked(decideJoinRequest).mockReset().mockReturnValue(new Promise((resolve) => { resolveDecision = resolve; }));
    renderPro(PRO_WORKSPACES);
    await waitFor(() => expect(screen.getAllByText("joinRequestApproveBtn").length).toBe(2));

    fireEvent.click(screen.getAllByText("joinRequestApproveBtn")[0]);

    await waitFor(() => expect(screen.getAllByText("joinRequestApproveBtn")[0].closest("button").disabled).toBe(true));
    expect(screen.getAllByText("joinRequestApproveBtn")[1].closest("button").disabled).toBe(false);
    resolveDecision();
  });
});

describe("Profile — join an existing business, both variants (Theme C)", () => {
  it("offers the entry point for a customer, not only a pro", () => {
    renderProfile("customer", [], { requests: [] });
    expect(screen.getByText("joinBusinessBtn")).toBeTruthy();
  });

  it("opens JoinBusinessSheet on tap", () => {
    renderProfile("customer", [], { requests: [] });
    fireEvent.click(screen.getByText("joinBusinessBtn"));
    expect(screen.getByText("joinBusinessTitle")).toBeTruthy();
  });

  it("closes without ever touching the network when dismissed unused", () => {
    renderProfile("customer", [], { requests: [] });
    fireEvent.click(screen.getByText("joinBusinessBtn"));
    fireEvent.click(screen.getByLabelText("closeBtn"));

    expect(screen.queryByText("joinBusinessTitle")).toBeNull();
    expect(requestToJoinWorkspace).not.toHaveBeenCalled();
  });
});
