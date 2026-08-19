// Epic 08 WP09 — the read switch for fetchRequestPhotos. api.documents_for_service_request()
// is tried first; a resolver failure (migrations not applied, or the caller has no
// session) falls back to the original direct table read, silently to the caller either
// way — the same fallback discipline every read switch since Epic 03 WP 03.11 has used.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const createSignedUrlsMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), schema: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import { fetchRequestPhotos } from "../requestPhotos";

function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

const DOCUMENT_ROW = {
  id: "doc-1", owning_workspace_id: "ws-1", type_key: "request_photo",
  storage_bucket: "request-photos", storage_path: "cust/req/x.jpg",
  issuer: null, valid_from: null, valid_until: null,
  version_since: "2026-08-06T00:00:00Z", created_at: "2026-08-06T00:00:00Z", updated_at: "2026-08-06T00:00:00Z",
};

const LEGACY_ROW = { id: "photo-1", storage_path: "cust/req/y.jpg", created_at: "2026-08-06T00:00:00Z" };

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
  vi.mocked(supabase.storage.from).mockReset();
  rpcMock.mockReset();
  createSignedUrlsMock.mockReset();
  createSignedUrlsMock.mockResolvedValue({ data: [{ signedUrl: "https://signed.example/x.jpg" }], error: null });
  vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls: createSignedUrlsMock });
});

describe("fetchRequestPhotos", () => {
  it("reads via api.documents_for_service_request() when it succeeds, not the legacy table", async () => {
    rpcMock.mockResolvedValue({ data: [DOCUMENT_ROW], error: null });

    const result = await fetchRequestPhotos("req-1");

    expect(supabase.schema).toHaveBeenCalledWith("api");
    expect(rpcMock).toHaveBeenCalledWith("documents_for_service_request", { p_request_id: "req-1" });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: "doc-1", storagePath: "cust/req/x.jpg", url: "https://signed.example/x.jpg" }]);
  });

  it("signs against the document's own storage_bucket, not a hardcoded one", async () => {
    rpcMock.mockResolvedValue({ data: [DOCUMENT_ROW], error: null });

    await fetchRequestPhotos("req-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("request-photos");
  });

  it("falls back to the legacy table when the document engine rpc fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("relation does not exist") });
    const builder = createQueryBuilder({ data: [LEGACY_ROW], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    const result = await fetchRequestPhotos("req-1");

    expect(supabase.from).toHaveBeenCalledWith("service_request_photos");
    expect(builder.eq).toHaveBeenCalledWith("request_id", "req-1");
    expect(result).toEqual([{ id: "photo-1", storagePath: "cust/req/y.jpg", url: "https://signed.example/x.jpg" }]);
  });

  it("falls back when the rpc call itself throws (e.g. no session)", async () => {
    rpcMock.mockRejectedValue(new Error("no session"));
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    const result = await fetchRequestPhotos("req-1");

    expect(result).toEqual([]);
  });

  it("returns an empty array without calling storage when there are no photos", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await fetchRequestPhotos("req-1");

    expect(result).toEqual([]);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("still throws when the legacy fallback itself errors — a real failure is never swallowed", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("not found") });
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: null, error: new Error("denied") }));

    await expect(fetchRequestPhotos("req-1")).rejects.toThrow("denied");
  });
});
