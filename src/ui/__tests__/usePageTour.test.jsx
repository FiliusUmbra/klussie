// usePageTour — with the tour gate (live review 2026-10-04, item 11): a fresh account used to
// get the onboarding modal and the page tour at once. A blocked gate holds the page tour back
// until the other tour finishes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));

import { usePageTour } from "../usePageTour.js";
import { TourGateContext } from "../tourGate.js";

beforeEach(() => localStorage.clear());

const withGate = (blocked) => ({ children }) => <TourGateContext.Provider value={{ blocked }}>{children}</TourGateContext.Provider>;

describe("usePageTour with the tour gate", () => {
  it("opens for a first visit when nothing else is blocking it", () => {
    const { result } = renderHook(() => usePageTour("today"), { wrapper: withGate(false) });
    expect(result.current.open).toBe(true);
  });

  it("stays closed while another tour holds the gate, then opens when it releases", () => {
    let blocked = true;
    const Wrapper = ({ children }) => <TourGateContext.Provider value={{ blocked }}>{children}</TourGateContext.Provider>;
    const { result, rerender } = renderHook(() => usePageTour("today"), { wrapper: Wrapper });
    expect(result.current.open).toBe(false);
    blocked = false;
    rerender();
    expect(result.current.open).toBe(true);
  });

  it("an explicit replay still works while blocked (the user asked for it)", () => {
    const { result } = renderHook(() => usePageTour("today"), { wrapper: withGate(true) });
    act(() => result.current.replay());
    expect(result.current.open).toBe(true);
  });

  it("with no provider at all, behaves exactly as before", () => {
    const { result } = renderHook(() => usePageTour("today"));
    expect(result.current.open).toBe(true);
  });
});
