// BusinessApp.jsx's own tests — the Business landing + its four real destinations. The
// four sub-components have their own dedicated test files (BusinessProfileSection.test.jsx,
// BusinessBillingSection.test.jsx, BusinessTeamSection.test.jsx); this file only covers
// BusinessApp's own routing between them, the pro type toggle it gained 2026-09-29
// (UX_TAB_SCOPE.md P5, moved here verbatim from Profile.test.jsx's own "switching pro type"
// describe block), and the one acceptance criterion that lives at this level: viewing the
// landing must never mount MyBusinessPanel.jsx (the component whose own header explains it
// auto-creates a property the first time it mounts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../BusinessProfileSection.jsx", () => ({ BusinessProfileSection: () => <div>profile-section-stub</div> }));
vi.mock("../BusinessBillingSection.jsx", () => ({ BusinessBillingSection: () => <div>billing-section-stub</div> }));
vi.mock("../BusinessTeamSection.jsx", () => ({ BusinessTeamSection: () => <div>team-section-stub</div> }));
const myBusinessPanelMount = vi.fn();
vi.mock("../MyBusinessPanel.jsx", () => ({
  MyBusinessPanel: () => { myBusinessPanelMount(); return <div>equipment-panel-stub</div>; },
}));
const useAuthMock = vi.fn();
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/pros", () => ({ updateProProfile: vi.fn() }));

import { BusinessApp } from "../BusinessApp.jsx";
import { updateProProfile } from "../../lib/pros";

const t = new Proxy({}, { get: (_, key) => String(key) });
const PRO_PROFILE = { pro_type: "flexi" };

function renderApp(proInfo = { name: "Pierre's Painting" }, overrides = {}) {
  useAuthMock.mockReturnValue({ user: { id: "person-1" }, proProfile: PRO_PROFILE, refreshProfile: vi.fn(), ...overrides });
  return render(
    <BusinessApp t={t} fmtDate={(d) => String(d)} proInfo={proInfo} offeredServiceIds={[]} onServicesChange={vi.fn()} />
  );
}

describe("BusinessApp — landing", () => {
  it("shows the business identity and all four real destinations", () => {
    renderApp();
    expect(screen.getByText("Pierre's Painting")).toBeTruthy();
    expect(screen.getByText("bizProfileTitle")).toBeTruthy();
    expect(screen.getByText("bizBillingTitle")).toBeTruthy();
    expect(screen.getByText("bizTeamTitle")).toBeTruthy();
    expect(screen.getByText("bizEquipmentTitle")).toBeTruthy();
  });

  it("falls back to the translated placeholder, not a blank heading, when proInfo has no name", () => {
    renderApp({ name: null });
    expect(screen.getByText("proFallbackName")).toBeTruthy();
  });

  // The spec's own explicit acceptance criterion (UX_TAB_SCOPE.md P3): "viewing the
  // Business landing page should not itself create a property." MyBusinessPanel.jsx's own
  // auto-create-on-mount only fires once it actually mounts — so this landing must never
  // mount it just by being viewed.
  it("never mounts MyBusinessPanel (and so never auto-creates a property) just from viewing the landing", () => {
    renderApp();
    expect(myBusinessPanelMount).not.toHaveBeenCalled();
  });
});

// Found live during a UX review, 2026-09-06: switching to "Registered business" failed
// silently whenever business_name/vat_number were still unset (public.pro_profiles' own
// business_requires_details check constraint) -- no error, no explanation, the button
// simply appeared to do nothing.
describe("BusinessApp — pro type toggle", () => {
  beforeEach(() => {
    vi.mocked(updateProProfile).mockReset();
  });

  it("shows a plain-language message, not the raw constraint name, when the business switch is refused for missing details", async () => {
    vi.mocked(updateProProfile).mockRejectedValueOnce(
      Object.assign(new Error('new row for relation "pro_profiles" violates check constraint "business_requires_details"'), { code: "23514" })
    );
    renderApp();

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(screen.getByText("proTypeBusinessRequiresDetails")).toBeTruthy());
    expect(screen.queryByText(/business_requires_details/)).toBeNull();
  });

  it("shows a generic message, never the raw error, for any other failure", async () => {
    vi.mocked(updateProProfile).mockRejectedValueOnce(new Error("network hiccup"));
    renderApp();

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(screen.getByText("proTypeSwitchFailed")).toBeTruthy());
    expect(screen.queryByText("network hiccup")).toBeNull();
  });

  it("shows no error at all when the switch succeeds", async () => {
    vi.mocked(updateProProfile).mockResolvedValueOnce(undefined);
    renderApp();

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { pro_type: "business" }));
    expect(screen.queryByText("proTypeBusinessRequiresDetails")).toBeNull();
    expect(screen.queryByText("proTypeSwitchFailed")).toBeNull();
  });

  it("shows no error at all when the switch succeeds but the post-switch refreshProfile() fails", async () => {
    vi.mocked(updateProProfile).mockResolvedValueOnce(undefined);
    const refreshProfile = vi.fn(() => Promise.reject(new Error("network blip refreshing the profile")));
    renderApp(undefined, { refreshProfile });

    fireEvent.click(screen.getByText("proTypeBusiness"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("person-1", { pro_type: "business" }));
    expect(screen.queryByText("proTypeBusinessRequiresDetails")).toBeNull();
    expect(screen.queryByText("proTypeSwitchFailed")).toBeNull();
  });
});

describe("BusinessApp — navigation", () => {
  it("opens Public profile & services, with a back button, and returns to the landing", () => {
    renderApp();
    fireEvent.click(screen.getByText("bizProfileTitle"));

    expect(screen.getByText("profile-section-stub")).toBeTruthy();
    expect(screen.getByText("backBtn")).toBeTruthy();

    fireEvent.click(screen.getByText("backBtn"));
    expect(screen.queryByText("profile-section-stub")).toBeNull();
    expect(screen.getByText("bizProfileTitle")).toBeTruthy(); // back on the landing row
  });

  it("opens Billing", () => {
    renderApp();
    fireEvent.click(screen.getByText("bizBillingTitle"));
    expect(screen.getByText("billing-section-stub")).toBeTruthy();
  });

  it("opens Team", () => {
    renderApp();
    fireEvent.click(screen.getByText("bizTeamTitle"));
    expect(screen.getByText("team-section-stub")).toBeTruthy();
  });

  it("opens Equipment & premises, mounting MyBusinessPanel only now", () => {
    renderApp();
    fireEvent.click(screen.getByText("bizEquipmentTitle"));
    expect(screen.getByText("equipment-panel-stub")).toBeTruthy();
    expect(myBusinessPanelMount).toHaveBeenCalled();
  });
});
