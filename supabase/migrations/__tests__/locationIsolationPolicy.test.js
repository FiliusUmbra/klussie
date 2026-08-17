// Keeps 0045_location_isolation_policy.sql inside ADR-0026/0028: the isolation predicate
// reuses api.current_workspace_memberships() through a join to property.properties, never
// a location- or property-specific resolver.
//
// Structural. Behaviour is proven against staging by VERIFY_LOCATION_ISOLATION_POLICY.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0045_location_isolation_policy.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0045_location_isolation_policy migration", () => {
  it("adds exactly one SELECT policy on property.locations", () => {
    expect(code).toMatch(
      /create policy "workspace members can view locations"\s+on property\.locations for select/i
    );
    const policies = [...code.matchAll(/create policy/gi)];
    expect(policies).toHaveLength(1);
  });

  it("joins through property.properties.steward_workspace_id rather than a location-level column", () => {
    expect(code).toMatch(/property_id in \(\s*select p\.id from property\.properties p/i);
    expect(code).toMatch(/p\.steward_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i);
  });

  it("uses no location- or property-specific membership resolver", () => {
    expect(code).not.toMatch(/current_stewardships|is_property_steward|is_location_/i);
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
    expect(code).toMatch(/drop policy if exists "workspace members can view locations" on property\.locations/i);
  });

  it("touches no other table", () => {
    expect(code).not.toMatch(/on (?!property\.locations)[a-z_]+\.[a-z_]+ for select/i);
  });
});
