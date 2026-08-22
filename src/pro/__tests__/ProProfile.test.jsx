// A real, previously-unreachable-on-mobile gap, fixed: AppShell's own topbar (where
// WorkspaceSwitcher also renders) is display:none below 460px — every real phone — so a
// real pro (who always holds a personal workspace alongside their professional one) had
// no way to reach it on an actual device. Narrowly scoped to that new behaviour; this
// component has no prior test file, and its many other panels (portfolio, testimonials,
// boost, services) are a separate, larger undertaking to cover.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
import { ProProfile } from "../ProProfile.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
// langCode/setLangCode/LANGS: ProProfile also renders LanguageSwitcher now (the same
// mobile-reachability fix as WorkspaceSwitcher) — buildLangContext()'s own real shape.
const ctx = {
  t, fmt: (n) => String(n),
  catName: (c) => c, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  proBadgeLabel: () => null, CATS: [], BASE_SERVICES: [],
  langCode: "en", setLangCode: () => {}, LANGS: [{ code: "en", label: "English", locale: "en-GB" }],
};

const PRO_INFO = { name: "Pierre Pro", initials: "PP", avatarUrl: null, rating: 5, reviews: 1 };
const PRO_PROFILE = { bio: "", pro_type: "flexi", paused: false };

function renderProfile(workspaceMemberships) {
  useAuthMock.mockReturnValue({
    user: { id: "pro-1" },
    proProfile: PRO_PROFILE,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
    workspaceMemberships,
    activeWorkspace: { workspace_id: workspaceMemberships[0]?.workspace_id },
    setActiveWorkspaceId,
  });
  return render(
    <LangContext.Provider value={ctx}>
      <ProProfile
        proInfo={PRO_INFO}
        completedCount={0}
        earnedGross={0}
        offeredServiceIds={[]}
        onServicesChange={vi.fn()}
        onProfileSaved={vi.fn()}
        onPauseToggled={vi.fn()}
      />
    </LangContext.Provider>
  );
}

describe("ProProfile — workspace switching", () => {
  it("shows no switcher for a single-workspace person", () => {
    renderProfile([{ workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" }]);
    expect(screen.queryByText("workspaceSwitchLabel")).toBeNull();
  });

  it("shows a real switcher, reachable on mobile, for a real pro who also has a personal workspace", () => {
    renderProfile([
      { workspace_id: "ws-pro", workspace_name: "Pierre's Painting", workspace_type: "professional" },
      { workspace_id: "ws-personal", workspace_name: "My Home", workspace_type: "personal" },
    ]);
    expect(screen.getByText("workspaceSwitchLabel")).toBeTruthy();
    fireEvent.click(screen.getByText("My Home"));
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-personal");
  });
});
