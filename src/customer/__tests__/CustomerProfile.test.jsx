// A real, previously-unreachable-on-mobile gap, fixed: AppShell's own topbar (where
// WorkspaceSwitcher also renders) is display:none below 460px — every real phone — so a
// real customer who is also a pro had no way to reach their second workspace on an actual
// device. Narrowly scoped to that new behaviour; this component has no prior test file.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setActiveWorkspaceId = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));

import { LangContext } from "../../lib/lang";
import { CustomerProfile } from "../CustomerProfile.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
// langCode/setLangCode/LANGS: CustomerProfile also renders LanguageSwitcher now (the same
// mobile-reachability fix as WorkspaceSwitcher) — buildLangContext()'s own real shape.
const ctx = {
  t, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  langCode: "en", setLangCode: () => {}, LANGS: [{ code: "en", label: "English", locale: "en-GB" }],
};

function renderProfile(workspaceMemberships, { proProfile = null, ...props } = {}) {
  useAuthMock.mockReturnValue({
    user: { id: "customer-1", email: "cathy@example.test" },
    profile: { full_name: "Cathy Customer", avatar_url: null },
    proProfile,
    signOut: vi.fn(),
    workspaceMemberships,
    activeWorkspace: { workspace_id: workspaceMemberships[0]?.workspace_id },
    setActiveWorkspaceId,
  });
  return render(
    <LangContext.Provider value={ctx}>
      <CustomerProfile requests={[]} onReplayTour={vi.fn()} {...props} />
    </LangContext.Provider>
  );
}

describe("CustomerProfile — workspace switching", () => {
  it("shows no switcher for a single-workspace person — invisible, not merely empty (§27)", () => {
    renderProfile([{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }]);
    expect(screen.queryByText("workspaceSwitchLabel")).toBeNull();
  });

  it("shows a real switcher, reachable on mobile, for a real multi-workspace person", () => {
    renderProfile([
      { workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" },
      { workspace_id: "ws-2", workspace_name: "Cathy's Cleaning Co", workspace_type: "professional" },
    ]);
    expect(screen.getByText("workspaceSwitchLabel")).toBeTruthy();
    fireEvent.click(screen.getByText("Cathy's Cleaning Co"));
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-2");
  });
});

// UNIFIED_PRODUCT_IA_REVIEW.md §5 — becoming a pro had the identical mobile-
// unreachability gap, one level earlier: BecomeProSheet's only trigger lived behind the
// same topbar-only control. This is the real, reachable entry point, fixed the same way.
describe("CustomerProfile — become a pro", () => {
  const ONE_WORKSPACE = [{ workspace_id: "ws-1", workspace_name: "My Home", workspace_type: "personal" }];

  it("shows the invitation when a real handler is provided and the person hasn't become a pro yet", () => {
    renderProfile(ONE_WORKSPACE, { onBecomePro: vi.fn() });
    expect(screen.getByText("becomeProPrompt")).toBeTruthy();
    expect(screen.getByText("becomeProBtn")).toBeTruthy();
  });

  it("calls the real handler when tapped", () => {
    const onBecomePro = vi.fn();
    renderProfile(ONE_WORKSPACE, { onBecomePro });
    fireEvent.click(screen.getByText("becomeProBtn"));
    expect(onBecomePro).toHaveBeenCalled();
  });

  it("hides the invitation once the person already has a pro profile — a real dual-role person needs no invitation", () => {
    renderProfile(ONE_WORKSPACE, { onBecomePro: vi.fn(), proProfile: { pro_type: "flexi" } });
    expect(screen.queryByText("becomeProPrompt")).toBeNull();
  });

  it("hides the invitation when no handler is provided at all", () => {
    renderProfile(ONE_WORKSPACE);
    expect(screen.queryByText("becomeProPrompt")).toBeNull();
  });
});
