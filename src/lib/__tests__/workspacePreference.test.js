// Epic 03 WP12. Same adapter shape as onboardingPrefs.js, tested the same way: real
// localStorage (jsdom provides a working one), scoped per person, tolerant of a private
// mode that throws.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPreferredWorkspaceId, setPreferredWorkspaceId } from "../workspacePreference";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getPreferredWorkspaceId / setPreferredWorkspaceId", () => {
  it("returns null when nothing has been stored", () => {
    expect(getPreferredWorkspaceId("user-1")).toBeNull();
  });

  it("round-trips a stored preference", () => {
    setPreferredWorkspaceId("user-1", "ws-1");
    expect(getPreferredWorkspaceId("user-1")).toBe("ws-1");
  });

  it("scopes by person, so two accounts on the same device never collide", () => {
    setPreferredWorkspaceId("user-1", "ws-1");
    setPreferredWorkspaceId("user-2", "ws-2");

    expect(getPreferredWorkspaceId("user-1")).toBe("ws-1");
    expect(getPreferredWorkspaceId("user-2")).toBe("ws-2");
  });

  it("tolerates localStorage throwing (private browsing) without raising", () => {
    const getSpy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => getPreferredWorkspaceId("user-1")).not.toThrow();
    expect(getPreferredWorkspaceId("user-1")).toBeNull();
    getSpy.mockRestore();

    const setSpy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => setPreferredWorkspaceId("user-1", "ws-1")).not.toThrow();
    setSpy.mockRestore();
  });
});
