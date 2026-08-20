// Keeps 0047_location_reparenting.sql inside SUPABASE_ARCHITECTURE.md §11.2 — the path
// rewrite and LocationTreeChanged in one transaction — and inside the same schema-
// qualification discipline every search_path = '' function in this codebase holds itself
// to, which ltree's own operators make easy to get wrong silently (they resolve to nothing
// under an empty search_path unless explicitly qualified, and a structural test is the only
// check available without a live database — see docs/engineering/TESTING.md §3).
//
// Structural. Behaviour — including the actual path rewrite and the event it must carry —
// is proven against staging by VERIFY_LOCATION_REPARENTING.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0047_location_reparenting.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

function fnBody() {
  const start = code.indexOf("create or replace function property.reparent_location");
  return code.slice(start, code.indexOf("\nend;\n$$;", start) + 8);
}

// For assertions on literal string values, which `code`'s string-literal stripping would
// otherwise reduce to ''.
function rawFnBody() {
  const start = codeNoComments.indexOf("create or replace function property.reparent_location");
  return codeNoComments.slice(start, codeNoComments.indexOf("\nend;\n$$;", start) + 8);
}

describe("0047_location_reparenting migration", () => {
  it("takes event_id and correlation_id as required parameters — never mints them itself", () => {
    // ADR-0022: platform.uuid_v7_at() is for backfills only, executable by no application
    // role. A live operation like this one cannot call it, so the caller must supply both.
    const sigStart = code.indexOf("create or replace function property.reparent_location(");
    const sigEnd = code.indexOf(")", code.indexOf("p_correlation_id"));
    const signature = code.slice(sigStart, sigEnd + 1);
    expect(signature).toMatch(/p_event_id\s+uuid/i);
    expect(signature).toMatch(/p_correlation_id\s+uuid/i);
    expect(code).not.toMatch(/uuid_v7_at/i);
  });

  it("schema-qualifies every ltree operator used — none of <@, @>, || appears bare", () => {
    const body = fnBody();
    // Every occurrence of the ltree infix operators must be preceded by OPERATOR(extensions.
    const bareLtreeOps = [...body.matchAll(/(?<!OPERATOR\(extensions\.)(<@|@>)/g)];
    expect(bareLtreeOps, "found an unqualified ltree operator — would not resolve under search_path = ''").toHaveLength(0);
  });

  it("qualifies nlevel and subpath with the extensions schema, every time", () => {
    const body = fnBody();
    const bareNlevel = [...body.matchAll(/[^.]nlevel\(/gi)];
    const bareSubpath = [...body.matchAll(/[^.]subpath\(/gi)];
    expect(bareNlevel, "found unqualified nlevel() — would not resolve under search_path = ''").toHaveLength(0);
    expect(bareSubpath, "found unqualified subpath() — would not resolve under search_path = ''").toHaveLength(0);
  });

  it("rewrites path and parent_id for the whole subtree in one UPDATE, not a loop", () => {
    const body = fnBody();
    expect(body).toMatch(/update property\.locations/i);
    expect(body).toMatch(/where path OPERATOR\(extensions\.<@\) v_old_path/i);
    expect(body).not.toMatch(/for \w+ in \(?select/i); // no row-by-row loop
    expect(body).not.toMatch(/with recursive/i);
  });

  it("uses ltree's own || operator for the subtree rewrite, not text concatenation", () => {
    const body = fnBody();
    expect(body).toMatch(
      /path\s*=\s*case[\s\S]*?v_new_path OPERATOR\(extensions\.\|\|\) extensions\.subpath\(path, extensions\.nlevel\(v_old_path\)\)/i
    );
  });

  it("guards the moved location itself with an explicit CASE, never calling subpath() at the boundary", () => {
    // ltree's subpath(path, offset) raises "invalid positions" (SQLSTATE 22023) when offset
    // equals the path's own nlevel — exactly the case for the moved row itself, whose path
    // equals v_old_path. Caught only by running this migration against real data (staging,
    // 2026-08-19): reparent_location() failed on every single call, unconditionally, since
    // the moved row always satisfies this boundary and is always included in `where path <@
    // v_old_path`. The fix is an explicit CASE that assigns v_new_path directly for the
    // moved row, never reaching subpath() for it at all.
    const body = fnBody();
    expect(body).toMatch(
      /case\s*\n\s*when extensions\.nlevel\(path\) = extensions\.nlevel\(v_old_path\) then v_new_path/i
    );
  });

  it("refuses a re-parent that would create a cycle", () => {
    const body = fnBody();
    expect(body).toMatch(/v_new_parent_path OPERATOR\(extensions\.<@\) v_old_path/i);
    expect(body).toMatch(/raise exception/i);
  });

  it("refuses a re-parent across properties", () => {
    const body = fnBody();
    expect(body).toMatch(/v_new_property_id <> v_property_id/i);
  });

  it("is a no-op — no event, no write — when the new parent equals the current one", () => {
    const body = fnBody();
    expect(body).toMatch(/p_new_parent_id is not distinct from v_old_parent_id/i);
    const returnIndex = body.search(/p_new_parent_id is not distinct from v_old_parent_id[\s\S]*?return;/i);
    expect(returnIndex).toBeGreaterThan(-1);
  });

  it("emits LocationTreeChanged inside the same function, after the rewrite, never before", () => {
    const body = fnBody();
    const updateIndex = body.indexOf("update property.locations");
    const emitIndex = body.indexOf("platform.emit_event(");
    expect(updateIndex).toBeGreaterThan(-1);
    expect(emitIndex).toBeGreaterThan(updateIndex);

    // The literal event type — read from the raw (non-string-stripped) body, which `code`
    // would see as ''.
    expect(rawFnBody()).toMatch(/p_event_type\s*=>\s*'location\.location\.tree_changed'/i);
  });

  it("names the moved location as the event's subject", () => {
    const body = rawFnBody();
    expect(body).toMatch(/p_subject_type\s*=>\s*'location'/i);
    expect(body).toMatch(/p_subject_id\s*=>\s*p_location_id/i);
  });

  it("resolves the event's workspace from the property's current steward, not a caller-supplied value", () => {
    const body = fnBody();
    expect(body).toMatch(/select steward_workspace_id into v_steward\s+from property\.properties/i);
    expect(body).toMatch(/p_workspace_id\s*=>\s*v_steward/i);
  });

  it("is granted to klussie_engine_property, not withheld the way the containment functions are", () => {
    expect(code).toMatch(
      /grant execute on function property\.reparent_location\([^)]*\)\s*\n?\s*to klussie_engine_property/i
    );
  });

  it("revokes from every client-facing role", () => {
    expect(code).toMatch(
      /revoke all on function property\.reparent_location\([^)]*\)\s*\n?\s*from public, anon, authenticated, service_role/i
    );
  });

  it("locks the search_path", () => {
    expect(code).toMatch(/set search_path = ''/);
  });
});
