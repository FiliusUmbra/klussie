// Keeps 0103_timeline_contract.sql inside §25's own rule: a workspace reads the segment of a
// property's timeline that falls within its own stewardship period, resolved across six real
// subject branches, ordered the same way the platform's own consumer cursor reads forward.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0103_timeline_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0103_timeline_contract migration", () => {
  it("defines exactly one function, in property, not api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(["property.timeline_segment"]);
  });

  it("unions the current stewardship window with every past one the caller's own workspace held", () => {
    expect(codeNoComments).toMatch(/from property\.properties p\s*\n\s*join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id\s*\n\s*where p\.id = p_property_id/);
    expect(codeNoComments).toMatch(/from property\.stewardship_periods sp\s*\n\s*join workspace\.current_memberships\(\) m on m\.workspace_id = sp\.workspace_id/);
    expect(codeNoComments).toMatch(/union all/);
  });

  it("resolves six subject branches: property, asset, location, service_record, conversation, message", () => {
    for (const branch of ["'property'", "'asset'", "'location'", "'service_record'", "'conversation'", "'message'"]) {
      expect(codeNoComments, `missing subject branch ${branch}`).toMatch(new RegExp(branch.replace(/'/g, "'")));
    }
    expect(codeNoComments).not.toMatch(/'document'/);
    expect(codeNoComments).not.toMatch(/'maintenance_obligation'/);
  });

  it("resolves an engagement-bound conversation's property through work.engagements and work.requests", () => {
    expect(codeNoComments).toMatch(/left join work\.engagements e on e\.id = c\.engagement_id/);
    expect(codeNoComments).toMatch(/left join work\.requests r on r\.id = e\.request_id/);
    expect(codeNoComments).toMatch(/r\.property_id = p_property_id/);
  });

  it("excludes workspace-bound conversations by never referencing c.workspace_id", () => {
    expect(codeNoComments).not.toMatch(/c\.workspace_id/);
  });

  it("joins events to the resolved subject set and filters by the caller's own windows only", () => {
    expect(codeNoComments).toMatch(/join property_subjects ps\s*\n\s*on ps\.subject_type = e\.subject_type and ps\.subject_id = e\.subject_id/);
    expect(codeNoComments).toMatch(/exists \(\s*\n\s*select 1 from my_windows w/);
    expect(codeNoComments).toMatch(/e\.occurred_at >= w\.began_at/);
    expect(codeNoComments).toMatch(/w\.ended_at is null or e\.occurred_at < w\.ended_at/);
  });

  it("orders by occurred_at then event_id, matching the platform's own cursor index shape", () => {
    expect(codeNoComments).toMatch(/order by e\.occurred_at asc, e\.event_id asc/);
  });

  it("carries no e.workspace_id filter — correctness over partition pruning, deliberately", () => {
    expect(codeNoComments).not.toMatch(/e\.workspace_id/);
  });

  it("is stable, not security definer, empty search_path", () => {
    const start = codeNoComments.indexOf("create or replace function property.timeline_segment(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/language sql\s*\n\s*stable/);
    expect(block).not.toMatch(/security definer/);
    expect(block).toMatch(/set search_path = ''/);
  });

  it("grants execute to klussie_engine_property only — no api delegate, no client grant", () => {
    expect(codeNoComments).toMatch(/revoke all on function property\.timeline_segment\(uuid\) from public, anon, authenticated, service_role/);
    expect(codeNoComments).toMatch(/grant execute on function property\.timeline_segment\(uuid\) to klussie_engine_property/);
    expect(codeNoComments).not.toMatch(/create or replace function api\./);
    expect(codeNoComments).not.toMatch(/grant execute .* to authenticated/i);
  });
});
