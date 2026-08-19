// Keeps 0041_property_contract.sql inside ADR-0026's split and self-enforcing by
// construction, the same way workspace.resolve_context() (migration 0036) is: a caller
// with no live membership in a property's current steward gets no row, regardless of RLS.
//
// Structural. Behaviour is proven against staging by VERIFY_PROPERTY_CONTRACT.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0041_property_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0041_property_contract migration", () => {
  it("makes my_properties parameterless — the discovery function, mirroring list_my_workspaces", () => {
    expect(code).toMatch(/create or replace function property\.my_properties\(\s*\)/i);
    expect(code).toMatch(/create or replace function api\.my_properties\(\s*\)/i);
  });

  it("makes my_properties' delegate SECURITY DEFINER and STABLE, with a locked search_path", () => {
    const delegateStart = code.indexOf("create or replace function api.my_properties");
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);
    expect(delegateBlock).toMatch(/\bstable\b/i);
    expect(delegateBlock).toMatch(/\bsecurity definer\b/i);
    expect(delegateBlock).toMatch(/set search_path = ''/);
  });

  it("grants my_properties' delegate to authenticated only", () => {
    expect(code).toMatch(/revoke all on function api\.my_properties\(\) from public, anon, service_role/i);
    expect(code).toMatch(/grant execute on function api\.my_properties\(\) to authenticated/i);
    expect(code).toMatch(
      /revoke all on function property\.my_properties\(\) from public, anon, authenticated, service_role/i
    );
  });

  it("joins against workspace.current_memberships() rather than reading property.properties unconditionally", () => {
    // The property this test exists to pin: without the join, the function would return
    // any property's state to any authenticated caller who knew its id, and rely entirely
    // on WP 05.05's RLS policy (not yet built when this migration lands) to stop it.
    const logicStart = code.indexOf("create or replace function property.resolve_property");
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);
    expect(logicBlock).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/i);
  });

  it("makes the logic function NOT SECURITY DEFINER, and grants it to nobody", () => {
    const logicStart = code.indexOf("create or replace function property.resolve_property");
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);
    expect(logicBlock).toMatch(/\bstable\b/i);
    expect(logicBlock).not.toMatch(/\bsecurity definer\b/i);
    expect(logicBlock).toMatch(/set search_path = ''/);

    expect(code).toMatch(
      /revoke all on function property\.resolve_property\(uuid\) from public, anon, authenticated, service_role/i
    );
  });

  it("makes the delegate SECURITY DEFINER and STABLE, with a locked search_path", () => {
    const delegateStart = code.indexOf("create or replace function api.resolve_property");
    expect(delegateStart).toBeGreaterThan(-1);
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);

    expect(delegateBlock).toMatch(/\bstable\b/i);
    expect(delegateBlock).toMatch(/\bsecurity definer\b/i);
    expect(delegateBlock).toMatch(/set search_path = ''/);
  });

  it("delegates to the engine logic and holds no logic of its own", () => {
    const delegateStart = code.indexOf("create or replace function api.resolve_property");
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);
    expect(delegateBlock).toMatch(/select \* from property\.resolve_property\(p_property_id\)/i);
  });

  it("revokes the delegate from anon and service_role, grants only authenticated", () => {
    expect(code).toMatch(/revoke all on function api\.resolve_property\(uuid\) from public, anon, service_role/i);
    expect(code).toMatch(/grant execute on function api\.resolve_property\(uuid\) to authenticated/i);
  });

  it("declares no decide_permission analog — nothing in this epic has a gated action yet", () => {
    expect(code).not.toMatch(/decide_permission/i);
  });

  it("touches no table — pure read logic", () => {
    expect(code).not.toMatch(/\bcreate table\b/i);
    expect(code).not.toMatch(/\binsert into\b/i);
  });
});
