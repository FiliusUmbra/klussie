import { describe, it, expect } from "vitest";
import { authErrorLabelKey } from "../authErrors.js";

describe("authErrorLabelKey", () => {
  it("maps every known GoTrue error code to its own distinct key", () => {
    expect(authErrorLabelKey({ code: "invalid_credentials" })).toBe("authErrorInvalidCredentials");
    expect(authErrorLabelKey({ code: "email_not_confirmed" })).toBe("authErrorEmailNotConfirmed");
    expect(authErrorLabelKey({ code: "user_already_exists" })).toBe("authErrorEmailAlreadyRegistered");
    expect(authErrorLabelKey({ code: "email_exists" })).toBe("authErrorEmailAlreadyRegistered");
    expect(authErrorLabelKey({ code: "weak_password" })).toBe("authErrorWeakPassword");
    expect(authErrorLabelKey({ code: "email_address_invalid" })).toBe("authErrorInvalidEmail");
    expect(authErrorLabelKey({ code: "over_email_send_rate_limit" })).toBe("authErrorRateLimited");
    expect(authErrorLabelKey({ code: "over_request_rate_limit" })).toBe("authErrorRateLimited");
    expect(authErrorLabelKey({ code: "user_banned" })).toBe("authErrorAccountUnavailable");
    expect(authErrorLabelKey({ code: "signup_disabled" })).toBe("authErrorAccountUnavailable");
    expect(authErrorLabelKey({ code: "provider_disabled" })).toBe("authErrorProviderUnavailable");
  });

  it("falls back to the generic key for a code it doesn't recognise", () => {
    expect(authErrorLabelKey({ code: "bad_jwt" })).toBe("authErrorGeneric");
  });

  it("falls back to the generic key when there is no code at all — a network failure that never reached the server", () => {
    expect(authErrorLabelKey(new Error("Failed to fetch"))).toBe("authErrorGeneric");
  });

  it("never throws on a nullish error", () => {
    expect(authErrorLabelKey(null)).toBe("authErrorGeneric");
    expect(authErrorLabelKey(undefined)).toBe("authErrorGeneric");
  });
});
