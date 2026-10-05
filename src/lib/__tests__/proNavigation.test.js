import { describe, it, expect } from "vitest";
import { proTabFromPath, proPath, isFamilyPath, familySectionFromPath, familyPath } from "../proNavigation.js";

describe("professional tab addresses", () => {
  it("round-trips every tab through its own address", () => {
    for (const tab of ["dashboard", "jobs", "business", "messages", "profile"]) {
      expect(proTabFromPath(proPath(tab))).toBe(tab);
    }
  });
  it("keeps professional paths apart from the customer ones", () => {
    expect(proPath("messages")).toBe("/app/pro/messages");
    expect(proTabFromPath("/app/messages")).toBe("dashboard");
  });
  it("falls back to the dashboard for an unknown path", () => {
    expect(proTabFromPath("/app")).toBe("dashboard");
    expect(proTabFromPath("/app/pro/nonsense")).toBe("dashboard");
  });
});

describe("family section addresses", () => {
  it("recognises the family root and any section under it", () => {
    expect(isFamilyPath("/app/family")).toBe(true);
    expect(isFamilyPath("/app/family/lists")).toBe(true);
    expect(isFamilyPath("/app/familyx")).toBe(false);
    expect(isFamilyPath("/app/home")).toBe(false);
  });
  it("round-trips every section; Today is the bare family address", () => {
    expect(familyPath("today")).toBe("/app/family");
    for (const s of ["lists", "chores", "calendar", "people"]) {
      expect(familySectionFromPath(familyPath(s))).toBe(s);
    }
    expect(familySectionFromPath("/app/family")).toBe("today");
  });
  it("ignores an unknown section", () => {
    expect(familySectionFromPath("/app/family/secret")).toBe("today");
    expect(familyPath("secret")).toBe("/app/family");
  });
});
