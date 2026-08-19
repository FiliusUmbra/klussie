// Keeps 0137_maintenance_read_delegates.sql (Platform Activation Slice 1, WP 1.2) inside
// its own stated rules: the caller-membership check now lives inside the work.* logic
// functions themselves (not only the delegate), via an EXISTS predicate matching
// platform.list_audit_records()'s own shape, and the delegates hold no logic of their own.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0137_maintenance_read_delegates.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf(`comment on function ${functionName}`);
  return code.slice(start, end);
}

describe("0137_maintenance_read_delegates migration", () => {
  it("work.my_maintenance_schedules() checks the caller's real membership via an EXISTS predicate, not a join", () => {
    const block = bodyOf("work.my_maintenance_schedules", codeNoComments);
    expect(block).not.toMatch(/security definer/i);
    expect(block).toMatch(/exists \(select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id\)/);
  });

  it("work.my_maintenance_obligations() checks the caller's real membership the identical way, and still computes is_overdue at read time", () => {
    const block = bodyOf("work.my_maintenance_obligations", codeNoComments);
    expect(block).not.toMatch(/security definer/i);
    expect(block).toMatch(/exists \(select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id\)/);
    expect(block).toMatch(/\(o\.status = 'open' and o\.due_on < current_date\) as is_overdue/);
  });

  it("both api delegates are thin SECURITY DEFINER pass-throughs, holding no logic of their own", () => {
    const schedulesBlock = bodyOf("api.my_maintenance_schedules", codeNoComments);
    expect(schedulesBlock).toMatch(/security definer/i);
    expect(schedulesBlock).toMatch(/select \* from work\.my_maintenance_schedules\(p_workspace_id\);/);

    const obligationsBlock = bodyOf("api.my_maintenance_obligations", codeNoComments);
    expect(obligationsBlock).toMatch(/security definer/i);
    expect(obligationsBlock).toMatch(/select \* from work\.my_maintenance_obligations\(p_workspace_id\);/);
  });

  it("grants both api delegates to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.my_maintenance_schedules\(uuid\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.my_maintenance_schedules\(uuid\) to authenticated/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function api\.my_maintenance_obligations\(uuid\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.my_maintenance_obligations\(uuid\) to authenticated/
    );
  });

  it("revokes both work.* functions from public/anon/authenticated/service_role — the client-facing surface is the delegate only", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function work\.my_maintenance_schedules\(uuid\) from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function work\.my_maintenance_obligations\(uuid\) from public, anon, authenticated, service_role/
    );
  });

  it("does not re-grant to klussie_engine_work — 0074's own grant already stands and is left untouched", () => {
    expect(codeNoComments).not.toMatch(/grant execute on function work\.my_maintenance_schedules.*klussie_engine_work/s);
    expect(codeNoComments).not.toMatch(/grant execute on function work\.my_maintenance_obligations.*klussie_engine_work/s);
  });

  it("does not re-grant USAGE on schema api — already granted in 0031", () => {
    expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
  });
});
