// Keeps 0104_digital_twin_contract.sql inside §28's own rule: the twin itself stays
// unmaterialised, and the only thing this function returns is the narrow, named summary
// counts §28 explicitly permits — nothing nested, nothing duplicated.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0104_digital_twin_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0104_digital_twin_contract migration", () => {
  it("defines exactly one function, in property, not api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(["property.assemble_twin"]);
  });

  it("returns five live counts plus the property's own core fields — nothing nested", () => {
    const start = codeNoComments.indexOf("returns table (");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(")\nlanguage sql", start));
    for (const col of [
      "location_count",
      "asset_count",
      "document_count",
      "open_maintenance_obligation_count",
      "service_record_count",
    ]) {
      expect(block, `missing ${col}`).toMatch(new RegExp(`${col}\\s+bigint`));
    }
  });

  it("every count is a real count(*) over a real table, not a duplicated row", () => {
    const matches = [...codeNoComments.matchAll(/select count\(\*\) from ([\w.]+)/g)].map((m) => m[1]);
    expect(matches.sort()).toEqual(
      [
        "property.assets",
        "property.document_attachments",
        "property.locations",
        "work.maintenance_obligations",
        "work.service_records",
      ].sort()
    );
  });

  it("open_maintenance_obligation_count filters to status = 'open' only", () => {
    const start = codeNoComments.indexOf("select count(*) from work.maintenance_obligations");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("))", start));
    expect(block).toMatch(/mo\.status = 'open'/);
  });

  it("uses the current-steward live-membership join, the same shape resolve_property() established, not a stewardship-window scope", () => {
    expect(codeNoComments).toMatch(/from property\.properties p\s*\n\s*join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id\s*\n\s*where p\.id = p_property_id/);
    expect(codeNoComments).not.toMatch(/stewardship_periods/);
  });

  it("is stable, not security definer, empty search_path", () => {
    const start = codeNoComments.indexOf("create or replace function property.assemble_twin(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/language sql\s*\n\s*stable/);
    expect(block).not.toMatch(/security definer/);
    expect(block).toMatch(/set search_path = ''/);
  });

  it("grants execute to klussie_engine_property only — no api delegate, no client grant", () => {
    expect(codeNoComments).toMatch(/revoke all on function property\.assemble_twin\(uuid\) from public, anon, authenticated, service_role/);
    expect(codeNoComments).toMatch(/grant execute on function property\.assemble_twin\(uuid\) to klussie_engine_property/);
    expect(codeNoComments).not.toMatch(/create or replace function api\./);
    expect(codeNoComments).not.toMatch(/grant execute .* to authenticated/i);
  });
});
