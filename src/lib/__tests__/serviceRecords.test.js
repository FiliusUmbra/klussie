// Platform Activation Slice 3 — the client side of the Service Record contract.
// WP 3.2: 0164's request-keyed read, and the write that closes the loop (a customer
// approving what they read). WP 3.3: the pro's own writes — createServiceRecord(),
// writePerformingAnnex(), and the evidence-photo upload (0165's own new contract).
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const uploadMock = vi.fn();
const createSignedUrlsMock = vi.fn();
const removeMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock("../ids.js", () => ({ uuidv7: () => "generated-uuid" }));

import { supabase } from "../supabaseClient";
import {
  fetchServiceRecordForRequest, approveServiceRecord,
  createServiceRecord, writePerformingAnnex,
  uploadServiceRecordEvidence, fetchServiceRecordEvidence,
} from "../serviceRecords.js";

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
  vi.mocked(supabase.storage.from).mockReset();
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ error: null });
  createSignedUrlsMock.mockReset();
  createSignedUrlsMock.mockResolvedValue({ data: [{ signedUrl: "https://signed.example/evidence.jpg" }], error: null });
  removeMock.mockReset();
  removeMock.mockResolvedValue({ error: null });
  vi.mocked(supabase.storage.from).mockReturnValue({ upload: uploadMock, createSignedUrls: createSignedUrlsMock, remove: removeMock });
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

describe("createServiceRecord — one creation call, no draft (design note §5)", () => {
  it("calls api.create_service_record with every optional field defaulting to null, never undefined", async () => {
    rpcMock.mockResolvedValue({ error: null });

    const id = await createServiceRecord({
      engagementId: "eng-1", actorRef: "pro-1",
      performedAt: "2026-08-22T10:00:00.000Z", workPerformed: "Replaced the valve.",
    });

    expect(id).toBe("generated-uuid");
    expect(rpcMock).toHaveBeenCalledWith("create_service_record", {
      p_service_record_id: "generated-uuid", p_engagement_id: "eng-1",
      p_performed_at: "2026-08-22T10:00:00.000Z", p_work_performed: "Replaced the valve.",
      p_agreed_price: null, p_price_currency: null, p_warranty_until: null,
      p_ai_summary: null, p_recommendations: null, p_content: {},
      p_event_id: "generated-uuid", p_warranty_event_id: "generated-uuid", p_correlation_id: "generated-uuid",
      p_actor_type: "person", p_actor_ref: "pro-1",
    });
  });

  it("passes through every optional field when the caller supplies them", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await createServiceRecord({
      engagementId: "eng-1", actorRef: "pro-1", performedAt: "2026-08-22T10:00:00.000Z",
      workPerformed: "Replaced the valve.", agreedPrice: 150, priceCurrency: "EUR",
      warrantyUntil: "2027-08-22", recommendations: "Check again next year.",
    });

    const call = rpcMock.mock.calls.find(([name]) => name === "create_service_record");
    expect(call[1]).toMatchObject({
      p_agreed_price: 150, p_price_currency: "EUR", p_warranty_until: "2027-08-22",
      p_recommendations: "Check again next year.",
    });
  });

  it("throws when the write is refused — e.g. the caller isn't a real member of the performing workspace", async () => {
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });

    await expect(createServiceRecord({
      engagementId: "eng-1", actorRef: "stranger", performedAt: "2026-08-22T10:00:00.000Z", workPerformed: "x",
    })).rejects.toThrow("insufficient_privilege");
  });
});

describe("writePerformingAnnex — a separate, optional write, never merged into createServiceRecord", () => {
  it("calls api.write_performing_annex with every field, defaulting missing ones to null", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await writePerformingAnnex({ serviceRecordId: "rec-1", internalCost: 80, margin: 70 });

    expect(rpcMock).toHaveBeenCalledWith("write_performing_annex", {
      p_annex_id: "generated-uuid", p_service_record_id: "rec-1",
      p_internal_cost: 80, p_margin: 70,
      p_supplier_used: null, p_supplier_price: null, p_scheduling_notes: null, p_internal_commentary: null,
    });
  });
});

describe("uploadServiceRecordEvidence — 0165's own new write path, the performing side", () => {
  it("uploads into the 'documents' bucket rooted under the performing workspace, keyed by the record id", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await uploadServiceRecordEvidence("rec-1", "ws-pro", "pro-1", { type: "image/jpeg" });

    expect(supabase.storage.from).toHaveBeenCalledWith("documents");
    const [path] = uploadMock.mock.calls[0];
    expect(path.startsWith("ws-pro/rec-1/")).toBe(true);
  });

  it("calls api.create_document_for_service_record with the record id and the pro's own actor id", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await uploadServiceRecordEvidence("rec-1", "ws-pro", "pro-1", { type: "image/jpeg" });

    const call = rpcMock.mock.calls.find(([name]) => name === "create_document_for_service_record");
    expect(call[1]).toMatchObject({ p_service_record_id: "rec-1", p_actor_type: "person", p_actor_ref: "pro-1" });
    expect(call[1].p_storage_path.startsWith("ws-pro/rec-1/")).toBe(true);
  });

  it("throws the storage error without calling the write, and never removes anything that never uploaded", async () => {
    uploadMock.mockResolvedValue({ error: new Error("upload failed") });

    await expect(uploadServiceRecordEvidence("rec-1", "ws-pro", "pro-1", { type: "image/jpeg" })).rejects.toThrow("upload failed");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("cleans up the orphaned upload when the write is refused, but still throws the real error", async () => {
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });

    await expect(uploadServiceRecordEvidence("rec-1", "ws-pro", "not-the-pro", { type: "image/jpeg" })).rejects.toThrow("insufficient_privilege");
    expect(removeMock).toHaveBeenCalled();
  });
});

describe("fetchServiceRecordEvidence — filters the same request-scoped read down to one type_key", () => {
  it("reads via api.my_documents(p_request_id) and keeps only service_evidence rows", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: "photo-pre-job", type_key: "request_photo", storage_path: "ws-cust/req-1/a.jpg" },
        { id: "photo-evidence", type_key: "service_evidence", storage_path: "ws-pro/rec-1/b.jpg" },
      ],
      error: null,
    });

    const result = await fetchServiceRecordEvidence("req-1");

    expect(rpcMock).toHaveBeenCalledWith("my_documents", { p_request_id: "req-1" });
    expect(result).toEqual([{ id: "photo-evidence", url: "https://signed.example/evidence.jpg" }]);
  });

  it("returns an empty array without touching storage when there is no evidence yet", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "photo-pre-job", type_key: "request_photo", storage_path: "x" }], error: null });

    const result = await fetchServiceRecordEvidence("req-1");

    expect(result).toEqual([]);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("throws the real read error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(fetchServiceRecordEvidence("req-1")).rejects.toThrow("denied");
  });
});
