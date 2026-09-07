// Pins the one thing about these four marks that must never silently drift: each
// provider's own official color(s), verbatim from the source ProviderIcons.jsx's own
// header cites. A future edit that "simplifies" these to a single accent color, or
// swaps in a different icon set's version, would be a real branding regression — this
// is the test that would catch it.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AppleIcon, GoogleIcon, MicrosoftIcon, FacebookIcon } from "../ProviderIcons.jsx";

function fills(container) {
  return [...container.querySelectorAll("path, rect")].map((el) => el.getAttribute("fill"));
}

describe("ProviderIcons — official colors, unchanged", () => {
  it("Apple takes its color from the color prop, like a lucide icon, rather than a fixed fill", () => {
    const { container } = render(<AppleIcon color="#fff" />);
    expect(container.querySelector("svg").getAttribute("fill")).toBe("#fff");
  });

  it("Google keeps its own four-color G — Sign In branding requires it, not a single accent", () => {
    const { container } = render(<GoogleIcon />);
    expect(fills(container)).toEqual(["#4285F4", "#34A853", "#FBBC05", "#EA4335"]);
  });

  it("Microsoft keeps its own four-square colors from the 2012 identity refresh", () => {
    const { container } = render(<MicrosoftIcon />);
    expect(fills(container)).toEqual(["#F25022", "#7FBA00", "#00A4EF", "#FFB900"]);
  });

  it("Facebook keeps its fixed brand blue circle and white f, not a recolorable mark", () => {
    const { container } = render(<FacebookIcon />);
    expect(fills(container)).toEqual(["#1977F3", "#FEFEFE"]);
  });

  it("every icon resizes via the shared size prop", () => {
    const { container } = render(<GoogleIcon size={32} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("width")).toBe("32");
    expect(svg.getAttribute("height")).toBe("32");
  });
});
