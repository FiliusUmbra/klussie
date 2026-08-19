// Keeps 0050_asset_isolation_policies.sql inside ADR-0026/0028: isolation reuses
// api.current_workspace_memberships() through the ownership chain, never a new resolver,
// and asset_placements deliberately gets no policy at all (Historical class, read through
// the engine contract, not a direct grant).
//
// Structural. Behaviour is proven against staging by VERIFY_ASSET_ISOLATION_POLICIES.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0050_asset_isolation_policies.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0050_asset_isolation_policies migration", () => {
  it("adds exactly two policies — assets and asset_facets — and none on asset_placements", () => {
    const policies = [...code.matchAll(/create policy "([^"]+)"\s+on (property\.\w+)/gi)];
    expect(policies.map((m) => m[2]).sort()).toEqual(["property.asset_facets", "property.assets"]);
    expect(code).not.toMatch(/on property\.asset_placements/i);
  });

  it("scopes assets through property_id, one join to steward_workspace_id, no new resolver", () => {
    const start = code.indexOf('create policy "workspace members can view assets"');
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/property_id in \(\s*select p\.id from property\.properties p/i);
    expect(block).toMatch(/p\.steward_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i);
  });

  it("scopes asset_facets one join deeper, through the asset to the property", () => {
    const start = code.indexOf('create policy "workspace members can view asset_facets"');
    const block = code.slice(start);
    expect(block).toMatch(/asset_id in \(\s*select a\.id from property\.assets a/i);
    expect(block).toMatch(/a\.property_id in \(/i);
    expect(block).toMatch(/p\.steward_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i);
  });

  it("uses no asset- or facet-specific membership resolver anywhere", () => {
    expect(code).not.toMatch(/current_stewardships|is_property_steward|is_asset_/i);
  });

  it("is SELECT only, permissive, and re-runnable", () => {
    expect(code).not.toMatch(/for (insert|update|delete|all)/i);
    expect(code).not.toMatch(/with check/i);
    expect(code).not.toMatch(/\bas restrictive\b/i);
    expect(code).toMatch(/drop policy if exists "workspace members can view assets" on property\.assets/i);
    expect(code).toMatch(/drop policy if exists "workspace members can view asset_facets" on property\.asset_facets/i);
  });
});
