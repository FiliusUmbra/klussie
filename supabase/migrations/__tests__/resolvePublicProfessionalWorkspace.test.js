// Keeps 0065_resolve_public_professional_workspace.sql inside its own stated reasoning:
// public, because it resolves a fact about an already-public pro profile, not a private
// one — visibility of anything real is still enforced by api.my_documents() separately.
//
// Structural. Behaviour is proven against staging by
// VERIFY_RESOLVE_PUBLIC_PROFESSIONAL_WORKSPACE.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0065_resolve_public_professional_workspace.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0065_resolve_public_professional_workspace migration", () => {
  it("lives in workspace, not property — resolving a membership is the workspace engine's own concern", () => {
    expect(code).toMatch(/create or replace function workspace\.resolve_public_professional_workspace/i);
    expect(code).not.toMatch(/create or replace function property\.resolve_public_professional_workspace/i);
  });

  it("resolves via the established identity-to-workspace chain, scoped to professional/owner/active", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.resolve_public_professional_workspace");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/from identity\.identities i/);
    expect(block).toMatch(/where i\.auth_user_id = p_pro_id/);
    expect(block).toMatch(/m\.role = 'owner'/);
    expect(block).toMatch(/m\.state = 'active'/);
    expect(block).toMatch(/w\.type = 'professional'/);
  });

  it("the delegate is granted to anon as well as authenticated — a deliberate, explained exception", () => {
    expect(code).toMatch(/grant execute on function api\.resolve_public_professional_workspace\(uuid\) to anon, authenticated/i);
  });

  it("the engine function itself is granted to nobody", () => {
    expect(code).toMatch(
      /revoke all on function workspace\.resolve_public_professional_workspace\(uuid\) from public, anon, authenticated, service_role/i
    );
  });

  it("both functions keep search_path empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(2);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});
