// UNIFIED_PROFILE_DESIGN.md — Profile.jsx replaces CustomerProfile.jsx and
// ProProfile.jsx (this file replaces their own test files, one variant each, same
// scenarios and same assertions those files already established: the mobile-reachability
// fix for WorkspaceSwitcher/LanguageSwitcher, and the "become a pro" invitation).
import { describe, it, expect, vi } from "vitest";
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

import { LangContext } from "../../lib/lang";
import { Profile } from "../Profile.jsx";
import { updateProProfile } from "../../lib/pros";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t, fmt: (n) => String(n),
  catName: (c) => c, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  proBadgeLabel: () => null, CATS: [], BASE_SERVICES: [],
  langCode: "en", setLangCode: () => {}, LANGS: [{ code: "en", label: "English", locale: "en-GB" }],
};

function renderProfile(variant, workspaceMemberships, { proProfile = null, ...props } = {}) {
  useAuthMock.mockReturnValue({
    user: { id: "person-1", email: "cathy@example.test" },
    profile: { full_name: "Cathy Customer", avatar_url: null },
    proProfile,
    refreshProfile: vi.fn(),
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

function renderPro(workspaceMemberships) {
  return renderProfile("pro", workspaceMemberships, {
    proProfile: PRO_PROFILE,
    proInfo: PRO_INFO,
    completedCount: 0,
    earnedGross: 0,
    offeredServiceIds: [],
    onServicesChange: vi.fn(),
    onProfileSaved: vi.fn(),
    onPauseToggled: vi.fn(),
  });
}

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
});
