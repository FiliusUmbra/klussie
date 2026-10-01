// PageTour.jsx's own tests. jsdom's getBoundingClientRect() always returns a zeroed
// rect (no real layout engine), which is fine here -- these tests only need rect to be
// a real object (truthy), never its actual numbers, since the component's own render
// branch is "target found or not," not "target positioned precisely."
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LangContext } from "../../lib/lang";
import { PageTour } from "../PageTour.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t };

const STEPS = [
  { id: "step-a", titleKey: "titleA", bodyKey: "bodyA" },
  { id: "step-b", titleKey: "titleB", bodyKey: "bodyB" },
];

function renderTour({ steps = STEPS, onFinish = vi.fn() } = {}) {
  // One real target per step, matching what a real page (DailyHome.jsx and friends)
  // provides via its own data-tour attributes.
  document.body.innerHTML = '<div data-tour="step-a"></div><div data-tour="step-b"></div>';
  render(
    <LangContext.Provider value={ctx}>
      <PageTour steps={steps} onFinish={onFinish} />
    </LangContext.Provider>
  );
  return { onFinish };
}

describe("PageTour", () => {
  it("renders the first step's title and body", () => {
    renderTour();
    expect(screen.getByText("titleA")).toBeTruthy();
    expect(screen.getByText("bodyA")).toBeTruthy();
  });

  it("never renders when the step's own target isn't mounted on this page", () => {
    document.body.innerHTML = "<div></div>";
    const onFinish = vi.fn();
    render(
      <LangContext.Provider value={ctx}>
        <PageTour steps={STEPS} onFinish={onFinish} />
      </LangContext.Provider>
    );
    expect(screen.queryByText("titleA")).toBeNull();
  });

  it("advances to the next step on tourNext, and back again on tourBack", () => {
    renderTour();
    fireEvent.click(screen.getByText("tourNext"));
    expect(screen.getByText("titleB")).toBeTruthy();
    expect(screen.queryByText("titleA")).toBeNull();

    fireEvent.click(screen.getByText("tourBack"));
    expect(screen.getByText("titleA")).toBeTruthy();
  });

  it("shows pageTourDoneBtn instead of tourNext on the last step, and it calls onFinish", () => {
    const { onFinish } = renderTour();
    fireEvent.click(screen.getByText("tourNext"));

    expect(screen.queryByText("tourNext")).toBeNull();
    fireEvent.click(screen.getByText("pageTourDoneBtn"));
    expect(onFinish).toHaveBeenCalled();
  });

  it("calls onFinish from tourSkip on any step, not only the last", () => {
    const { onFinish } = renderTour();
    fireEvent.click(screen.getByText("tourSkip"));
    expect(onFinish).toHaveBeenCalled();
  });

  it("calls onFinish on Escape", () => {
    const { onFinish } = renderTour();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFinish).toHaveBeenCalled();
  });
});
