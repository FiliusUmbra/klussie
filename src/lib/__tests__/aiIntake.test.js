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
import { analyzeJobRequest, startAudioLevelMeter } from "../aiIntake.js";

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

// Found by code audit: VoiceCapturePanel.jsx calls its meter's stop() twice on every
// normal capture-then-continue flow -- once from its own Stop button handler, again from
// the effect's unmount cleanup once the parent stops rendering the panel. Real
// AudioContext.close() throws InvalidStateError on an already-closed context; nothing in
// this codebase's existing tests catches it because every component test mocks
// startAudioLevelMeter away entirely (jsdom has no real AudioContext/getUserMedia at
// all) -- this is the first test to exercise the real implementation.
describe("startAudioLevelMeter — its own stop() is idempotent", () => {
  class FakeAudioContext {
    createAnalyser() {
      return { fftSize: 256, frequencyBinCount: 32, getByteTimeDomainData: () => {} };
    }
    createMediaStreamSource() {
      return { connect: () => {} };
    }
    close() {
      if (this._closed) throw new DOMException("Cannot close a closed AudioContext.", "InvalidStateError");
      this._closed = true;
    }
  }

  beforeEach(() => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(() => Promise.resolve({
          getTracks: () => [{ stop: vi.fn() }, { stop: vi.fn() }],
        })),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not throw when stopped twice — the real shape VoiceCapturePanel.jsx's own Stop button plus its unmount cleanup produce", async () => {
    const meter = await startAudioLevelMeter({ onLevel: () => {} });

    expect(() => meter.stop()).not.toThrow();
    expect(() => meter.stop()).not.toThrow();
  });

  it("stops every audio track exactly once, even when stop() is called twice", async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    navigator.mediaDevices.getUserMedia.mockResolvedValueOnce({ getTracks: () => tracks });

    const meter = await startAudioLevelMeter({ onLevel: () => {} });
    meter.stop();
    meter.stop();

    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
