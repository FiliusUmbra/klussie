// Platform Activation Slice 3, WP 3.2 — the client side of 0164's request-keyed read,
// and the write that closes the loop (a customer approving what they read).
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn() },
}));
vi.mock("../ids.js", () => ({ uuidv7: () => "generated-uuid" }));

import { supabase } from "../supabaseClient";
import { fetchServiceRecordForRequest, approveServiceRecord } from "../serviceRecords.js";

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
});

describe("fetchServiceRecordForRequest", () => {
  it("calls the request-keyed read and reshapes the row into camelCase", async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: "rec-1", property_id: "prop-1", asset_id: null, location_id: null,
        performing_workspace_id: "ws-pro", performed_at: "2026-08-01T10:00:00Z",
        work_performed: "Replaced the valve.", agreed_price: "150.00", price_currency: "EUR",
        warranty_until: "2027-08-01", customer_approved: false, customer_approved_at: null,
        ai_summary: null, recommendations: "Service again in a year.", content: {},
        created_at: "2026-08-01T10:05:00Z",
      }],
      error: null,
    });

    const result = await fetchServiceRecordForRequest("req-1");

    expect(rpcMock).toHaveBeenCalledWith("resolve_service_record_for_request", { p_request_id: "req-1" });
    expect(result).toEqual({
      id: "rec-1", performedAt: "2026-08-01T10:00:00Z", workPerformed: "Replaced the valve.",
      agreedPrice: 150, priceCurrency: "EUR", warrantyUntil: "2027-08-01",
      customerApproved: false, customerApprovedAt: null, aiSummary: null,
      recommendations: "Service again in a year.", content: {}, createdAt: "2026-08-01T10:05:00Z",
    });
  });

  it("returns null, not an error, when no record has been authored yet — the deliberate empty-state case", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await fetchServiceRecordForRequest("req-no-record");

    expect(result).toBeNull();
  });

  it("throws when the read genuinely errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("denied") });

    await expect(fetchServiceRecordForRequest("req-1")).rejects.toThrow("denied");
  });
});

describe("approveServiceRecord", () => {
  it("calls record_service_record_approval with the record id and the caller's own actor id", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await approveServiceRecord("rec-1", "customer-1");

    expect(rpcMock).toHaveBeenCalledWith("record_service_record_approval", {
      p_service_record_id: "rec-1",
      p_event_id: "generated-uuid",
      p_correlation_id: "generated-uuid",
      p_actor_type: "person",
      p_actor_ref: "customer-1",
    });
  });

  it("throws when the approval is refused", async () => {
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });

    await expect(approveServiceRecord("rec-1", "not-the-steward")).rejects.toThrow("insufficient_privilege");
  });
});
