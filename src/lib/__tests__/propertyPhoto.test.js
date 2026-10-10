import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSession = vi.fn();
vi.mock("../supabaseClient", () => ({ supabase: { auth: { getSession: (...a) => getSession(...a) } } }));

import { fetchPropertyPhotoUrl, clearPropertyPhotoCache } from "../propertyPhoto.js";

let fetchMock;
beforeEach(() => {
  clearPropertyPhotoCache();
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "tok" } } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

const imageResponse = () => ({ ok: true, headers: { get: () => "image/jpeg" }, blob: () => Promise.resolve(new Blob(["x"])) });

describe("fetchPropertyPhotoUrl", () => {
  it("returns an object URL for a real image, sending the session token", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    expect(await fetchPropertyPhotoUrl("p1")).toBe("blob:photo");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/property-photo?propertyId=p1");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("returns null — the normal answer — for not configured, no imagery, signed out, a non-image reply or a failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await fetchPropertyPhotoUrl("a")).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, headers: { get: () => "text/html" } });
    expect(await fetchPropertyPhotoUrl("b")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchPropertyPhotoUrl("c")).toBeNull();
    getSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await fetchPropertyPhotoUrl("d")).toBeNull();
    expect(await fetchPropertyPhotoUrl(null)).toBeNull();
  });

  it("asks once per property per page — including remembering a null — because every real image is billed", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await fetchPropertyPhotoUrl("p1");
    await fetchPropertyPhotoUrl("p1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
