import { describe, it, expect } from "vitest";
import { requestTitle } from "../requestTitle.js";

const known = () => ({ name: "Plumbing" });
const unknown = () => ({ name: "" });

describe("requestTitle", () => {
  it("prefers the catalog name", () => {
    expect(requestTitle({ serviceId: "a", answers: { details: "leak" } }, known)).toBe("Plumbing");
  });
  it("falls back to the customer's own words when the service isn't in the catalog", () => {
    expect(requestTitle({ serviceId: "gone", answers: { details: "  The   tap leaks " } }, unknown)).toBe("The tap leaks");
  });
  it("truncates a long description with an ellipsis", () => {
    const out = requestTitle({ serviceId: "gone", answers: { details: "x".repeat(100) } }, unknown);
    expect(out.length).toBe(40);
    expect(out.endsWith("…")).toBe(true);
  });
  it("uses the provided fallback last, and never throws on missing answers", () => {
    expect(requestTitle({ serviceId: "gone" }, unknown, "Requests")).toBe("Requests");
    expect(requestTitle({ serviceId: "gone" }, () => undefined)).toBe("");
  });
});
