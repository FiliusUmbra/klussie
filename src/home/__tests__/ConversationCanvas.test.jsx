// ConversationCanvas.jsx's own tests — none existed before this.
//
// Found by code audit, 2026-09-11: convReliefSub and convBookCta both used to be built
// with a raw `.replace("{name}", ...)` instead of the already-imported interpolate() —
// String.replace's own string-pattern overload only substitutes the FIRST occurrence a
// template contains, unlike interpolate(). No shipped locale currently repeats {name}
// in either string, so this never actually rendered broken output — but nothing
// enforced that, and a future translation naming the pro twice (grammatically
// ordinary — "so-and-so has everything; you'll hear from so-and-so soon") would have
// silently shipped one unsubstituted "{name}" straight to a customer.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationCanvas } from "../ConversationCanvas.jsx";

// Returns each key as itself, matching this codebase's own established test idiom,
// except for the two keys each test below overrides with a real, twice-repeating
// template.
function makeT(overrides) {
  return new Proxy({}, { get: (_, key) => overrides[key] ?? String(key) });
}

const PRO = { id: "pro-1", name: "Pierre Pro", avatarUrl: null, initials: "PP", badgeTier: null, rating: 4.5, reviews: 12 };

const BASE_PROPS = {
  fmt: (n) => String(n),
  serviceInfo: () => ({ name: "Plumbing" }),
  proBadgeLabel: () => null,
  onBook: vi.fn(),
  onContinue: vi.fn(),
};

describe("ConversationCanvas — every occurrence of {name} gets substituted, not just the first", () => {
  it("in the relief message once the request is booked", () => {
    const t = makeT({ convReliefSub: "{name} heeft alles. Bedank {name} straks!" });
    render(
      <ConversationCanvas
        {...BASE_PROPS}
        conversation={{ recap: "Leaking pipe", pro: PRO, work: [], analyzing: false, failed: false, analysis: null }}
        booking="done"
        canDirectBook={false}
        t={t}
      />
    );
    expect(screen.getByText("Pierre Pro heeft alles. Bedank Pierre Pro straks!")).toBeTruthy();
    expect(screen.queryByText(/\{name\}/)).toBeNull();
  });

  it("in the direct-book button's own label", () => {
    const t = makeT({ convBookCta: "Boek {name} — {name} is beschikbaar" });
    render(
      <ConversationCanvas
        {...BASE_PROPS}
        conversation={{ recap: "Leaking pipe", pro: PRO, work: [], analyzing: false, failed: false, analysis: null }}
        booking="idle"
        canDirectBook={true}
        t={t}
      />
    );
    expect(screen.getByText("Boek Pierre Pro — Pierre Pro is beschikbaar")).toBeTruthy();
    expect(screen.queryByText(/\{name\}/)).toBeNull();
  });
});
