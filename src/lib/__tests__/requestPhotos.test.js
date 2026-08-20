// Platform Activation Slice 2, WP 2.6: the client cutover's own test suite for
// src/lib/requestPhotos.js, rewritten alongside its rewrite. Uploads now write through the
// Document Engine's own request subject (api.create_document_for_request(), 0149); reads
// split across two id spaces via an explicit `legacy` flag rather than guessing from the
// id itself (see requestPhotos.js's own header for why guessing would be unsafe).
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const uploadMock = vi.fn();
const createSignedUrlsMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), schema: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import { uploadRequestPhoto, fetchRequestPhotos, deleteRequestPhoto } from "../requestPhotos";

function createQueryBuilder(result) {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

const DOCUMENT_ROW = {
  id: "doc-1", owning_workspace_id: "ws-1", type_key: "request_photo",
  storage_bucket: "documents", storage_path: "ws-1/req-1/x.jpg",
  issuer: null, valid_from: null, valid_until: null,
  version_since: "2026-08-06T00:00:00Z", created_at: "2026-08-06T00:00:00Z", updated_at: "2026-08-06T00:00:00Z",
};

const LEGACY_DOCUMENT_ROW = {
  ...DOCUMENT_ROW, id: "doc-legacy-1", storage_bucket: "request-photos", storage_path: "cust/req/y.jpg",
};

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
  vi.mocked(supabase.storage.from).mockReset();
  rpcMock.mockReset();
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ error: null });
  createSignedUrlsMock.mockReset();
  createSignedUrlsMock.mockResolvedValue({ data: [{ signedUrl: "https://signed.example/x.jpg" }], error: null });
  vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls: createSignedUrlsMock, upload: uploadMock, remove: vi.fn() });
});

describe("uploadRequestPhoto", () => {
  it("uploads into the 'documents' bucket rooted under the workspace, not the customer id", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const file = { type: "image/jpeg" };

    await uploadRequestPhoto("req-1", "cust-1", "ws-1", file);

    expect(supabase.storage.from).toHaveBeenCalledWith("documents");
    const [path] = uploadMock.mock.calls[0];
    expect(path.startsWith("ws-1/req-1/")).toBe(true);
  });

  it("calls api.create_document_for_request with the real request/actor identity and the request_photo type", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await uploadRequestPhoto("req-1", "cust-1", "ws-1", { type: "image/jpeg" });

    const call = rpcMock.mock.calls.find(([name]) => name === "create_document_for_request");
    expect(call[1]).toMatchObject({
      p_request_id: "req-1", p_type_key: "request_photo", p_actor_type: "person", p_actor_ref: "cust-1",
    });
    expect(call[1].p_storage_path.startsWith("ws-1/req-1/")).toBe(true);
  });

  it("throws the storage error without calling create_document_for_request", async () => {
    uploadMock.mockResolvedValue({ error: new Error("upload failed") });

    await expect(uploadRequestPhoto("req-1", "cust-1", "ws-1", { type: "image/jpeg" })).rejects.toThrow("upload failed");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("throws create_document_for_request's own error even though the file already uploaded", async () => {
    rpcMock.mockResolvedValue({ error: new Error("denied") });
    await expect(uploadRequestPhoto("req-1", "cust-1", "ws-1", { type: "image/jpeg" })).rejects.toThrow("denied");
  });
});

describe("fetchRequestPhotos", () => {
  it("reads via api.my_documents(p_request_id) by default — a work.requests id", async () => {
    rpcMock.mockResolvedValue({ data: [DOCUMENT_ROW], error: null });

    const result = await fetchRequestPhotos("req-1");

    expect(rpcMock).toHaveBeenCalledWith("my_documents", { p_request_id: "req-1" });
    expect(result).toEqual([{ id: "doc-1", storagePath: "ws-1/req-1/x.jpg", url: "https://signed.example/x.jpg" }]);
  });

  it("signs against the document's own storage_bucket ('documents' for the new path)", async () => {
    rpcMock.mockResolvedValue({ data: [DOCUMENT_ROW], error: null });
    await fetchRequestPhotos("req-1");
    expect(supabase.storage.from).toHaveBeenCalledWith("documents");
  });

  it("reads via api.documents_for_service_request when legacy: true — a lead's own legacy id", async () => {
    rpcMock.mockResolvedValue({ data: [LEGACY_DOCUMENT_ROW], error: null });

    const result = await fetchRequestPhotos("legacy-req-1", { legacy: true });

    expect(rpcMock).toHaveBeenCalledWith("documents_for_service_request", { p_request_id: "legacy-req-1" });
    expect(result).toEqual([{ id: "doc-legacy-1", storagePath: "cust/req/y.jpg", url: "https://signed.example/x.jpg" }]);
  });

  it("signs against the legacy document's own storage_bucket ('request-photos')", async () => {
    rpcMock.mockResolvedValue({ data: [LEGACY_DOCUMENT_ROW], error: null });
    await fetchRequestPhotos("legacy-req-1", { legacy: true });
    expect(supabase.storage.from).toHaveBeenCalledWith("request-photos");
  });

  it("returns an empty array without calling storage when there are no photos", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await fetchRequestPhotos("req-1");
    expect(result).toEqual([]);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("throws the real error instead of swallowing it, for either id space", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(fetchRequestPhotos("req-1")).rejects.toThrow("denied");
    await expect(fetchRequestPhotos("legacy-req-1", { legacy: true })).rejects.toThrow("denied");
  });
});

describe("deleteRequestPhoto", () => {
  it("still targets the legacy table and bucket — unchanged, unreachable from any current UI", async () => {
    const builder = createQueryBuilder({ error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);
    const removeMock = vi.fn();
    vi.mocked(supabase.storage.from).mockReturnValue({ remove: removeMock });

    await deleteRequestPhoto("photo-1", "cust/req/y.jpg");

    expect(supabase.from).toHaveBeenCalledWith("service_request_photos");
    expect(builder.eq).toHaveBeenCalledWith("id", "photo-1");
    expect(supabase.storage.from).toHaveBeenCalledWith("request-photos");
    expect(removeMock).toHaveBeenCalledWith(["cust/req/y.jpg"]);
  });
});
