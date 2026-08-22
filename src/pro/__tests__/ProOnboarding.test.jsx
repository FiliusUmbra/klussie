// GUIDANCE_SYSTEM.md §17.2.1's own pro tour — the "no separate tour" gap UX_PATTERNS.md
// already named for pros. Six beats (opener, four real-anchored steps, closer),
// dismissible at every one — mirroring CustomerOnboarding.jsx's own interaction shape.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProOnboarding } from "../ProOnboarding.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

function renderTour(onFinish = vi.fn()) {
  return render(<ProOnboarding t={t} onFinish={onFinish} />);
}

describe("ProOnboarding", () => {
  it("opens on the opener step", () => {
    renderTour();
    expect(screen.getByText("proTourStep0Title")).toBeTruthy();
  });

  it("walks all six beats forward via Next", () => {
    renderTour();
    const stepKeys = ["proTourStep0Title", "proTourStep1Title", "proTourStep2Title", "proTourStep3Title", "proTourStep4Title", "proTourStep5Title"];
    stepKeys.forEach((key, i) => {
      expect(screen.getByText(key)).toBeTruthy();
      if (i < stepKeys.length - 1) fireEvent.click(screen.getByText("tourNext"));
    });
  });

  it("shows the single done CTA only on the last step, never tourNext there", () => {
    renderTour();
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText("tourNext"));
    expect(screen.getByText("proTourStep5Title")).toBeTruthy();
    expect(screen.getByText("proTourDoneCta")).toBeTruthy();
    expect(screen.queryByText("tourNext")).toBeNull();
  });

  it("finishes when the done CTA is pressed on the last step", () => {
    const onFinish = vi.fn();
    renderTour(onFinish);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText("tourNext"));
    fireEvent.click(screen.getByText("proTourDoneCta"));
    expect(onFinish).toHaveBeenCalled();
  });

  it("is skippable from the first step", () => {
    const onFinish = vi.fn();
    renderTour(onFinish);
    fireEvent.click(screen.getByText("tourSkip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("is skippable from a later step too, not only the first", () => {
    const onFinish = vi.fn();
    renderTour(onFinish);
    fireEvent.click(screen.getByText("tourNext"));
    fireEvent.click(screen.getByText("tourSkip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows Back after the first step, not on it", () => {
    renderTour();
    expect(screen.queryByText("tourBack")).toBeNull();
    fireEvent.click(screen.getByText("tourNext"));
    expect(screen.getByText("tourBack")).toBeTruthy();
    fireEvent.click(screen.getByText("tourBack"));
    expect(screen.getByText("proTourStep0Title")).toBeTruthy();
  });
});
