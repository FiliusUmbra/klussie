// Payments Slice A (WP A5) — the client side of api.my_acquisition_fee_assessments()/
// api.accept_acquisition_fee_disclosure()/api.confirm_payment_received() (0230).
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import {
  fetchMyAcquisitionFeeAssessments,
  acceptAcquisitionFeeDisclosure,
  confirmAcquisitionFeePaymentReceived,
} from "../acquisitionFees";

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
});

describe("fetchMyAcquisitionFeeAssessments", () => {
  it("returns an empty array without calling the RPC when no workspaceId is given", async () => {
    const result = await fetchMyAcquisitionFeeAssessments(null);
    expect(result).toEqual([]);
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("shapes every numeric column to a real Number, never a string from the wire", async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: "a-1", engagement_id: "eng-1", rate: "0.0500", max_fee: "75.00", currency: "EUR",
        base_amount: "120.00", fee_amount: "6.00", status: "disclosed", not_chargeable_reason: null,
        disclosed_at: "2026-01-01T00:00:00Z", accepted_at: null, invoice_id: null,
      }],
      error: null,
    });

    const [row] = await fetchMyAcquisitionFeeAssessments("ws-1");

    expect(rpcMock).toHaveBeenCalledWith("my_acquisition_fee_assessments", { p_workspace_id: "ws-1" });
    expect(row).toMatchObject({
      id: "a-1", engagementId: "eng-1", rate: 0.05, maxFee: 75, baseAmount: 120, feeAmount: 6, status: "disclosed",
    });
    expect(typeof row.rate).toBe("number");
    expect(typeof row.feeAmount).toBe("number");
  });

  it("throws the real Supabase error rather than swallowing it", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(fetchMyAcquisitionFeeAssessments("ws-1")).rejects.toThrow("denied");
  });
});

describe("acceptAcquisitionFeeDisclosure", () => {
  it("calls accept_acquisition_fee_disclosure with the assessment id and the caller's own actorRef", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await acceptAcquisitionFeeDisclosure("assess-1", "pro-1");

    const call = rpcMock.mock.calls.find(([name]) => name === "accept_acquisition_fee_disclosure");
    expect(call[1]).toMatchObject({ p_assessment_id: "assess-1", p_actor_type: "person", p_actor_ref: "pro-1" });
  });

  it("throws the real Supabase error", async () => {
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });
    await expect(acceptAcquisitionFeeDisclosure("assess-1", "pro-1")).rejects.toThrow("insufficient_privilege");
  });
});

describe("confirmAcquisitionFeePaymentReceived", () => {
  it("calls confirm_payment_received with a fresh invoice id and the caller's own actorRef", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await confirmAcquisitionFeePaymentReceived("assess-1", "pro-1");

    const call = rpcMock.mock.calls.find(([name]) => name === "confirm_payment_received");
    expect(call[1]).toMatchObject({ p_assessment_id: "assess-1", p_actor_type: "person", p_actor_ref: "pro-1" });
    expect(call[1].p_invoice_id).toBeTruthy();
  });

  it("throws the real Supabase error", async () => {
    rpcMock.mockResolvedValue({ error: new Error("object_not_in_prerequisite_state") });
    await expect(confirmAcquisitionFeePaymentReceived("assess-1", "pro-1")).rejects.toThrow("object_not_in_prerequisite_state");
  });
});
