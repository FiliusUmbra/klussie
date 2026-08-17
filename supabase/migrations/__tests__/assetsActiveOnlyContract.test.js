// Keeps 0054_assets_active_only_contract.sql inside Epic 07 WP08's own reasoning: a
// disposed or retired asset must never reach fetchHouseholdItems, because "Mijn spullen" is
// a list of what someone currently owns, not a history of what they used to.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0054_assets_active_only_contract.sql";

const raw = readFileSync(MIGRATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0054_assets_active_only_contract migration", () => {
  it("filters property.my_assets() to active only", () => {
    const start = codeNoComments.indexOf("create or replace function property.my_assets");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/a\.lifecycle_state = 'active'/);
  });

  it("does not touch api.my_assets()'s own filtering — it stays a pass-through to property.my_assets()", () => {
    const start = codeNoComments.indexOf("as $$", codeNoComments.indexOf("create or replace function api.my_assets"));
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/select \* from property\.my_assets\(p_property_id\)/);
    expect(block).not.toMatch(/lifecycle_state/);
  });

  it("does not touch resolve_asset — WP 07.08 has no single-item caller yet", () => {
    expect(code).not.toMatch(/resolve_asset/i);
  });

  it("both functions keep 0051's exact grant shape — nobody on the engine function, authenticated on the delegate", () => {
    expect(code).toMatch(
      /revoke all on function property\.my_assets\(uuid\) from public, anon, authenticated, service_role/i
    );
    expect(code).toMatch(/grant execute on function api\.my_assets\(uuid\) to authenticated/i);
  });

  it("both functions keep search_path empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(2);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});
