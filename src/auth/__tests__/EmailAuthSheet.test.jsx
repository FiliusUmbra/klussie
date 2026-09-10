// EmailAuthSheet.jsx's own tests — none existed before this.
//
// Found by code audit while sweeping the `setError(err.message)` anti-pattern already
// fixed elsewhere (documents.js/ReportSheet.jsx/BecomeProSheet.jsx/EditProfileSheet.jsx):
// this file had the same-looking bug, but deliberately gets a different fix — see
// authErrors.js's own header for why collapsing every Auth error into one generic
// message would be a real regression here, not a fix.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signIn = vi.fn();
const signUp = vi.fn();
const signInWithOtp = vi.fn();
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ signIn, signUp, signInWithOtp }) }));

import { LangContext } from "../../lib/lang";
import { EmailAuthSheet } from "../EmailAuthSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

function inputAfterLabel(labelText) {
  return screen.getByText(labelText).nextElementSibling.querySelector("input");
}

function renderSheet() {
  const onClose = vi.fn();
  render(
    <LangContext.Provider value={{ t }}>
      <EmailAuthSheet onClose={onClose} />
    </LangContext.Provider>
  );
  return { onClose };
}

describe("EmailAuthSheet — magic link", () => {
  it("sends the link and shows the sent notice on success", async () => {
    signInWithOtp.mockResolvedValue();
    renderSheet();

    fireEvent.change(inputAfterLabel("authEmailLabel"), { target: { value: "cathy@example.test" } });
    fireEvent.click(screen.getByText("sendMagicLinkBtn"));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledWith("cathy@example.test"));
    expect(screen.getByText("magicLinkSentMsg")).toBeTruthy();
  });

  it("shows the real, distinct rate-limit message, not the raw GoTrue text, when Supabase itself is rate-limited", async () => {
    signInWithOtp.mockRejectedValue(Object.assign(new Error("Email rate limit exceeded"), { code: "over_email_send_rate_limit" }));
    renderSheet();

    fireEvent.change(inputAfterLabel("authEmailLabel"), { target: { value: "cathy@example.test" } });
    fireEvent.click(screen.getByText("sendMagicLinkBtn"));

    await waitFor(() => expect(screen.getByText("authErrorRateLimited")).toBeTruthy());
    expect(screen.queryByText(/rate limit exceeded/)).toBeNull();
  });

  it("falls back to the generic message for an error GoTrue gave no code for", async () => {
    signInWithOtp.mockRejectedValue(new Error("Failed to fetch"));
    renderSheet();

    fireEvent.change(inputAfterLabel("authEmailLabel"), { target: { value: "cathy@example.test" } });
    fireEvent.click(screen.getByText("sendMagicLinkBtn"));

    await waitFor(() => expect(screen.getByText("authErrorGeneric")).toBeTruthy());
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});

describe("EmailAuthSheet — password sign-in/sign-up", () => {
  function switchToPassword() {
    fireEvent.click(screen.getByText("usePasswordInstead"));
  }

  it("signs in on success", async () => {
    signIn.mockResolvedValue();
    renderSheet();
    switchToPassword();

    fireEvent.change(inputAfterLabel("authEmailLabel"), { target: { value: "cathy@example.test" } });
    fireEvent.change(inputAfterLabel("authPasswordLabel"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByText("authSignInBtn"));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith("cathy@example.test", "hunter22"));
  });

  it("shows a real, specific 'wrong password' message, not the raw GoTrue text", async () => {
    signIn.mockRejectedValue(Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }));
    renderSheet();
    switchToPassword();

    fireEvent.change(inputAfterLabel("authEmailLabel"), { target: { value: "cathy@example.test" } });
    fireEvent.change(inputAfterLabel("authPasswordLabel"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByText("authSignInBtn"));

    await waitFor(() => expect(screen.getByText("authErrorInvalidCredentials")).toBeTruthy());
    expect(screen.queryByText(/Invalid login credentials/)).toBeNull();
  });

  it("shows a real, specific 'already registered' message on sign-up, distinct from a wrong-password message", async () => {
    signUp.mockRejectedValue(Object.assign(new Error("User already registered"), { code: "user_already_exists" }));
    renderSheet();
    switchToPassword();
    fireEvent.click(screen.getByText("authSwitchToSignUp"));

    fireEvent.change(inputAfterLabel("authFullNameLabel"), { target: { value: "Cathy Customer" } });
    fireEvent.change(inputAfterLabel("authEmailLabel"), { target: { value: "cathy@example.test" } });
    fireEvent.change(inputAfterLabel("authPasswordLabel"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByText("authSignUpBtn"));

    await waitFor(() => expect(screen.getByText("authErrorEmailAlreadyRegistered")).toBeTruthy());
    expect(screen.queryByText("authErrorInvalidCredentials")).toBeNull();
  });
});
