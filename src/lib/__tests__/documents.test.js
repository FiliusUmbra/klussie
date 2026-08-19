// Platform Activation Slice 1, WP 1.8 — the client side of api.create_document()
// (migration 0141, WP 1.6): upload first, then the row, and clean up an orphaned
// upload if the row create fails.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import { createDocument } from "../documents";

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
});
