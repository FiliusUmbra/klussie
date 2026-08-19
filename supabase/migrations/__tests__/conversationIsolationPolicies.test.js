// Keeps 0094_conversation_isolation_policies.sql inside DESIGN_REVIEW.md's own
// correction: participation, not workspace membership, is the isolation boundary, and
// only active (left_at is null) participation grants visibility.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0094_conversation_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0094_conversation_isolation_policies migration", () => {
  it("creates exactly three policies, one per table", () => {
    const created = [...code.matchAll(/create policy "[^"]+"\s*\n\s*on (work\.\w+)/g)];
    expect(created.map((m) => m[1]).sort()).toEqual([
      "work.conversation_participants",
      "work.conversations",
      "work.messages",
    ]);
  });

  it("never reuses api.current_workspace_memberships() — deliberately a different resolver", () => {
    expect(codeNoComments).not.toMatch(/current_workspace_memberships/);
    expect(codeNoComments).toMatch(/public\.current_identity\(\)/);
  });

  it("every policy checks person_ref via public.current_identity() and left_at is null", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on work\.\w+ for select\s*\n\s*to authenticated\s*\n\s*using \(([\s\S]*?)\);/g)];
    expect(policies.length).toBe(3);
    for (const [, predicate] of policies) {
      expect(predicate).toMatch(/cp\.person_ref in \(select person_ref from public\.current_identity\(\)\)/);
      expect(predicate).toMatch(/cp\.left_at is null/);
    }
  });

  it("every policy is select-only, to authenticated", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on work\.\w+ for (\w+)\s*\n\s*to (\w+)/g)];
    expect(policies.length).toBe(3);
    for (const [, action, role] of policies) {
      expect(action).toBe("select");
      expect(role).toBe("authenticated");
    }
  });
});
