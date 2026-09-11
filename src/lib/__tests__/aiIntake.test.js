// analyzeJobRequest()'s own photo-compression step — none of aiIntake.js was under test
// before this. Scoped narrowly to the one real regression found by code audit: the
// success path of fileToCompressedBase64() (not exported; exercised only through
// analyzeJobRequest(), the same way AiIntakeSheet.jsx itself only ever calls it)
// already revoked its own object URL once the image decoded, but the failure path
// (img.onerror, the one case a corrupted or unreadable photo actually hits) didn't --
// leaking a blob URL instead of ever freeing it. supabaseClient.js is lazily
// constructed (see that file's own header), so this needs no mock of it: the photo
// step runs, and rejects, before analyzeJobRequest() ever touches supabase.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeJobRequest } from "../aiIntake.js";

describe("analyzeJobRequest — photo compression's own object URL cleanup", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-photo");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokes the object URL when the image fails to decode, not only when it succeeds", async () => {
    // A minimal stand-in for the real <img> element: setting .src simulates a
    // corrupted/unreadable photo by firing the onerror handler already assigned to it,
    // exactly the case the real onerror path exists to handle.
    vi.stubGlobal("Image", class {
      set src(_url) {
        queueMicrotask(() => this.onerror(new Event("error")));
      }
    });

    const file = new File(["not a real image"], "corrupt.jpg", { type: "image/jpeg" });

    await expect(analyzeJobRequest({ photos: [file], services: [] })).rejects.toBeTruthy();

    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-photo");
  });
});
