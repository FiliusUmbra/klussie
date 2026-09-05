// Keeps 0200_restore_my_assets_active_only_filter.sql inside its own reasoning: 0161
// silently dropped 0054's "active assets only" filter from property.my_assets() while
// adding its own scoped-access branch, and this migration restores it without touching
// anything else 0161 added — confirmed live on staging before this migration was written
// (a retired asset kept appearing in "Mijn spullen").
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0200_restore_my_assets_active_only_filter.sql";

const raw = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0200_restore_my_assets_active_only_filter migration", () => {
  it("re-adds the active-only filter to property.my_assets()", () => {
    const start = codeNoComments.indexOf("create or replace function property.my_assets");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/a\.lifecycle_state = 'active'/);
  });

  it("keeps 0161's scoped-access branch alongside the restored filter -- this is an addition, not a revert", () => {
    const start = codeNoComments.indexOf("create or replace function property.my_assets");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/workspace\.current_memberships\(\)/);
    expect(block).toMatch(/workspace\.current_property_scope\(\)/);
  });

  it("does not touch api.my_assets() -- it stays a bare pass-through and inherits the fix for free", () => {
    expect(code).not.toMatch(/create or replace function api\.my_assets/);
    expect(code).not.toMatch(/drop function.*my_assets/i);
  });

  it("does not touch retire_asset()/update_asset() or any other write path", () => {
    expect(code).not.toMatch(/retire_asset|update_asset|dispose_asset|create_asset/);
  });

  it("keeps property.my_assets()'s exact single-argument signature -- same-signature replace, no grants to reissue", () => {
    expect(code).toMatch(/create or replace function property\.my_assets\(p_property_id uuid\)/);
    expect(code).not.toMatch(/revoke|grant/i);
  });

  it("keeps search_path empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(1);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("filters to 'active' -- the value property.assets.lifecycle_state's own check constraint (0048) actually uses, not 'retired' or 'disposed'", () => {
    expect(code).not.toMatch(/lifecycle_state = 'retired'/);
    expect(code).not.toMatch(/lifecycle_state = 'disposed'/);
    expect(code).not.toMatch(/lifecycle_state <> 'retired'/);
  });
});
