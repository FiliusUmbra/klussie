// RequestPhotosStrip.jsx's own tests — none existed before this.
//
// Found by code audit: fetchRequestPhotos() throws on a real Postgres error and this
// call had no catch of its own — a real unhandled rejection on every failure. Harmless
// for the render (photos stays null, which already renders the same as "no photos"),
// but a real defect anyway: HomePhotoGallery (myHomeParts.jsx), the OTHER caller of this
// exact function, already has the right idiom ("a request whose photos fail to load
// contributes none rather than failing the gallery") and this component didn't.
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const fetchRequestPhotosMock = vi.fn();
vi.mock("../../lib/requestPhotos", () => ({
  fetchRequestPhotos: (...args) => fetchRequestPhotosMock(...args),
}));

import { RequestPhotosStrip } from "../RequestPhotosStrip.jsx";

describe("RequestPhotosStrip", () => {
  it("renders nothing while there are genuinely no photos", async () => {
    fetchRequestPhotosMock.mockResolvedValue([]);
    const { container } = render(<RequestPhotosStrip requestId="req-1" />);

    await waitFor(() => expect(fetchRequestPhotosMock).toHaveBeenCalledWith("req-1", { legacy: false }));
    expect(container.firstChild).toBeNull();
  });

  it("renders the real photos once they resolve", async () => {
    fetchRequestPhotosMock.mockResolvedValue([{ id: "p1", url: "https://example.com/p1.jpg" }]);
    const { container } = render(<RequestPhotosStrip requestId="req-1" />);

    await waitFor(() => expect(container.querySelector(".photo-strip-thumb")).toBeTruthy());
  });

  // The actual regression: a rejected fetch used to be an unhandled promise rejection,
  // with nothing ever calling setPhotos. Now it resolves to an empty list instead — same
  // rendered result (nothing), no unhandled rejection.
  it("degrades to no photos, never an unhandled rejection, when the fetch fails", async () => {
    fetchRequestPhotosMock.mockRejectedValue(new Error("relation \"photos\" does not exist"));
    const { container } = render(<RequestPhotosStrip requestId="req-1" />);

    await waitFor(() => expect(fetchRequestPhotosMock).toHaveBeenCalled());
    // Give the rejected promise's .catch() a tick to settle before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });
});
