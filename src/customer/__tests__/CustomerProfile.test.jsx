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

function renderProfile(workspaceMemberships) {
  useAuthMock.mockReturnValue({
    user: { id: "customer-1", email: "cathy@example.test" },
    profile: { full_name: "Cathy Customer", avatar_url: null },
    signOut: vi.fn(),
    workspaceMemberships,
    activeWorkspace: { workspace_id: workspaceMemberships[0]?.workspace_id },
    setActiveWorkspaceId,
  });
  return render(
    <LangContext.Provider value={ctx}>
      <CustomerProfile requests={[]} onReplayTour={vi.fn()} />
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
