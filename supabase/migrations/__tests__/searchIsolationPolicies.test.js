// Keeps 0122_search_isolation_policies.sql inside §15's own rule: the six ordinary
// domains are membership-gated, provider/global are public once published, and the two
// are never blended into one predicate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0122_search_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0122_search_isolation_policies migration", () => {
  it("creates exactly two policies, both on derived.search_index", () => {
    const created = [...codeNoComments.matchAll(/create policy "([^"]+)"\s*\n\s*on (derived\.\w+)/g)];
    expect(created.length).toBe(2);
    for (const [, , table] of created) {
      expect(table).toBe("derived.search_index");
    }
  });

  it("the ordinary-domain policy excludes provider/global and checks direct membership", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can search');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    expect(block).toMatch(/domain not in \('provider', 'global'\)/);
    expect(block).toMatch(
      /workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
    );
    expect(block).toMatch(/to authenticated/);
  });

  it("the public policy grants anon and authenticated read of published provider/global rows only", () => {
    const start = codeNoComments.indexOf('create policy "published provider and global');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    expect(block).toMatch(/domain in \('provider', 'global'\)/);
    expect(block).toMatch(/is_published = true/);
    expect(block).toMatch(/to anon, authenticated/);
  });

  it("neither policy references the other domain class — no blending", () => {
    const ordinaryStart = codeNoComments.indexOf('create policy "workspace members can search');
    const ordinaryBlock = codeNoComments.slice(ordinaryStart, codeNoComments.indexOf(";", ordinaryStart) + 1);
    expect(ordinaryBlock).not.toMatch(/is_published/);

    const publicStart = codeNoComments.indexOf('create policy "published provider and global');
    const publicBlock = codeNoComments.slice(publicStart, codeNoComments.indexOf(";", publicStart) + 1);
    expect(publicBlock).not.toMatch(/current_workspace_memberships/);
  });
});
