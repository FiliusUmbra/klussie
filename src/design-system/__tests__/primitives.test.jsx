// primitives.jsx's own tests — none existed before this, for any component in the file.
//
// Found by code audit, 2026-09-11: Rating's own aria-label was a hardcoded English
// template string, in every one of this codebase's own ten real call sites (plus two
// confirmed-dead ones, fixed anyway matching this session's own established precedent).
// The exact "reachable-but-announced-in-the-wrong-language" gap ReviewSheet.jsx's own
// star-picker had, one component over — and this one is far more widely reached: every
// pro card, quote card, review row and profile header in the app renders through it.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Rating } from "../primitives.jsx";

describe("Rating", () => {
  it("uses a caller-supplied, real translated label when one is given", () => {
    render(<Rating value={4.5} label="4,5 van de 5 sterren" />);
    expect(screen.getByRole("img", { name: "4,5 van de 5 sterren" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /out of 5 stars/ })).toBeNull();
  });

  it("falls back to the English literal only when no caller passes a label at all — a last resort, not the normal path", () => {
    render(<Rating value={3} />);
    expect(screen.getByRole("img", { name: "3 out of 5 stars" })).toBeTruthy();
  });
});
