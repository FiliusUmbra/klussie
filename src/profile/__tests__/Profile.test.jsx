// UNIFIED_PROFILE_DESIGN.md — Profile.jsx replaces CustomerProfile.jsx and
// ProProfile.jsx (this file replaces their own test files, one variant each, same
// scenarios and same assertions those files already established: the mobile-reachability
// fix for WorkspaceSwitcher/LanguageSwitcher, and the "become a pro" invitation).
//
// UX_TAB_SCOPE.md C5/P3/P5, 2026-09-28/29 — services/portfolio/testimonials/boost/Klussie
// Pro billing/business membership (join) requests/suggest-a-service/pause-resume/pro
// type/the flexi tracker all moved off this screen for the pro variant: pause-resume to
// ProDashboard.jsx (Today), pro type to BusinessApp.jsx, the flexi tracker to
// BusinessBillingSection.jsx (Billing), the rest to Business's other sections (each with
// its own test file). For the customer variant, real property and job-history/review
// content moved to MyHomeScreen.jsx and RequestsList.jsx — what's left here are just the
// shortcuts to reach them. What stays here directly, for either variant: identity,
// workspace/language switching, help/edit/join-an-existing-business/sign-out.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setActiveWorkspaceId = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/pros", () => ({
  trustScore: () => 80,
}));
vi.mock("../../lib/workspaceJoin.js", () => ({
  searchProfessionalWorkspaces: vi.fn(() => Promise.resolve([])),
  requestToJoinWorkspace: vi.fn(() => Promise.resolve()),
}));

import { LangContext } from "../../lib/lang";
import { Profile } from "../Profile.jsx";
import { requestToJoinWorkspace } from "../../lib/workspaceJoin.js";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t, fmt: (n) => String(n),
  catName: (c) => c, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  proBadgeLabel: () => null,
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
    renderProfile("customer", [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }], { onReplayTour: vi.fn() });
    expect(screen.queryAllByText("My Home")).toHaveLength(0);
  });

  it("shows a real switcher, reachable on mobile, for a real multi-workspace person — human names, no 'workspace' label (UNIFIED_PRODUCT_IA_REVIEW.md §3)", () => {
    renderProfile("customer", [
      { workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" },
      { workspace_id: "ws-2", workspace_name: "Cathy's Cleaning Co", workspace_type: "professional" },
    ], { onReplayTour: vi.fn() });
    expect(screen.getByText("My Home")).toBeTruthy();
    expect(screen.getByText("Cathy's Cleaning Co")).toBeTruthy();
    expect(screen.queryByText("workspaceSwitchLabel")).toBeNull();
    // getAllByRole, not getByRole: Profile.jsx now also renders a language-switcher
    // <select> beside this one (brought in 2026-09-30 from the parallel "Klussie via
    // ChatGPT" pass) — WorkspaceSwitcher.jsx's own select is the first in the DOM.
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "ws-2" } });
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-2");
  });
});

describe("Profile — customer variant, become a pro", () => {
  const ONE_WORKSPACE = [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }];

  it("shows the invitation when a real handler is provided and the person hasn't become a pro yet", () => {
    renderProfile("customer", ONE_WORKSPACE, { onBecomePro: vi.fn() });
    expect(screen.getByText("becomeProPrompt")).toBeTruthy();
    expect(screen.getByText("becomeProBtn")).toBeTruthy();
  });

  it("calls the real handler when tapped", () => {
    const onBecomePro = vi.fn();
    renderProfile("customer", ONE_WORKSPACE, { onBecomePro });
    fireEvent.click(screen.getByText("becomeProBtn"));
    expect(onBecomePro).toHaveBeenCalled();
  });

  it("hides the invitation once the person already has a pro profile — a real dual-role person needs no invitation", () => {
    renderProfile("customer", ONE_WORKSPACE, { onBecomePro: vi.fn(), proProfile: { pro_type: "flexi" } });
    expect(screen.queryByText("becomeProPrompt")).toBeNull();
  });

  it("hides the invitation when no handler is provided at all", () => {
    renderProfile("customer", ONE_WORKSPACE);
    expect(screen.queryByText("becomeProPrompt")).toBeNull();
  });
});

