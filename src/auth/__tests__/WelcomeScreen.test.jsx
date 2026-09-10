// WelcomeScreen.jsx's own tests. No prior test file existed for this component; added
// alongside ProviderIcons.jsx (2026-09-07, user request) rather than leaving the new
// logo wiring completely unverified.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const signInWithOAuthMock = vi.fn(() => Promise.resolve());
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ signInWithOAuth: signInWithOAuthMock }) }));

import { LangContext } from "../../lib/lang";
import { WelcomeScreen } from "../WelcomeScreen.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

function renderScreen() {
  return render(
    <LangContext.Provider value={{ t }}>
      <WelcomeScreen />
    </LangContext.Provider>
  );
}

describe("WelcomeScreen — provider logos", () => {
  it("renders one svg per OAuth button, each carrying the provider's own viewBox", () => {
    renderScreen();
    const buttons = ["continueWithApple", "continueWithGoogle", "continueWithMicrosoft", "continueWithFacebook"]
      .map((key) => screen.getByText(key).closest("button"));
    const viewBoxes = buttons.map((b) => b.querySelector("svg").getAttribute("viewBox"));
    // Each provider's mark keeps its own source viewBox (see ProviderIcons.jsx) rather
    // than being force-fit into a shared 24x24 grid the way a generic icon set would be.
    expect(viewBoxes).toEqual(["0 0 24 24", "0 0 118 120", "0 0 72 72", "0 0 14222 14222"]);
  });

  it.each([
    ["continueWithApple", "apple"],
    ["continueWithGoogle", "google"],
    ["continueWithMicrosoft", "azure"],
    ["continueWithFacebook", "facebook"],
  ])("calls signInWithOAuth(%s -> %s) on click", async (labelKey, provider) => {
    signInWithOAuthMock.mockClear();
    renderScreen();
    fireEvent.click(screen.getByText(labelKey));
    expect(signInWithOAuthMock).toHaveBeenCalledWith(provider);
  });

  // Found by code audit: this used to assert the raw GoTrue error rendered verbatim —
  // the exact anti-pattern documents.js's own header names and fixes elsewhere.
  // Updated to pin the fix instead of leaving a stale duplicate test behind: a real,
  // localized, still-specific message from error.code, never error.message. Not a
  // hypothetical case either — every OAuth provider genuinely is unconfigured today
  // (MASTER_CONTEXT.md's own beta-readiness checklist), so `provider_disabled` is
  // exactly the error a real tap on any of these four buttons currently throws.
  it("shows the real, localized 'not available yet' message, never the raw GoTrue text, when a provider isn't configured", async () => {
    signInWithOAuthMock.mockRejectedValueOnce(Object.assign(new Error("Unsupported provider"), { code: "provider_disabled" }));
    renderScreen();
    fireEvent.click(screen.getByText("continueWithApple"));
    await screen.findByText("authErrorProviderUnavailable");
    expect(screen.queryByText(/Unsupported provider/)).toBeNull();
  });

  it("falls back to the generic message for an OAuth failure GoTrue gave no code for", async () => {
    signInWithOAuthMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderScreen();
    fireEvent.click(screen.getByText("continueWithApple"));
    await screen.findByText("authErrorGeneric");
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});
