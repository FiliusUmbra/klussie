// Platform Activation Slice 1, WP 1.8 — the client side of api.create_document()
// (migration 0141, WP 1.6): upload first, then the row, and clean up an orphaned
// upload if the row create fails.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import { createDocument, fetchDocumentsForAsset } from "../documents";

function createStorageBuilder({ uploadError = null, removeError = null } = {}) {
  return {
    upload: vi.fn(() => Promise.resolve({ error: uploadError })),
    remove: vi.fn(() => Promise.resolve({ error: removeError })),
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
  vi.mocked(supabase.storage.from).mockReset();
});

describe("createDocument", () => {
  it("uploads to the documents bucket at <workspaceId>/<documentId>/<filename>, then creates the row", async () => {
    const storage = createStorageBuilder();
    vi.mocked(supabase.storage.from).mockReturnValue(storage);
    rpcMock.mockResolvedValue({ error: null });
    const file = { name: "warranty.pdf", type: "application/pdf" };

    const result = await createDocument({
      propertyId: "prop-1", workspaceId: "ws-1", actorRef: "owner-1",
      typeKey: "warranty", issuer: "Vaillant", validUntil: "2029-01-20", file,
    });

    expect(supabase.storage.from).toHaveBeenCalledWith("documents");
    const uploadedPath = storage.upload.mock.calls[0][0];
    expect(uploadedPath).toBe(`ws-1/${result.id}/warranty.pdf`);
    expect(storage.upload).toHaveBeenCalledWith(uploadedPath, file, { contentType: "application/pdf" });

    expect(supabase.schema).toHaveBeenCalledWith("api");
    expect(rpcMock).toHaveBeenCalledWith("create_document", expect.objectContaining({
      p_document_id: result.id,
      p_property_id: "prop-1",
      p_type_key: "warranty",
      p_storage_path: uploadedPath,
      p_issuer: "Vaillant",
      p_valid_from: null,
      p_valid_until: "2029-01-20",
      p_actor_type: "person",
      p_actor_ref: "owner-1",
    }));
  });

  it("throws the Storage error and never calls create_document when the upload itself fails", async () => {
    const storage = createStorageBuilder({ uploadError: new Error("storage denied") });
    vi.mocked(supabase.storage.from).mockReturnValue(storage);
    const file = { name: "warranty.pdf", type: "application/pdf" };

    await expect(createDocument({ propertyId: "prop-1", workspaceId: "ws-1", actorRef: "owner-1", typeKey: "warranty", file }))
      .rejects.toThrow("storage denied");

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("cleans up the orphaned upload when create_document itself fails, but still surfaces the real error", async () => {
    const storage = createStorageBuilder();
    vi.mocked(supabase.storage.from).mockReturnValue(storage);
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });
    const file = { name: "warranty.pdf", type: "application/pdf" };

    await expect(createDocument({ propertyId: "prop-1", workspaceId: "ws-1", actorRef: "owner-1", typeKey: "warranty", file }))
      .rejects.toThrow("insufficient_privilege");

    const uploadedPath = storage.upload.mock.calls[0][0];
    expect(storage.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("still throws the real create_document error even if the cleanup remove itself fails", async () => {
    const storage = createStorageBuilder({ removeError: new Error("cleanup also failed") });
    vi.mocked(supabase.storage.from).mockReturnValue(storage);
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });
    const file = { name: "warranty.pdf", type: "application/pdf" };

    await expect(createDocument({ propertyId: "prop-1", workspaceId: "ws-1", actorRef: "owner-1", typeKey: "warranty", file }))
      .rejects.toThrow("insufficient_privilege");
  });

  // "Ask Klussie" slice (0199) — attaching a document to one specific asset instead of
  // the property as a whole.
  it("sends p_asset_id and a null p_property_id when assetId is given, not both subjects", async () => {
    const storage = createStorageBuilder();
    vi.mocked(supabase.storage.from).mockReturnValue(storage);
    rpcMock.mockResolvedValue({ error: null });
    const file = { name: "manual.pdf", type: "application/pdf" };

    await createDocument({ assetId: "asset-1", workspaceId: "ws-1", actorRef: "owner-1", typeKey: "manual", file });

    expect(rpcMock).toHaveBeenCalledWith("create_document", expect.objectContaining({
      p_property_id: null,
      p_asset_id: "asset-1",
      p_type_key: "manual",
    }));
  });

  it("sends a null p_asset_id when only propertyId is given, unchanged from before", async () => {
    const storage = createStorageBuilder();
    vi.mocked(supabase.storage.from).mockReturnValue(storage);
    rpcMock.mockResolvedValue({ error: null });
    const file = { name: "warranty.pdf", type: "application/pdf" };

    await createDocument({ propertyId: "prop-1", workspaceId: "ws-1", actorRef: "owner-1", typeKey: "warranty", file });

    expect(rpcMock).toHaveBeenCalledWith("create_document", expect.objectContaining({
      p_property_id: "prop-1",
      p_asset_id: null,
    }));
  });
});

describe("fetchDocumentsForAsset", () => {
  it("calls my_documents with p_asset_id and reshapes the result", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "doc-1", type_key: "manual", issuer: "Vaillant", valid_from: null, valid_until: "2030-01-01", caption: null }],
      error: null,
    });

    const docs = await fetchDocumentsForAsset("asset-1");

    expect(supabase.schema).toHaveBeenCalledWith("api");
    expect(rpcMock).toHaveBeenCalledWith("my_documents", { p_asset_id: "asset-1" });
    expect(docs).toEqual([{ id: "doc-1", typeKey: "manual", issuer: "Vaillant", validFrom: null, validUntil: "2030-01-01", caption: null }]);
  });

  it("returns an empty list, not a throw, when the read fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("network error") });

    const docs = await fetchDocumentsForAsset("asset-1");

    expect(docs).toEqual([]);
  });
});
