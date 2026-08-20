// Keeps 0153_my_requests_full_shape.sql (Platform Activation Slice 2, WP 2.6) inside its
// own stated rules: my_requests() is dropped by its exact prior (5-column) signature
// before being recreated with the full row shape, and its real membership check stays
// unchanged from WP 2.1.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0153_my_requests_full_shape.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0153_my_requests_full_shape migration", () => {
  it("drops the prior 5-column signature before recreating it — a return-type change needs the same discipline as a parameter change", () => {
    expect(codeNoComments).toMatch(/drop function if exists work\.my_requests\(uuid\)/);
    expect(codeNoComments).toMatch(/drop function if exists api\.my_requests\(uuid\)/);
  });

  describe("work.my_requests()", () => {
    const block = bodyOf("work.my_requests", codeNoComments);

    it("keeps its own real membership check unchanged from WP 2.1", () => {
      expect(block).toMatch(
        /join workspace\.current_memberships\(\) m on m\.workspace_id = p_workspace_id/
      );
    });

    it("returns the full row, matching resolve_request()'s own columns, plus the directed-booking columns", () => {
      for (const col of [
        "r.requesting_workspace_id", "r.property_id", "r.asset_id", "r.location_id",
        "r.category_id", "r.service_id", "r.details", "r.when_pref", "r.budget",
        "r.status", "r.workflow_instance_id", "r.created_at", "r.updated_at",
        "r.directed_workspace_id", "r.directed_until", "r.auto_accept_max",
      ]) {
        expect(block, `missing column: ${col}`).toContain(col);
      }
    });
  });

  it("api.my_requests() is a thin SECURITY DEFINER pass-through, unchanged in shape", () => {
    const block = bodyOf("api.my_requests", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from work\.my_requests\(p_workspace_id\)/);
  });

  it("grants api.my_requests() to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.my_requests\(uuid\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(/grant execute on function api\.my_requests\(uuid\) to authenticated/);
  });

  it("keeps work.my_requests() unreachable by any application role", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function work\.my_requests\(uuid\) from public, anon, authenticated, service_role/
    );
  });
});
