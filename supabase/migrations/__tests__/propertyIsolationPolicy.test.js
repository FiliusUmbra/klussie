// Keeps 0042_property_isolation_policy.sql inside ADR-0028: the isolation predicate
// reuses api.current_workspace_memberships() directly (migration 0031), never a
// property-specific resolver — the regression 0037's own equivalent test guards against,
// checked again here since this is the second table to actually use the predicate in a
// policy.
//
// Structural. Behaviour is proven against staging by VERIFY_PROPERTY_ISOLATION_POLICY.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0042_property_isolation_policy.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0042_property_isolation_policy migration", () => {
  it("adds exactly one SELECT policy on property.properties", () => {
    expect(code).toMatch(
      /create policy "workspace members can view properties"\s+on property\.properties for select/i
    );
    const policies = [...code.matchAll(/create policy/gi)];
    expect(policies).toHaveLength(1);
  });

  it("uses api.current_workspace_memberships() directly — no property-specific resolver", () => {
    expect(code).toMatch(
      /steward_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i
    );
    expect(code).not.toMatch(/current_stewardships|is_property_steward/i);
  });

  it("is SELECT only — no INSERT, UPDATE, DELETE or ALL", () => {
    expect(code).toMatch(/for select/i);
    expect(code).not.toMatch(/for (insert|update|delete|all)/i);
    expect(code).not.toMatch(/with check/i);
  });

  it("creates no restrictive policy", () => {
    expect(code).not.toMatch(/\bas restrictive\b/i);
  });

  it("is re-runnable — dropped guardedly before recreation", () => {
    expect(code).toMatch(/drop policy if exists "workspace members can view properties" on property\.properties/i);
  });

  it("touches no other table", () => {
    expect(code).not.toMatch(/on (?!property\.properties)[a-z_]+\.[a-z_]+ for/i);
  });
});
