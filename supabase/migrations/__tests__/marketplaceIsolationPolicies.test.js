// Keeps 0088_marketplace_isolation_policies.sql inside §19's visibility rules: requests
// are direct-owner-only, quotes and engagements are each visible to either party.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0088_marketplace_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0088_marketplace_isolation_policies migration", () => {
  it("creates exactly three policies, one per table", () => {
    const created = [...code.matchAll(/create policy "[^"]+"\s*\n\s*on (work\.\w+)/g)];
    expect(created.map((m) => m[1]).sort()).toEqual(["work.engagements", "work.quotes", "work.requests"]);
  });

  it("requests is ordinary direct membership on requesting_workspace_id only", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view requests"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/requesting_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).not.toMatch(/\bor\b/);
  });

  it("quotes combines offering_workspace_id membership OR the requester's own request", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view quotes"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/offering_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).toMatch(/\bor\s+request_id in \(/);
    expect(block).toMatch(/r\.requesting_workspace_id in \(/);
  });

  it("engagements combines both parties' direct membership with or, no joins needed", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view engagements"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/requesting_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).toMatch(/\bor\s+performing_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).not.toMatch(/\bselect\b.*\bfrom work\./); // no subquery join needed for either side
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
