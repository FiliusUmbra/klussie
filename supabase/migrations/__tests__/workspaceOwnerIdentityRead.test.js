// Keeps 0151_workspace_owner_identity_read.sql (Platform Activation Slice 2, WP 2.6)
// inside its own stated rules: resolves only professional workspaces' owners, never a
// customer's own personal workspace, and excludes an erased identity.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0151_workspace_owner_identity_read.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0151_workspace_owner_identity_read migration", () => {
  describe("workspace.resolve_owner_auth_user_ids()", () => {
    const block = bodyOf("workspace.resolve_owner_auth_user_ids", codeNoComments);

    it("restricts to professional workspaces only — never a customer's own personal workspace", () => {
      expect(block).toMatch(/w\.type = 'professional'/);
    });

    it("checks a real, active owner membership", () => {
      expect(block).toMatch(/m\.role = 'owner'/);
      expect(block).toMatch(/m\.state = 'active'/);
    });

    it("excludes an erased identity", () => {
      expect(block).toMatch(/i\.erased_at is null/);
    });

    it("is granted to no application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.resolve_owner_auth_user_ids\(uuid\[\]\) from public, anon, authenticated, service_role/
      );
    });
  });

  describe("api.resolve_workspace_owner_auth_ids()", () => {
    const block = bodyOf("api.resolve_workspace_owner_auth_ids", codeNoComments);

    it("is a thin SECURITY DEFINER pass-through", () => {
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/workspace\.resolve_owner_auth_user_ids\(/);
    });

    it("is granted to anon and authenticated, matching resolve_public_professional_workspace()'s own posture", () => {
      expect(codeNoComments).toMatch(
        /grant execute on function api\.resolve_workspace_owner_auth_ids\(uuid\[\]\) to anon, authenticated/
      );
    });
  });
});
