// Epic 08 WP09 — the read switch for fetchPortfolioItems, completed once §5.6's own gap
// (caption had no home on property.documents) was resolved in 0064. Resolving the pro's
// own Professional Workspace id (0065) comes first; either resolver failing falls back to
// the original direct table read, silently to the caller either way.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), schema: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import { fetchPortfolioItems } from "../portfolio";

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
  id: "doc-1", owning_workspace_id: "ws-1", type_key: "portfolio_photo",
  storage_bucket: "portfolio", storage_path: "pro-1/x.jpg", caption: "Nice tiling job",
  created_at: "2026-08-06T00:00:00Z",
};

const LEGACY_ROW = {
  id: "item-1", image_url: "https://legacy.example/x.jpg", storage_path: "pro-1/x.jpg",
  caption: "Legacy caption", created_at: "2026-08-06T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
  vi.mocked(supabase.storage.from).mockReset();
  rpcMock.mockReset();
  getPublicUrlMock.mockReset();
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://public.example/x.jpg" } });
  vi.mocked(supabase.storage.from).mockReturnValue({ getPublicUrl: getPublicUrlMock });
});

describe("fetchPortfolioItems", () => {
  it("resolves the pro's workspace, then reads via api.my_documents(), not the legacy table", async () => {
    rpcMock.mockImplementation((fn) =>
      fn === "resolve_public_professional_workspace"
        ? Promise.resolve({ data: "ws-1", error: null })
        : Promise.resolve({ data: [DOCUMENT_ROW], error: null })
    );

    const result = await fetchPortfolioItems("pro-1");

    expect(rpcMock).toHaveBeenCalledWith("resolve_public_professional_workspace", { p_pro_id: "pro-1" });
    expect(rpcMock).toHaveBeenCalledWith("my_documents", { p_workspace_id: "ws-1" });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result).toEqual([{
      id: "doc-1", image_url: "https://public.example/x.jpg", storage_path: "pro-1/x.jpg",
      caption: "Nice tiling job", created_at: "2026-08-06T00:00:00Z",
    }]);
  });

  it("rebuilds a public URL from storage_bucket/storage_path rather than expecting one from the document row", async () => {
    rpcMock.mockImplementation((fn) =>
      fn === "resolve_public_professional_workspace"
        ? Promise.resolve({ data: "ws-1", error: null })
        : Promise.resolve({ data: [DOCUMENT_ROW], error: null })
    );

    await fetchPortfolioItems("pro-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("portfolio");
    expect(getPublicUrlMock).toHaveBeenCalledWith("pro-1/x.jpg");
  });

  it("falls back to the legacy table when the workspace resolver returns nothing", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const builder = createQueryBuilder({ data: [LEGACY_ROW], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    const result = await fetchPortfolioItems("pro-1");

    expect(supabase.from).toHaveBeenCalledWith("portfolio_items");
    expect(builder.eq).toHaveBeenCalledWith("pro_id", "pro-1");
    expect(result).toEqual([LEGACY_ROW]);
  });

  it("falls back to the legacy table when the document-engine rpc itself errors", async () => {
    rpcMock.mockImplementation((fn) =>
      fn === "resolve_public_professional_workspace"
        ? Promise.resolve({ data: "ws-1", error: null })
        : Promise.resolve({ data: null, error: new Error("relation does not exist") })
    );
    const builder = createQueryBuilder({ data: [LEGACY_ROW], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    const result = await fetchPortfolioItems("pro-1");

    expect(result).toEqual([LEGACY_ROW]);
  });

  it("orders documents newest first, matching the legacy query's own order", async () => {
    const older = { ...DOCUMENT_ROW, id: "doc-old", created_at: "2026-08-01T00:00:00Z" };
    const newer = { ...DOCUMENT_ROW, id: "doc-new", created_at: "2026-08-10T00:00:00Z" };
    rpcMock.mockImplementation((fn) =>
      fn === "resolve_public_professional_workspace"
        ? Promise.resolve({ data: "ws-1", error: null })
        : Promise.resolve({ data: [older, newer], error: null })
    );

    const result = await fetchPortfolioItems("pro-1");

    expect(result.map((r) => r.id)).toEqual(["doc-new", "doc-old"]);
  });

  it("still throws when the legacy fallback itself errors — a real failure is never swallowed", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: null, error: new Error("denied") }));

    await expect(fetchPortfolioItems("pro-1")).rejects.toThrow("denied");
  });
});
