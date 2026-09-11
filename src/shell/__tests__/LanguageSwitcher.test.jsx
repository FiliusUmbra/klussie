// Reads langCode/setLangCode/LANGS from useLang() rather than props — the shape
// buildLangContext() (langContext.js) now provides — so this component renders from
// context alone, whether it's AppShell's own topbar or a Profile screen (fixed 2026-08-22,
// mirroring WorkspaceSwitcher.jsx's own identical reachability fix).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { LanguageSwitcher } from "../LanguageSwitcher.jsx";

const LANGS = [
  { code: "nl", label: "Nederlands", locale: "nl-BE" },
  { code: "en", label: "English", locale: "en-GB" },
];

const t = { languageSwitcherLabel: "Language" };

function renderSwitcher(overrides = {}) {
  const setLangCode = vi.fn();
  const ctx = { t, langCode: "nl", setLangCode, LANGS, ...overrides };
  render(
    <LangContext.Provider value={ctx}>
      <LanguageSwitcher />
    </LangContext.Provider>
  );
  return { setLangCode };
}

describe("LanguageSwitcher", () => {
  it("lists every supported locale by its own label", () => {
    renderSwitcher();
    expect(screen.getByText("Nederlands")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
  });

  it("shows the current locale selected", () => {
    renderSwitcher({ langCode: "en" });
    expect(screen.getByLabelText("Language").value).toBe("en");
  });

  it("calls setLangCode with the picked locale's code", () => {
    const { setLangCode } = renderSwitcher();
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "en" } });
    expect(setLangCode).toHaveBeenCalledWith("en");
  });

  // Found by code audit: hardcoded aria-label="Language" -- on the one control whose
  // whole purpose is switching language, a non-English-speaking user's screen reader
  // still named it in English regardless of which locale they'd already picked.
  it("uses the real localized label, not a hardcoded English one", () => {
    renderSwitcher({ t: { languageSwitcherLabel: "Taal" } });
    expect(screen.getByLabelText("Taal")).toBeTruthy();
  });

  it("renders the light variant's class when asked, for a light page background", () => {
    const ctx = { t, langCode: "nl", setLangCode: vi.fn(), LANGS };
    const { container } = render(
      <LangContext.Provider value={ctx}>
        <LanguageSwitcher light />
      </LangContext.Provider>
    );
    expect(container.querySelector(".lang-switch-light")).toBeTruthy();
  });
});