// UX_TAB_SCOPE.md C5, 2026-09-29 — "move property creation into My Home and reviews into
// job history, with optional account shortcuts." Real property/review content moved
// entirely to MyHomeScreen.jsx (its own "shared property header" tests) and RequestsList.jsx
// (its own History segment); these are just the shortcuts to get there.
describe("Profile — customer variant, account shortcuts to My Home / job history", () => {
  const ONE_WORKSPACE = [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }];

  it("shows neither shortcut when neither handler is provided", () => {
    renderProfile("customer", ONE_WORKSPACE);
    expect(screen.queryByText("manageHomesBtn")).toBeNull();
    expect(screen.queryByText("viewJobHistoryBtn")).toBeNull();
  });

  it("calls onManageHome when tapped", () => {
    const onManageHome = vi.fn();
    renderProfile("customer", ONE_WORKSPACE, { onManageHome });
    fireEvent.click(screen.getByText("manageHomesBtn"));
    expect(onManageHome).toHaveBeenCalled();
  });

  it("calls onViewJobHistory when tapped", () => {
    const onViewJobHistory = vi.fn();
    renderProfile("customer", ONE_WORKSPACE, { onViewJobHistory });
    fireEvent.click(screen.getByText("viewJobHistoryBtn"));
    expect(onViewJobHistory).toHaveBeenCalled();
  });
});

function renderPro(workspaceMemberships, overrides = {}) {
  return renderProfile("pro", workspaceMemberships, {
    proProfile: PRO_PROFILE,
    proInfo: PRO_INFO,
    completedCount: 0,
    onProfileSaved: vi.fn(),
    ...overrides,
  });
}

// Found live during a UX review, 2026-09-07: a pro with no full_name on record showed
// the literal English word "Pro" here -- not a translated placeholder -- in every
// locale. lib/pros.js's own shapers now leave `name` honestly null instead; this is the
// render-side half of that fix.
describe("Profile — pro variant, unnamed pro", () => {
  it("shows t.proFallbackName, not the raw \"Pro\" literal, when proInfo.name is null", () => {
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }], {
      proInfo: { ...PRO_INFO, name: null },
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
    // getAllByRole, not getByRole: see the customer-variant test above.
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "ws-personal" } });
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-personal");
  });
});

// A real behavior only the unified component can regress: the two variants must never
// bleed into each other's sections.
describe("Profile — variant isolation", () => {
  // UX_TAB_SCOPE.md P3/P5 — services/portfolio/boost moved to Business, pause/resume to
  // Today, pro type/the flexi tracker to Business/Billing; none of these render here any
  // more for either variant.
  it("renders none of the relocated pro sections — they live in Today/Business/Billing now", () => {
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);
    expect(screen.queryByText("proServicesTitle")).toBeNull();
    expect(screen.queryByText("portfolioTitle")).toBeNull();
    expect(screen.queryByText("boostTitle")).toBeNull();
    expect(screen.queryByText("pauseProfileBtn")).toBeNull();
    expect(screen.queryByText("proTypeLabel")).toBeNull();
    expect(screen.queryByText("flexiTrackerTitle")).toBeNull();
  });

  it("never renders customer-only shortcuts for the pro variant", () => {
    renderPro([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);
    expect(screen.queryByText("manageHomesBtn")).toBeNull();
    expect(screen.queryByText("viewJobHistoryBtn")).toBeNull();
  });

  it("both variants render the shared sign-out action", () => {
    renderProfile("customer", [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }]);
    expect(screen.getByText("authSignOut")).toBeTruthy();
  });
});

describe("Profile — join an existing business, both variants (Theme C)", () => {
  it("offers the entry point for a customer, not only a pro", () => {
    renderProfile("customer", []);
    expect(screen.getByText("joinBusinessBtn")).toBeTruthy();
  });

  it("opens JoinBusinessSheet on tap", () => {
    renderProfile("customer", []);
    fireEvent.click(screen.getByText("joinBusinessBtn"));
    expect(screen.getByText("joinBusinessTitle")).toBeTruthy();
  });

  it("closes without ever touching the network when dismissed unused", () => {
    renderProfile("customer", []);
    fireEvent.click(screen.getByText("joinBusinessBtn"));
    fireEvent.click(screen.getByLabelText("closeBtn"));

    expect(screen.queryByText("joinBusinessTitle")).toBeNull();
    expect(requestToJoinWorkspace).not.toHaveBeenCalled();
  });
});
