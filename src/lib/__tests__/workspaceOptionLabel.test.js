import { describe, it, expect } from "vitest";
import { workspaceOptionLabel } from "../workspaceContext.js";

const t = {
  workspaceFallbackHome: "My Home", workspaceFallbackBusiness: "My business",
  workspaceKindHome: "Home", workspaceKindFamily: "Family", workspaceKindBusiness: "Business",
};

// Live review 2026-10-04, item 16: a household, a family and a business were all just names.
describe("workspaceOptionLabel", () => {
  it("appends the kind so a family or a business is never mistaken for a home", () => {
    expect(workspaceOptionLabel({ workspace_name: "Vereecken", workspace_type: "family" }, t)).toBe("Vereecken · Family");
    expect(workspaceOptionLabel({ workspace_name: "Pierre's Painting", workspace_type: "professional" }, t)).toBe("Pierre's Painting · Business");
  });
  it("does not repeat the kind when the name already says it", () => {
    expect(workspaceOptionLabel({ workspace_name: "Home", workspace_type: "personal" }, t)).toBe("Home");
  });
  it("appends the kind to a personal workspace whose name does not say it", () => {
    expect(workspaceOptionLabel({ workspace_name: "My Home", workspace_type: "personal" }, t)).toBe("My Home · Home");
  });
  it("falls back to the plain name for a type with no kind label", () => {
    expect(workspaceOptionLabel({ workspace_name: "Ops", workspace_type: "operations" }, t)).toBe("Ops");
  });
});
