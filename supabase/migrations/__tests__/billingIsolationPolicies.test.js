// Keeps 0100_billing_isolation_policies.sql inside §22's own rule: invoices visible to
// the workspace or its distinct payer, credits following their parent invoice one join
// deep, payments an ordinary direct-membership check.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0100_billing_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0100_billing_isolation_policies migration", () => {
  it("creates exactly three policies, one per table", () => {
    const created = [...code.matchAll(/create policy "[^"]+"\s*\n\s*on (commerce\.\w+)/g)];
    expect(created.map((m) => m[1]).sort()).toEqual(["commerce.credits", "commerce.invoices", "commerce.payments"]);
  });

  it("invoices combines workspace_id OR payer_workspace_id, both direct membership checks", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view invoices"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).toMatch(/\bor\s+payer_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
  });

  it("credits follows its parent invoice's own combined predicate, one join deep", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view credits"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/invoice_id in \(/);
    expect(block).toMatch(/i\.workspace_id in \(/);
    expect(block).toMatch(/\bor\s+i\.payer_workspace_id in \(/);
  });

  it("payments is ordinary direct membership on workspace_id only", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view payments"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).not.toMatch(/\bor\b/);
  });

  it("every policy is select-only, to authenticated", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on commerce\.\w+ for (\w+)\s*\n\s*to (\w+)/g)];
    expect(policies.length).toBe(3);
    for (const [, action, role] of policies) {
      expect(action).toBe("select");
      expect(role).toBe("authenticated");
    }
  });
});
