// Keeps 0136_location_read_contract.sql (Platform Activation Slice 1, WP 1.1) inside its
// own stated rules: the same two-layer shape as property.my_assets()/api.my_assets(),
// scoped to the caller's own membership, retired locations excluded by default, and the
// tree left for the client to assemble from parent_id/path rather than nested here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0136_location_read_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0136_location_read_contract migration", () => {
  it("property.locations_for_property() is not SECURITY DEFINER, and scopes to the caller's own membership exactly like property.my_assets() does", () => {
    const start = codeNoComments.indexOf("create or replace function property.locations_for_property");
    const end = codeNoComments.indexOf("comment on function property.locations_for_property");
    const block = codeNoComments.slice(start, end);
    expect(block).not.toMatch(/security definer/i);
    expect(block).toMatch(/join property\.properties p on p\.id = l\.property_id/);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/);
  });

  it("excludes retired locations by default", () => {
    const start = codeNoComments.indexOf("create or replace function property.locations_for_property");
    const end = codeNoComments.indexOf("comment on function property.locations_for_property");
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/l\.retired_at is null/);
  });

  it("returns a flat, path-ordered list — id, parent_id, name, type, path — not a nested structure", () => {
    const start = codeNoComments.indexOf("create or replace function property.locations_for_property");
    const returnsBlock = codeNoComments.slice(start, codeNoComments.indexOf("as $$", start));
    expect(returnsBlock).toMatch(/id\s+uuid/);
    expect(returnsBlock).toMatch(/parent_id\s+uuid/);
    expect(returnsBlock).toMatch(/name\s+text/);
    expect(returnsBlock).toMatch(/type\s+text/);
    expect(returnsBlock).toMatch(/path\s+extensions\.ltree/);

    const start2 = codeNoComments.indexOf("create or replace function property.locations_for_property");
    const end2 = codeNoComments.indexOf("comment on function property.locations_for_property");
    const block = codeNoComments.slice(start2, end2);
    expect(block).toMatch(/order by l\.path/);
  });

  it("api.locations_for_property() is a thin SECURITY DEFINER delegate, holding no logic of its own", () => {
    const start = codeNoComments.indexOf("create or replace function api.locations_for_property");
    const end = codeNoComments.indexOf("comment on function api.locations_for_property");
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from property\.locations_for_property\(p_property_id\);/);
  });

  it("revokes property.locations_for_property() from every role — reachable only as a nested call, matching property.my_assets()'s exact posture", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function property\.locations_for_property\(uuid\) from public, anon, authenticated, service_role/
    );
  });

  it("grants api.locations_for_property() to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.locations_for_property\(uuid\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.locations_for_property\(uuid\) to authenticated/
    );
  });

  it("does not re-grant USAGE on schema api — already granted in 0031", () => {
    expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
  });
});
