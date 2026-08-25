// Same mocking shape as auditRecords.test.js deliberately — this module's fallback
// idiom is the same one every other read switch in this codebase already uses.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { fetchActivationRatios, ACTIVATION_JOURNEYS, ACTIVATION_RATIO_WINDOW_DAYS } from "../activationRatios";

const ROW = {
  journey_key: "request_to_booking",
  platform_count: 12,
  legacy_count: 12,
  ratio: 0.5,
  window_from: "2026-07-26T00:00:00Z",
  window_to: "2026-08-25T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchActivationRatios", () => {
  it("calls api.activation_ratios with the default window", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchActivationRatios();

    expect(apiRpc).toHaveBeenCalledWith("api", "activation_ratios", { p_window_days: ACTIVATION_RATIO_WINDOW_DAYS });
  });

  it("passes a given window through", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchActivationRatios({ windowDays: 7 });

    expect(apiRpc).toHaveBeenCalledWith("api", "activation_ratios", { p_window_days: 7 });
  });

  it("always returns all five journeys, in ACTIVATION_JOURNEYS' own stable order, missing ones defaulted", async () => {
    apiRpc.mockResolvedValue({ data: [ROW], error: null });

    const rows = await fetchActivationRatios();

    expect(rows.map((r) => r.journeyKey)).toEqual(ACTIVATION_JOURNEYS.map((j) => j.key));
    const booking = rows.find((r) => r.journeyKey === "request_to_booking");
    expect(booking).toEqual({
      journeyKey: "request_to_booking",
      platformCount: 12,
      legacyCount: 12,
      ratio: 0.5,
      windowFrom: ROW.window_from,
      windowTo: ROW.window_to,
    });
    const untouched = rows.find((r) => r.journeyKey === "property_asset_recorded");
    expect(untouched).toEqual({
      journeyKey: "property_asset_recorded",
      platformCount: 0,
      legacyCount: 0,
      ratio: null,
      windowFrom: null,
      windowTo: null,
    });
  });

  it("keeps ratio null, not 0, when the database reads a journey as not-yet-started", async () => {
    apiRpc.mockResolvedValue({
      data: [{ journey_key: "conversation", platform_count: 0, legacy_count: 0, ratio: null, window_from: "a", window_to: "b" }],
      error: null,
    });

    const rows = await fetchActivationRatios();

    expect(rows.find((r) => r.journeyKey === "conversation").ratio).toBeNull();
  });

  it("returns an empty list rather than throwing when the resolver is unavailable — the same EXISTS-gated behaviour a non-operator sees", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rows = await fetchActivationRatios();

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty list rather than throwing when the client itself throws", async () => {
    apiRpc.mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rows = await fetchActivationRatios();

    expect(rows).toEqual([]);
    warn.mockRestore();
  });
});
