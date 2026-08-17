// Keeps 0051_asset_contract.sql inside ADR-0026's split, self-enforcing by construction
// (the same way property.resolve_property() already is), and scoped deliberately narrow —
// no facets, no placement history, no decide_permission analog — with the reasons stated
// in the migration's own header rather than left to be rediscovered.
//
// Structural. Behaviour is proven against staging by VERIFY_ASSET_CONTRACT.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0051_asset_contract.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function fnBlock(name) {
  const start = code.indexOf(`create or replace function ${name}`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf("$$;", start) + 3);
}

describe("0051_asset_contract migration", () => {
  it("defines both logic functions and both api delegates", () => {
    const created = [...code.matchAll(/create or replace function ([\w.]+)\(/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "api.my_assets",
      "api.resolve_asset",
      "property.my_assets",
      "property.resolve_asset",
    ]);
  });

  it("both logic functions join through property.properties to workspace.current_memberships() — self-enforcing", () => {
    for (const name of ["property.my_assets", "property.resolve_asset"]) {
      const block = fnBlock(name);
      expect(block).toMatch(/join property\.properties p on p\.id = a\.property_id/i);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/i);
    }
  });

  it("neither logic function is SECURITY DEFINER; both delegates are", () => {
    for (const name of ["property.my_assets", "property.resolve_asset"]) {
      expect(fnBlock(name)).not.toMatch(/\bsecurity definer\b/i);
    }
    for (const name of ["api.my_assets", "api.resolve_asset"]) {
      const block = fnBlock(name);
      expect(block).toMatch(/\bsecurity definer\b/i);
      expect(block).toMatch(/\bstable\b/i);
      expect(block).toMatch(/set search_path = ''/);
    }
  });

  it("both delegates hold no logic of their own", () => {
    expect(fnBlock("api.my_assets")).toMatch(/select \* from property\.my_assets\(p_property_id\)/i);
    expect(fnBlock("api.resolve_asset")).toMatch(/select \* from property\.resolve_asset\(p_asset_id\)/i);
  });

  it("returns no facets and no placement history — core columns only", () => {
    for (const name of ["property.my_assets", "property.resolve_asset"]) {
      const block = fnBlock(name);
      expect(block).not.toMatch(/facet/i);
      expect(block).not.toMatch(/placement/i);
    }
  });

  it("declares no decide_permission analog", () => {
    expect(code).not.toMatch(/decide_permission/i);
  });

  it("grants both delegates to authenticated only, revoking everything else", () => {
    expect(code).toMatch(/revoke all on function api\.my_assets\(uuid\) from public, anon, service_role/i);
    expect(code).toMatch(/revoke all on function api\.resolve_asset\(uuid\) from public, anon, service_role/i);
    expect(code).toMatch(/grant execute on function api\.my_assets\(uuid\) to authenticated/i);
    expect(code).toMatch(/grant execute on function api\.resolve_asset\(uuid\) to authenticated/i);
    expect(code).toMatch(
      /revoke all on function property\.my_assets\(uuid\) from public, anon, authenticated, service_role/i
    );
    expect(code).toMatch(
      /revoke all on function property\.resolve_asset\(uuid\) from public, anon, authenticated, service_role/i
    );
  });

  it("touches no table — pure read logic", () => {
    expect(code).not.toMatch(/\bcreate table\b/i);
    expect(code).not.toMatch(/\binsert into\b/i);
  });
});
