// Same adapter shape as workspacePreference.js, tested the same way: real localStorage
// (jsdom provides a working one), tolerant of a private mode that throws. Not person-
// scoped -- see langPreference.js's own header for why that's deliberate here.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPreferredLangCode, setPreferredLangCode } from "../langPreference";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getPreferredLangCode / setPreferredLangCode", () => {
  it("returns null when nothing has been stored", () => {
    expect(getPreferredLangCode()).toBeNull();
  });

  it("round-trips a stored preference", () => {
    setPreferredLangCode("ar");
    expect(getPreferredLangCode()).toBe("ar");
  });

  // Found live during a UX review, 2026-09-12: AppShell.jsx's own langCode had nowhere to
  // live but memory, so every reload reverted to Dutch regardless of what was picked --
  // this is the regression guard for that fix, not just this module's own contract.
  it("survives a reload for every locale klussie actually ships, not only the default", () => {
    for (const code of ["nl", "fr", "de", "en", "es", "ar", "fa", "tr", "ru", "zh"]) {
      setPreferredLangCode(code);
      expect(getPreferredLangCode()).toBe(code);
    }
  });

  it("falls back to null for a stored value no current locale table recognizes -- a dropped or corrupted code, never trusted blindly", () => {
    window.localStorage.setItem("klussie.langCode", "xx");
    expect(getPreferredLangCode()).toBeNull();
  });

  it("tolerates localStorage throwing (private browsing) without raising", () => {
    const getSpy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => getPreferredLangCode()).not.toThrow();
    expect(getPreferredLangCode()).toBeNull();
    getSpy.mockRestore();

    const setSpy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => setPreferredLangCode("ar")).not.toThrow();
    setSpy.mockRestore();
  });
});
